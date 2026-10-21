import * as THREE from 'three';
import { loadPng, type PngPixels } from '../voxel-lab/materials';
import { CEILING_VARIANTS, CRACKED_CEILING_FILE } from './constants';
import { enablePaintedSampling, isPlankCeilingFile, weatherPlankPixels } from './painted';
import { mappedCeilingFile } from './layout';
import { pickVariant } from './variants';

type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

/** Nearest-neighbour resize so a 128 crack overlay matches a 256 ceiling. */
export function scaleNearest(src: Pixels, width: number, height: number): Pixels {
  if (src.width === width && src.height === height) return src;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      const [r, g, b, a] = sample(src, sx, sy);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sample(
  src: Pixels,
  x: number,
  y: number
): [number, number, number, number] {
  const u = Math.min(src.width - 1, Math.max(0, x));
  const v = Math.min(src.height - 1, Math.max(0, y));
  const i = (v * src.width + u) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

/**
 * Floor-1 ceiling with the dressing crack stained in, and a jagged hole along
 * the bright ridge so light shows through the voxel volume.
 */
export function compositeCrackedCeiling(ceil: Pixels, crack: Pixels): Pixels {
  const W = ceil.width;
  const H = ceil.height;
  const data = new Uint8ClampedArray(W * H * 4);
  const hole = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const sx = Math.round((x * (crack.width - 1)) / Math.max(1, W - 1));
      const sy = Math.round((y * (crack.height - 1)) / Math.max(1, H - 1));
      const [cr, cg, cb, ca] = sample(crack, sx, sy);
      let r = ceil.data[i];
      let g = ceil.data[i + 1];
      let b = ceil.data[i + 2];
      let a = ceil.data[i + 3] || 255;
      if (ca > 8) {
        const k = ca / 255;
        r = Math.round(r * (1 - k * 0.82) + cr * k * 0.18);
        g = Math.round(g * (1 - k * 0.82) + cg * k * 0.18);
        b = Math.round(b * (1 - k * 0.82) + cb * k * 0.18);
        if (ca > 90 && luma(cr, cg, cb) > 0.58) hole[y * W + x] = 1;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  // Widen the gap one texel so it reads as a split, not a hairline.
  const dilated = hole.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!hole[y * W + x]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        dilated[(y + dy) * W + (x + dx)] = 1;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!dilated[y * W + x]) continue;
      const i = (y * W + x) * 4;
      data[i + 3] = 0;
      if (hole[y * W + x]) {
        data[i] = 210;
        data[i + 1] = 224;
        data[i + 2] = 255;
      } else {
        data[i] = Math.max(0, data[i] - 70);
        data[i + 1] = Math.max(0, data[i + 1] - 70);
        data[i + 2] = Math.max(0, data[i + 2] - 55);
      }
    }
  }
  return { width: W, height: H, data };
}

export function crackedCeilingHasGap(image: Pixels): boolean {
  let holes = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] < 16) holes += 1;
  }
  return holes > 20;
}

export function isBeamCeiling(tx: number, tz: number, beams: Array<{ x: number; y: number }>): boolean {
  return beams.some((b) => b.x === tx && b.y === tz);
}

export async function loadCrackedCeiling(): Promise<PngPixels> {
  const variant = mappedCeilingFile(10, 1) ?? pickVariant(CEILING_VARIANTS, 10, 1, 'C');
  const [ceil, crack] = await Promise.all([loadPng(variant), loadPng('../atmo/ceiling_crack.png')]);
  const overlay =
    crack.data.width < ceil.data.width || crack.data.height < ceil.data.height
      ? scaleNearest(crack.data, ceil.data.width, ceil.data.height)
      : crack.data;
  if (isPlankCeilingFile(variant)) weatherPlankPixels(ceil.data.data);
  const image = compositeCrackedCeiling(ceil.data, overlay);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');
  const put = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  ctx.putImageData(put, 0, 0);
  const texture = new THREE.Texture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  enablePaintedSampling(texture);
  const img = new Image();
  img.width = image.width;
  img.height = image.height;
  return { img, data: put, texture };
}

export { CRACKED_CEILING_FILE };
