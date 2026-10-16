import type { Material, Object3D, WebGLRenderer } from 'three';

export type ShadowLight = {
  castShadow: boolean;
  shadow?: { map: { dispose: () => void } | null };
};

type ShadowMesh = Object3D & {
  isMesh?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  material?: Material | Material[];
  userData: { noShadow?: boolean };
};

/**
 * Toggle lab shadows in a way Three.js actually honours after the first
 * compile: renderer.shadowMap, every light.castShadow, every mesh
 * cast/receive flag, and material.needsUpdate so shaders recompile.
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
      mesh.castShadow = on;
      mesh.receiveShadow = on;
      if (on) {
        meshCast += 1;
        meshReceive += 1;
      }
      bumpMaterials(mesh);
    });
  }

  return { meshCast, meshReceive, lightCast };
}

function bumpMaterials(mesh: ShadowMesh): void {
  const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  for (const mat of mats) {
    mat.needsUpdate = true;
  }
}
