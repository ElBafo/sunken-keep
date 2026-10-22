/** Hand-painted puddle decals sit on floor_stone.png at 2× (512 on 256). */

import { floor1Map, isWaterCell, type FloorMap } from './layout';

export const WATER_DECAL_PX = 512;
export const WATER_DECAL_FLOOR_FILE = 'floor_stone.png';
export const WATER_DECAL_DIR = 'puddles';
/** Stone under a mask texel is about half as bright so the paint reads as water. */
export const DECAL_MASK_DARKEN = 0.5;

export const CISTERN_SHORE_Y = 4;
export const CISTERN_SHORE_XS = [1, 2, 3] as const;

export type DecalRot = 0 | 90 | 180 | 270;

export type WaterDecalPlacement = {
  x: number;
  y: number;
  /** Stem; files are `puddles/${id}.png` and `puddles/${id}_mask.png`. */
  id: string;
  /** 512 px column if the PNG is a left-to-right strip. */
  tile?: number;
  rot?: DecalRot;
  mirror?: boolean;
};

export function waterDecalPng(id: string): string {
  return `${WATER_DECAL_DIR}/${id}.png`;
}

export function waterDecalMaskPng(id: string): string {
  return `${WATER_DECAL_DIR}/${id}_mask.png`;
}

function hash01(x: number, y: number, salt = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.2) * 43758.5453;
  return n - Math.floor(n);
}

export function pickSoloPuddleId(x: number, y: number): 'puddle_1' | 'puddle_2' {
  return hash01(x, y, 19) < 0.5 ? 'puddle_1' : 'puddle_2';
}

function isCisternBasin(x: number, y: number): boolean {
  return x >= 1 && x <= 3 && y >= 1 && y <= 3;
}

function isCisternSouthShore(x: number, y: number): boolean {
  return y === CISTERN_SHORE_Y && (CISTERN_SHORE_XS as readonly number[]).includes(x);
}

/**
 * Shore tiles across the cistern's south edge. Horizontal water runs of 2+
 * get puddle_3 (matching E/W edges). Isolated cells get puddle_1 or _2.
 */
export function placeWaterDecals(map: FloorMap): WaterDecalPlacement[] {
  const out: WaterDecalPlacement[] = [];
  for (const x of CISTERN_SHORE_XS) {
    if (isWaterCell(map, x, CISTERN_SHORE_Y)) {
      out.push({ x, y: CISTERN_SHORE_Y, id: 'puddle_shore_s', rot: 0 });
    }
  }
  const rest: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWaterCell(map, x, y)) continue;
      if (isCisternBasin(x, y) || isCisternSouthShore(x, y)) continue;
      rest.push({ x, y });
    }
  }
  const byRow = new Map<number, number[]>();
  for (const c of rest) {
    const xs = byRow.get(c.y) ?? [];
    xs.push(c.x);
    byRow.set(c.y, xs);
  }
  for (const [y, xs] of byRow) {
    xs.sort((a, b) => a - b);
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const run = xs.slice(i, j + 1);
      if (run.length >= 2) {
        for (const x of run) out.push({ x, y, id: 'puddle_3', rot: 0 });
      } else {
        const x = run[0];
        out.push({ x, y, id: pickSoloPuddleId(x, y), rot: 0 });
      }
      i = j + 1;
    }
  }
  return out;
}

export const WATER_DECALS: readonly WaterDecalPlacement[] = placeWaterDecals(floor1Map);

let DECAL_BY_CELL = new Map(WATER_DECALS.map((d) => [`${d.x},${d.y}`, d]));

export function setDecalPlacements(list: readonly WaterDecalPlacement[]): void {
  DECAL_BY_CELL = new Map(list.map((d) => [`${d.x},${d.y}`, d]));
}

export function waterDecalAt(x: number, y: number): WaterDecalPlacement | undefined {
  return DECAL_BY_CELL.get(`${x},${y}`);
}

export function hasWaterDecal(x: number, y: number): boolean {
  return DECAL_BY_CELL.has(`${x},${y}`);
}

/** Cells with a puddle decal must use floor_stone.png, not _2/_3/_4. */
export function decalFloorFile(x: number, y: number): string | undefined {
  return hasWaterDecal(x, y) ? WATER_DECAL_FLOOR_FILE : undefined;
}

export function decalKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Same UV for the decal, its mask, and the floor_stone under it.
 * `u,v` are floor-space (u=+X, v=+north) to match painted floors.
 * Mirror flips U first, then rot is clockwise (90 matches shellUv).
 */
