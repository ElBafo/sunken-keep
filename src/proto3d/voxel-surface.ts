import * as THREE from 'three';
import {
  SURFACE_LIGHT_GLSL,
  createSurfaceLightLocal,
  createSurfaceLightShared,
  type SurfaceLightLocal,
  type SurfaceLightShared
} from './surface-light';

export const VOXEL_LOOK_CACHE_KEY = 'voxel-look-frag-v1';

const VOXEL_GLOSS_GLSL = /* glsl */ `
uniform sampler2D uPbrMap;
uniform float uHasPbr;

vec3 applyVoxelLook(vec3 albedo, vec3 worldPos) {
  vec3 lit = applySurfaceLight(albedo, worldPos);
  if (uHasPbr < 0.5 || uDebugMode > 0.5) return lit;
  vec4 pbr = texture2D(uPbrMap, vUv);
  float specMask = pbr.a;
  if (specMask < 0.03) return lit;
  vec3 N = normalize(cross(dFdx(worldPos), dFdy(worldPos)));
  vec3 V = normalize(cameraPosition - worldPos);
  float ndv = max(0.0, abs(dot(N, V)));
  float rough = pbr.g;
  float gloss = pow(ndv, mix(5.0, 32.0, 1.0 - rough)) * specMask;
  gloss += pbr.r * pow(ndv, 18.0) * 0.16;
  gloss = min(gloss, 0.22);
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
      uPbrMap: { value: pbr },
      uHasPbr: { value: pbr ? 1 : 0 }
    };
  } else {
    material.userData.voxelLookUniforms.uPbrMap.value = pbr;
    material.userData.voxelLookUniforms.uHasPbr.value = pbr ? 1 : 0;
  }
  material.customProgramCacheKey = () => VOXEL_LOOK_CACHE_KEY;
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
        `#include <color_fragment>
{
  vec3 albedo = diffuseColor.rgb;
  diffuseColor.rgb = applyVoxelLook(albedo, vSurfWorldPos);
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
