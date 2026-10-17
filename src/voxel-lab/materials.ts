import * as THREE from 'three';
import { ROUGH_MATTE, ROUGH_WET } from './constants';
import type { MeshArrays } from './mesher';

export interface PngPixels {
  img: HTMLImageElement;
  data: ImageData;
  texture: THREE.Texture;
}

export function texUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  if (file.startsWith('../')) {
    return `${base}proto3d/${file.slice(3)}`;
  }
  return `${base}proto3d/tex3d/${file}`;
}

export async function loadPng(file: string): Promise<PngPixels> {
  const url = texUrl(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { img, data, texture };
}

/**
 * Packed PBR map from per-texel roughness:
 * R = clearcoat (wet only), G = roughness, A = specular intensity.
 */
export function pbrMap(data: Uint8Array, w: number, h: number): THREE.DataTexture {
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

export function voxelMaterial(map: THREE.Texture, pbr: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: pbr,
    roughness: 1,
    metalness: 0,
    ior: 1.45,
    specularIntensity: 0.35,
    specularIntensityMap: pbr,
    clearcoat: 0.4,
    clearcoatMap: pbr,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0,
    flatShading: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

export function geometryFrom(mesh: MeshArrays): THREE.BufferGeometry | null {
  if (mesh.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  g.setIndex(mesh.indices);
  g.computeBoundingSphere();
  return g;
}