export function decalUv(
  u: number,
  v: number,
  rot: DecalRot = 0,
  mirror = false
): { u: number; v: number } {
  let uu = mirror ? 1 - u : u;
  let vv = v;
  const turns = (((rot / 90) | 0) % 4 + 4) % 4;
  for (let k = 0; k < turns; k++) {
    const nu = vv;
    const nv = 1 - uu;
    uu = nu;
    vv = nv;
  }
  return { u: uu, v: vv };
}

/** Cell-grid u=+X, v=+Z (v=0 north) → floor / decal UV. */
export function cellToDecalUv(
  u: number,
  v: number,
  rot: DecalRot = 0,
  mirror = false
): { u: number; v: number } {
  return decalUv(u, 1 - v, rot, mirror);
}

export type DecalPixels = { width: number; height: number; data: Uint8ClampedArray };

export function sliceDecalTile(
  img: { width: number; height: number; data: ArrayLike<number> },
  tile = 0,
  tilePx = WATER_DECAL_PX
): DecalPixels {
  const cols = Math.max(1, Math.floor(img.width / tilePx));
  const col = ((tile % cols) + cols) % cols;
  const w = Math.min(tilePx, img.width);
  const h = Math.min(tilePx, img.height);
  const out = new Uint8ClampedArray(w * h * 4);
  const src = img.data instanceof Uint8ClampedArray ? img.data : Uint8ClampedArray.from(img.data);
  const x0 = col * w;
  for (let y = 0; y < h; y++) {
    const so = ((y) * img.width + x0) * 4;
    out.set(src.subarray(so, so + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Stand-in 512² RGBA + greyscale mask until the artist files land.
 * South-shore tiles keep water to the north and an irregular lip toward +v.
 */
export function makePlaceholderPuddleDecal(
  tile = 0,
  shore: 'N' | 'E' | 'S' | 'W' = 'S',
  size = WATER_DECAL_PX
): { decal: DecalPixels; mask: DecalPixels } {
  const decal = new Uint8ClampedArray(size * size * 4);
  const mask = new Uint8ClampedArray(size * size * 4);
  const seed = tile * 1.7 + 0.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let along = u;
      let across = v;
      if (shore === 'N') {
        along = u;
        across = 1 - v;
      } else if (shore === 'E') {
        along = v;
        across = u;
      } else if (shore === 'W') {
        along = v;
        across = 1 - u;
      }
      const edge =
        0.58 +
        0.11 * Math.sin(along * Math.PI * 3.2 + seed) +
        0.05 * Math.sin(along * Math.PI * 7.1 + seed * 2.1) +
        0.03 * Math.sin((along + across) * Math.PI * 5 + tile);
      const wet = 1 - smoothstep(edge - 0.07, edge + 0.07, across);
      const i = (y * size + x) * 4;
      mask[i] = mask[i + 1] = mask[i + 2] = Math.round(wet * 255);
      mask[i + 3] = 255;
      const ring = smoothstep(0.08, 0.28, wet) * (1 - smoothstep(0.55, 0.95, wet));
      decal[i] = 28;
      decal[i + 1] = 32;
      decal[i + 2] = 30;
      decal[i + 3] = Math.round((0.22 * wet + 0.55 * ring) * 255);
    }
  }
  return {
    decal: { width: size, height: size, data: decal },
    mask: { width: size, height: size, data: mask }
  };
}

export function sampleMaskLuma(
  img: { width: number; height: number; data: ArrayLike<number> },
  u: number,
  v: number
): number {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)));
  const i = (y * img.width + x) * 4;
  return Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) / 255;
}

type MaskSampler = (u: number, v: number) => number;

const installedMasks = new Map<string, MaskSampler>();

export function setWaterDecalMask(x: number, y: number, fn: MaskSampler | null): void {
  const key = decalKey(x, y);
  if (!fn) installedMasks.delete(key);
  else installedMasks.set(key, fn);
}

export function clearWaterDecalMasks(): void {
  installedMasks.clear();
}

export function sampleWaterDecalMask(x: number, y: number, u: number, v: number): number | null {
  const spec = waterDecalAt(x, y);
  const fn = installedMasks.get(decalKey(x, y));
  if (!fn) return null;
  const uv = cellToDecalUv(u, v, spec?.rot ?? 0, spec?.mirror);
  return fn(uv.u, uv.v);
}

export function installDecalMaskFromPixels(
  x: number,
  y: number,
  img: { width: number; height: number; data: ArrayLike<number> }
): void {
  setWaterDecalMask(x, y, (u, v) => sampleMaskLuma(img, u, v));
}
