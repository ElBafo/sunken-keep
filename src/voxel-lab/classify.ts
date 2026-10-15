import {
  DEPTH_LAYERS,
  LAYER_SIZE,
  MAT_DRY,
  MAT_MOSS,
  MAT_WET,
  MaterialId
} from './constants';

export function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Dark green / wet moss in the dungeon palette. */
export function isMoss(r: number, g: number, b: number): boolean {
  return g > r + 10 && g > b + 4 && g < 155 && r < 120;
}

export function hash32(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function classifyPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  x: number,
  y: number
): { steps: number; material: MaterialId } | null {
  if (a < 16) return null;
  const L = luma(r, g, b);
  const steps = Math.max(1, Math.min(DEPTH_LAYERS, 1 + Math.round(L * 2)));
  if (isMoss(r, g, b)) return { steps, material: MAT_MOSS };
  if (L > 0.38 && hash32(x, y) % 11 < 2) return { steps, material: MAT_WET };
  return { steps, material: MAT_DRY };
}

/** Never 0 — black texels still pack a material nibble. */
export function packVoxel(r: number, g: number, b: number, material: MaterialId): number {
  return ((material + 1) << 24) | (r << 16) | (g << 8) | b;
}

export function unpackMaterial(packed: number): MaterialId {
  return (((Math.abs(packed) >>> 24) & 0xff) - 1) as MaterialId;
}

export function unpackRGB(packed: number): [number, number, number] {
  const p = Math.abs(packed);
  return [(p >>> 16) & 255, (p >>> 8) & 255, p & 255];
}

export function srgb8ToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export interface VolumeFromPixels {
  volume: Uint32Array;
  dims: [number, number, number];
  voxelCount: number;
}

/**
 * One voxel column per opaque texel. Image y=0 is the top of the PNG;
 * voxel v=0 is the bottom of the wall / south edge of a floor tile.
 */
export function volumeFromImageData(image: {
  width: number;
  height: number;
  data: ArrayLike<number>;
}): VolumeFromPixels {
  const W = image.width;
  const H = image.height;
  const D = DEPTH_LAYERS;
  const volume = new Uint32Array(W * H * D);
  let voxelCount = 0;
  for (let py = 0; py < H; py++) {
    const v = H - 1 - py;
    for (let u = 0; u < W; u++) {
      const i = (py * W + u) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const a = image.data[i + 3];
      const c = classifyPixel(r, g, b, a, u, v);
      if (!c) continue;
      voxelCount += 1;
      const packed = packVoxel(r, g, b, c.material);
      for (let k = 0; k < c.steps; k++) {
        volume[u + v * W + k * W * H] = packed;
      }
    }
  }
  return { volume, dims: [W, H, D], voxelCount };
}

export function layerSize(): number {
  return LAYER_SIZE;
}
