import * as THREE from 'three';
import { CUTOUT_ALPHA_TEST } from './constants';

type Pixels = { width: number; height: number; data: ArrayLike<number> };

export function isPaintedShellFile(file: string): boolean {
  return file.startsWith('floor_') || file.startsWith('ceiling');
}

/** Painted 256 tiles: crisp texels up close, nearest mips in the distance. */
export function enablePaintedSampling(tex: THREE.Texture): void {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}

function lumaAt(image: Pixels, x: number, y: number): number {
  const u = Math.min(image.width - 1, Math.max(0, x));
  const v = Math.min(image.height - 1, Math.max(0, y));
  const i = (v * image.width + u) * 4;
  return (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
}

/** Very small albedo-derived bump so joints read without voxel steps. */
export function normalFromAlbedo(image: Pixels, strength = 0.55): THREE.DataTexture {
  const W = image.width;
  const H = image.height;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = lumaAt(image, x + 1, y) - lumaAt(image, x - 1, y);
      const dy = lumaAt(image, x, y + 1) - lumaAt(image, x, y - 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * W + x) * 4;
      rgba[i] = Math.round((nx * 0.5 + 0.5) * 255);
      rgba[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      rgba[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      rgba[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

export function paintedShellMaterial(
  map: THREE.Texture,
  normal: THREE.Texture | undefined,
  file: string
): THREE.MeshPhysicalMaterial {
  const water = file === 'floor_water.png';
  const cutout = file.startsWith('ceiling_cracked');
  enablePaintedSampling(map);
  return new THREE.MeshPhysicalMaterial({
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.14, 0.14),
    roughness: water ? 0.62 : 0.92,
    metalness: 0,
    clearcoat: water ? 0.12 : 0,
    clearcoatRoughness: water ? 0.45 : 1,
    envMapIntensity: 0,
    alphaTest: cutout ? CUTOUT_ALPHA_TEST : 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}
