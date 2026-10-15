import { DEPTH_LAYERS, MAT_DRY, MAT_MOSS, MAT_WET, MaterialId } from './constants';

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

export interface VolumeFromPixels {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
  roughness: Uint8Array;
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
  const volume = new Uint8Array(W * H * D);
  const roughness = new Uint8Array(W * H);
  const lum = new Float32Array(W * H);
  const classified: Array<{ steps: number; material: MaterialId } | null> = new Array(W * H);
  let voxelCount = 0;
  for (let py = 0; py < H; py++) {
    const v = H - 1 - py;
    for (let u = 0; u < W; u++) {
      const i = (py * W + u) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const a = image.data[i + 3];
      const idx = u + v * W;
      lum[idx] = luma(r, g, b);
      classified[idx] = classifyPixel(r, g, b, a, u, v);
    }
  }
  // 5×5 blur so noisy brick faces share a depth and greedy-merge.
  const smooth = new Float32Array(W * H);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let s = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const y = v + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const x = u + dx;
          if (x < 0 || x >= W) continue;
          s += lum[x + y * W];
          n += 1;
        }
      }
      smooth[u + v * W] = s / n;
    }
  }
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const idx = u + v * W;
      const c = classified[idx];
      if (!c) continue;
      voxelCount += 1;
      const steps = Math.max(1, Math.min(DEPTH_LAYERS, 1 + Math.round(smooth[idx] * 2)));
      roughness[idx] = c.material === MAT_MOSS ? 245 : c.material === MAT_WET ? 36 : 178;
      for (let k = 0; k < steps; k++) {
        volume[idx + k * W * H] = 1;
      }
    }
  }
  return { volume, dims: [W, H, D], voxelCount, roughness };
}
