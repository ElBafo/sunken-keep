import * as THREE from 'three';
import { textureFromPixels } from '../voxel-lab/materials';
import { CUTOUT_ALPHA_TEST } from './constants';

type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** Darken rubble so it stays below the wall albedo even under a torch. */
export const RUBBLE_TINT = new THREE.Color(0.66, 0.66, 0.66);
/**
 * Fallback multiply when plank pixels cannot be rewritten (node tests).
 * Cooler and a little darker than the reddish source oak.
 */
export const PLANK_TINT = new THREE.Color(0.7, 0.82, 0.96);

export function isPaintedShellFile(file: string): boolean {
  return file.startsWith('floor_') || file.startsWith('ceiling');
}

export function isRubbleCeilingFile(file: string): boolean {
  return file.startsWith('ceiling_rubble_');
}

export function isPlankCeilingFile(file: string): boolean {
  return file.startsWith('ceiling_planks_');
}

/** Painted 256 tiles: crisp texels up close, nearest mips in the distance. */
export function enablePaintedSampling(tex: THREE.Texture): void {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}

/** Repeat so UV scale > 1 does not clamp-smear at cell edges. */
export function enableRubbleRepeat(tex: THREE.Texture): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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

/**
 * Grey-brown weathered oak: drop ~45% saturation, pull hue toward neutral
 * brown, dim a little. Original planks sit near RGB(50, 37, 28).
 */
export function weatherPlankPixel(r: number, g: number, b: number): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = 0.52;
  const dim = 0.88;
  return [
    (luma + (r - luma) * sat) * dim * 0.94,
    (luma + (g - luma) * sat) * dim * 0.98,
    (luma + (b - luma) * sat) * dim * 1.08
  ];
}

export function weatherPlankPixels(data: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const [r, g, b] = weatherPlankPixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    data[i] = Math.round(Math.min(255, Math.max(0, r * 255)));
    data[i + 1] = Math.round(Math.min(255, Math.max(0, g * 255)));
    data[i + 2] = Math.round(Math.min(255, Math.max(0, b * 255)));
  }
}

/** Rewrite plank albedo into a new map. Leaves the source texture untouched. */
export function weatheredPlankMap(map: THREE.Texture, pixels?: Pixels): THREE.Texture {
  if (!pixels || !pixels.width || !pixels.height) return map;
  const data = new Uint8ClampedArray(pixels.data);
  weatherPlankPixels(data);
  const tex = textureFromPixels({ width: pixels.width, height: pixels.height, data });
  tex.userData.plankWeathered = true;
  return tex;
}

export function paintedShellMaterial(
  map: THREE.Texture,
  normal: THREE.Texture | undefined,
  file: string
): THREE.MeshPhysicalMaterial {
  const water = file === 'floor_water.png';
  const cutout = file.startsWith('ceiling_cracked');
  const rubble = isRubbleCeilingFile(file);
  const plank = isPlankCeilingFile(file);
  enablePaintedSampling(map);
  if (rubble) {
    enableRubbleRepeat(map);
    if (normal) enableRubbleRepeat(normal);
  }
  const mat = new THREE.MeshPhysicalMaterial({
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
  if (rubble) mat.color.copy(RUBBLE_TINT);
  else if (plank && !map.userData.plankWeathered) mat.color.copy(PLANK_TINT);
  return mat;
}
