import * as THREE from 'three';
import {
  SURFACE_LIGHT_GLSL,
  createSurfaceLightLocal,
  createSurfaceLightShared,
  type SurfaceLightLocal,
  type SurfaceLightShared
} from './surface-light';

export const VOXEL_LOOK_CACHE_KEY = 'voxel-look-frag-v4';

function dummyPbrTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([0, 255, 0, 0]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

const FALLBACK_PBR = dummyPbrTexture();

const VOXEL_GLOSS_GLSL = /* glsl */ `
uniform sampler2D uPbrMap;
uniform float uHasPbr;

vec3 applyVoxelLook(vec3 albedo, vec3 worldPos, vec2 uv) {
  vec3 lit = applySurfaceLight(albedo, worldPos);
  if (uHasPbr < 0.5 || uDebugMode > 0.5) return lit;
  vec4 pbr = texture2D(uPbrMap, uv);
  float specMask = pbr.a;
  if (specMask < 0.03) return lit;
  // Screen-space N on greedy step faces can face the camera; only glint
  // where a lab light already reaches the texel, never as a self-glow.
  float litAmt = max(0.0, dot(lit, vec3(0.333333)) - 0.07);
  if (litAmt <= 0.0) return lit;
  vec3 N = normalize(cross(dFdx(worldPos), dFdy(worldPos)));
  vec3 V = normalize(cameraPosition - worldPos);
  float ndv = max(0.0, abs(dot(N, V)));
  float rough = pbr.g;
  float gloss = pow(ndv, mix(5.0, 32.0, 1.0 - rough)) * specMask;
  gloss += pbr.r * pow(ndv, 18.0) * 0.16;
  gloss = min(gloss, 0.22) * clamp(litAmt * 8.0, 0.0, 1.0);
  return lit + vec3(gloss) * vec3(1.0, 0.94, 0.82);
}
`;

export function patchVoxelLookMaterial(
  material: THREE.MeshBasicMaterial,
  shared: SurfaceLightShared,
  local: SurfaceLightLocal,
  pbr: THREE.Texture | null
): void {
  material.userData.surfaceLightLocal = local;
  material.userData.voxelLookPatched = true;
  material.vertexColors = false;
  material.needsUpdate = true;
  if (!material.userData.voxelLookUniforms) {
    material.userData.voxelLookUniforms = {
      uPbrMap: { value: pbr ?? FALLBACK_PBR },
      uHasPbr: { value: pbr ? 1 : 0 }
    };
  } else {
    material.userData.voxelLookUniforms.uPbrMap.value = pbr ?? FALLBACK_PBR;
    material.userData.voxelLookUniforms.uHasPbr.value = pbr ? 1 : 0;
  }
  material.customProgramCacheKey = () =>
    `${VOXEL_LOOK_CACHE_KEY}:m${material.map ? 1 : 0}:c${material.vertexColors ? 1 : 0}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, local, material.userData.voxelLookUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSurfWorldPos;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vSurfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${SURFACE_LIGHT_GLSL}
${VOXEL_GLOSS_GLSL}
varying vec3 vSurfWorldPos;`
      )
      .replace(
        '#include <color_fragment>',
        `// Lab look: do not multiply baked Gouraud (USE_COLOR / vColor).
{
  vec3 albedo = diffuseColor.rgb;
#ifdef USE_MAP
  diffuseColor.rgb = applyVoxelLook(albedo, vSurfWorldPos, vMapUv);
#else
  diffuseColor.rgb = applySurfaceLight(albedo, vSurfWorldPos);
#endif
}`
      );
  };
}

export function unpatchVoxelLookMaterial(material: THREE.MeshBasicMaterial): void {
  if (!material.userData.voxelLookPatched) return;
  material.userData.voxelLookPatched = false;
  material.vertexColors = true;
  material.customProgramCacheKey = () => '';
  material.onBeforeCompile = () => {};
  material.needsUpdate = true;
}

export function makeVoxelShared(): SurfaceLightShared {
  return createSurfaceLightShared();
}

export function makeVoxelLocal(): SurfaceLightLocal {
  return createSurfaceLightLocal();
}
