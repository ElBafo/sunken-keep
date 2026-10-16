import type { Material, Object3D, WebGLRenderer } from 'three';

export type ShadowLight = {
  castShadow: boolean;
  shadow?: { map: { dispose: () => void } | null };
};

export type ShadowMesh = Object3D & {
  isMesh?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  material?: Material | Material[];
  customDepthMaterial?: Material;
  customDistanceMaterial?: Material;
  userData: { noShadow?: boolean; castWhenOn?: boolean; receiveWhenOn?: boolean };
};

/**
 * Toggle lab shadows in a way Three.js actually honours after the first
 * compile: renderer.shadowMap, every light.castShadow, every mesh
 * cast/receive flag, and material.needsUpdate so shaders recompile.
 *
 * Also bump customDepthMaterial / customDistanceMaterial — WebKit otherwise
 * first-frames casters (chest, slime, crate, pillar, ceiling) solid black
 * until something later sets needsUpdate (e.g. the see-through toggle).
 */
export function applyShadowToggle(opts: {
  on: boolean;
  renderer: Pick<WebGLRenderer, 'shadowMap'> | { shadowMap: { enabled: boolean; needsUpdate: boolean } };
  lights: Array<{ light: ShadowLight; active: boolean }>;
  roots: Object3D[];
}): { meshCast: number; meshReceive: number; lightCast: number } {
  const { on, renderer, lights, roots } = opts;
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.needsUpdate = true;

  let lightCast = 0;
  for (const { light, active } of lights) {
    const cast = on && active;
    light.castShadow = cast;
    if (cast) lightCast += 1;
    if (!on && light.shadow?.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }

  let meshCast = 0;
  let meshReceive = 0;
  for (const root of roots) {
    root.traverse((obj) => {
      const mesh = obj as ShadowMesh;
      if (!mesh.isMesh) return;
      if (mesh.userData?.noShadow) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        bumpMaterials(mesh);
        return;
      }
      const cast = on && mesh.userData.castWhenOn !== false;
      const receive = on && mesh.userData.receiveWhenOn !== false;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      if (cast) meshCast += 1;
      if (receive) meshReceive += 1;
      bumpMaterials(mesh);
    });
  }

  return { meshCast, meshReceive, lightCast };
}

/** Recompile all mesh + custom depth/distance materials after shadow maps exist. */
export function recompileShadowShaders(roots: Object3D[]): void {
  for (const root of roots) {
    root.traverse((obj) => {
      const mesh = obj as ShadowMesh;
      if (mesh.isMesh) bumpMaterials(mesh);
    });
  }
}

export function bumpMaterials(mesh: ShadowMesh): void {
  const mats: Material[] = [];
  if (Array.isArray(mesh.material)) mats.push(...mesh.material);
  else if (mesh.material) mats.push(mesh.material);
  if (mesh.customDepthMaterial) mats.push(mesh.customDepthMaterial);
  if (mesh.customDistanceMaterial) mats.push(mesh.customDistanceMaterial);
  for (const mat of mats) mat.needsUpdate = true;
}
