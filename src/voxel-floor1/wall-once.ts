import { faceHash } from './variants';

/** Image-buffer shape shared with `volumeFromImageData` / canvas `ImageData`. */
export type PixelGrid = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array | ArrayLike<number>;
};

/**
 * Artie's 128px tiles cover a 2 m face as two vertical repeats. A strong
 * feature (hole, patch, damp bloom) lives in both repeats of the PNG; we keep
 * it in one slot and fill the other with the family base so it reads once.
 */
export const STRONG_V_REPEATS = 2;
export const STRONG_H_REPEATS = 1;

export const STRONG_ONCE_BASE: Record<string, string> = {
  'walls_floor1/brick_missing.png': 'walls_floor1/brick_base.png',
  'walls_floor1/brick_patched.png': 'walls_floor1/brick_base.png',
  'walls_floor1/ashlar_patched.png': 'walls_floor1/ashlar_clean.png',
  'walls_floor1/ashlar_damp.png': 'walls_floor1/ashlar_clean.png',
  'walls_floor1/banded_2.png': 'walls_floor1/banded_1.png',
  'walls_floor1/etched_2.png': 'walls_floor1/etched_1.png'
};

export type OnceSlot = {
  v: number;
  h: number;
  repeatsV: number;
  repeatsH: number;
};

export function strongBaseFile(file: string): string | undefined {
  return STRONG_ONCE_BASE[file];
}

export function onceSlotFor(
  x: number,
  y: number,
  face: string,
  repeatsV = STRONG_V_REPEATS,
  repeatsH = STRONG_H_REPEATS
): OnceSlot {
  return {
    v: faceHash(x, y, face, 17) % repeatsV,
    h: repeatsH <= 1 ? 0 : faceHash(x, y, face, 19) % repeatsH,
    repeatsV,
    repeatsH
  };
}

function blitBand(
  dest: Uint8ClampedArray,
  src: PixelGrid,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  const sw = src.width;
  const data = src.data;
  for (let y = y0; y < y1; y++) {
    const srcRow = y * sw * 4;
    const dstRow = y * width * 4;
    for (let x = x0; x < x1; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 4;
      dest[di] = data[si] ?? 0;
      dest[di + 1] = data[si + 1] ?? 0;
      dest[di + 2] = data[si + 2] ?? 0;
      dest[di + 3] = data[si + 3] ?? 255;
    }
  }
}

/**
 * Stamp the feature into one (v, h) repeat and fill every other repeat from
 * the same UV region of the family base. Corresponding bands abut, so a
 * tileable pair stays seamless at the join.
 */
export function compositeStrongOnce(feature: PixelGrid, base: PixelGrid, slot: OnceSlot): PixelGrid {
  if (feature.width !== base.width || feature.height !== base.height) {
    return { width: feature.width, height: feature.height, data: feature.data };
  }
  const w = feature.width;
  const h = feature.height;
  const repeatsV = Math.max(1, slot.repeatsV);
  const repeatsH = Math.max(1, slot.repeatsH);
  const bandH = Math.floor(h / repeatsV);
  const bandW = Math.floor(w / repeatsH);
  const out = new Uint8ClampedArray(w * h * 4);
  const vSlot = ((slot.v % repeatsV) + repeatsV) % repeatsV;
  const hSlot = ((slot.h % repeatsH) + repeatsH) % repeatsH;
  for (let by = 0; by < repeatsV; by++) {
    const y0 = by * bandH;
    const y1 = by === repeatsV - 1 ? h : y0 + bandH;
    for (let bx = 0; bx < repeatsH; bx++) {
      const x0 = bx * bandW;
      const x1 = bx === repeatsH - 1 ? w : x0 + bandW;
      const src = by === vSlot && bx === hSlot ? feature : base;
      blitBand(out, src, w, x0, y0, x1, y1);
    }
  }
  return { width: w, height: h, data: out };
}

export function lookPixels(
  file: string,
  pngs: { get(name: string): { data: PixelGrid } | undefined },
  slot?: OnceSlot,
  baseFile?: string
): PixelGrid {
  const feat = pngs.get(file);
  if (!feat) throw new Error(`missing wall png ${file}`);
  if (!slot || !baseFile) return feat.data;
  const base = pngs.get(baseFile);
  if (!base) return feat.data;
  return compositeStrongOnce(feat.data, base.data, slot);
}
