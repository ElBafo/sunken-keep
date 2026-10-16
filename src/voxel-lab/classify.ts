import {
  DEPTH_LAYERS,
  MAT_DRY,
  MAT_MOSS,
  MAT_WET,
  MIN_WET_BLOB,
  MIN_WET_NEIGHBORS,
  MaterialId,
  ROUGH_MATTE,
  ROUGH_STONE,
  ROUGH_WET
} from './constants';

export function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Dark green / wet moss in the dungeon palette. */
export function isMoss(r: number, g: number, b: number): boolean {
  return g > r + 10 && g > b + 4 && g < 155 && r < 120;
}

export function classifyPixel(
  r: number,
  g: number,
  b: number,
  a: number
): { steps: number; material: MaterialId } | null {
  if (a < 16) return null;
  const L = luma(r, g, b);
  const steps = Math.max(1, Math.min(DEPTH_LAYERS, 1 + Math.round(L * 2)));
  if (isMoss(r, g, b)) return { steps, material: MAT_MOSS };
  // Painted highlights on stone — glossy, not random speckles.
  if (L > 0.45) return { steps, material: MAT_WET };
  return { steps, material: MAT_DRY };
}

/**
 * Gloss only on coherent wet-stone patches. Single bright texels (and 1-wide
 * specks) would otherwise become tiny mirrored cubes that sparkle while turning.
 */
export function filterIsolatedWet(
  classified: Array<{ steps: number; material: MaterialId } | null>,
  W: number,
  H: number
): void {
  const wet = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (classified[i]?.material === MAT_WET) wet[i] = 1;
  }
  const src = wet.slice();
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const idx = u + v * W;
      if (!src[idx]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = v + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = u + dx;
          if (x < 0 || x >= W) continue;
          if (src[x + y * W]) n += 1;
        }
      }
      if (n < MIN_WET_NEIGHBORS) wet[idx] = 0;
    }
  }
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const blob: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!wet[start] || seen[start]) continue;
    blob.length = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      blob.push(i);
      const u = i % W;
      const v = (i / W) | 0;
      const neigh = [i - 1, i + 1, i - W, i + W];
      const ok = [u > 0, u + 1 < W, v > 0, v + 1 < H];
      for (let k = 0; k < 4; k++) {
        if (!ok[k]) continue;
        const j = neigh[k];
        if (wet[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const keep = blob.length >= MIN_WET_BLOB;
    for (const i of blob) {
      if (!keep && classified[i]) classified[i].material = MAT_DRY;
      if (keep) wet[i] = 1;
    }
    if (!keep) {
      for (const i of blob) wet[i] = 0;
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (classified[i]?.material === MAT_WET && !wet[i]) classified[i]!.material = MAT_DRY;
  }
}

export interface VolumeFromPixels {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
  roughness: Uint8Array;
}

/** Packed PBR: R = clearcoat (wet), G = roughness, A = specular intensity. */
export function packPbrRgba(roughness: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(roughness.length * 4);
  for (let i = 0; i < roughness.length; i++) {
    const rough = roughness[i];
    const wet = rough <= ROUGH_WET;
    const matte = rough >= ROUGH_MATTE;
    rgba[i * 4] = wet ? 90 : 0;
    rgba[i * 4 + 1] = rough;
    rgba[i * 4 + 2] = rough;
    rgba[i * 4 + 3] = wet ? 70 : matte ? 6 : 36;
  }
  return rgba;
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
      classified[idx] = classifyPixel(r, g, b, a);
    }
  }
  filterIsolatedWet(classified, W, H);
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
      const mortar = lum[idx] < 0.32;
      roughness[idx] =
        c.material === MAT_MOSS || mortar
          ? ROUGH_MATTE
          : c.material === MAT_WET
            ? ROUGH_WET
            : ROUGH_STONE;
      for (let k = 0; k < steps; k++) {
        volume[idx + k * W * H] = 1;
      }
    }
  }
  return { volume, dims: [W, H, D], voxelCount, roughness };
}
