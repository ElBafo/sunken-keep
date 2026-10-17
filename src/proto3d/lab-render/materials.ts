import * as THREE from 'three';
import { ROUGH_MATTE, ROUGH_WET } from '../../voxel-lab/constants';
import { CUTOUT_ALPHA_TEST } from '../constants';

/** Packed PBR: R = clearcoat (wet), G = roughness, A = specular intensity. */
export function pbrMapFromRoughness(data: Uint8Array, w: number, h: number): THREE.DataTexture {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const rough = data[i];
    const wet = rough <= ROUGH_WET;
    const matte = rough >= ROUGH_MATTE;
    rgba[i * 4] = wet ? 90 : 0;
    rgba[i * 4 + 1] = rough;
    rgba[i * 4 + 2] = rough;
    rgba[i * 4 + 3] = wet ? 70 : matte ? 6 : 36;
  }
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Same physical material on voxel and flat so the LOD boundary does not jump. */
export function dungeonPhysicalMaterial(
  map: THREE.Texture,
  pbr: THREE.Texture | null,
  opts?: { cutout?: boolean }
): THREE.MeshPhysicalMaterial {
  const cutout = !!opts?.cutout;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: pbr ?? undefined,
    roughness: pbr ? 1 : 0.7,
    metalness: 0,
    ior: 1.45,
    specularIntensity: 0.35,
    specularIntensityMap: pbr ?? undefined,
    clearcoat: pbr ? 0.4 : 0,
    clearcoatMap: pbr ?? undefined,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0,
    flatShading: false,
    transparent: cutout,
    alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

export function paintedStandardMaterial(
  map: THREE.Texture,
  opts?: { cutout?: boolean }
): THREE.MeshStandardMaterial {
  const cutout = !!opts?.cutout;
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.72,
    metalness: 0,
    envMapIntensity: 0,
    transparent: cutout,
    alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}
