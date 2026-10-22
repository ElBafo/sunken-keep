import * as THREE from 'three';
import { CELL, FLOOR_VARIANTS, SCONCE_RADIUS_TILES, TORCH_DISTANCE } from './constants';
import {
  FACE_INTO_ROOM,
  floodReach,
  sconceIsLit,
  sconceRoom,
  torchWorldPos,
  type SconceSpec
} from './fixtures';
import { isShellTile, isTrueWall, isWaterCell, mappedFloorFile, tileAt, type FloorMap } from './layout';
import { paintedShellMaterial } from './painted';
import { pickVariant } from './variants';
import { loadPng, textureFromPixels } from '../voxel-lab/materials';

/** Flooded grout vs a dry slab poking out of the pool. */
export const WATER_INSET_MIN = 0.05;
export const WATER_INSET_MAX = 0.32;
export const WATER_SLAB_M = 0.46;
export const WATER_GROUT_M = 0.08;
/** Wet stone around every shore, 20–40 cm. */
export const WET_RING_MIN_M = 0.2;
export const WET_RING_MAX_M = 0.4;
export const WATER_DIP_SHALLOW = 0.028;
export const WATER_DIP_DEEP = 0.06;
export const WATER_FLOOR_SEGS = 16;
export const WATER_RIPPLE_AMP = 0.005;
/** One noise tile is larger than any pool so a 2 m cell cannot read as a repeat. */
export const WATER_NOISE_SPAN = 24;
export const CISTERN_BED_FILE = 'cistern_bed.png';
/** Artist painted north at the top of the PNG and assumed Three's default. */
export const CISTERN_BED_FLIP_Y = true;
export const WATER_INNER_FILES = ['floor_water_inner.png', 'floor_water_inner_2.png'] as const;
export const WATER_RIM_FILE = 'floor_water.png';
export const WATER_RIM_MASK_N = 'floor_water_rim_mask_n.png';
export const WATER_SURFACE_COLOR = 0x101410;
export const WATER_DEEP_COLOR = 0x030403;
const WATER_SHALLOW_RGB = { r: 0.032, g: 0.036, b: 0.03 };
const WATER_DEEP_RGB = { r: 0.012, g: 0.016, b: 0.014 };
const PUDDLE_ALPHA_SHALLOW = 0.64;
const PUDDLE_ALPHA_DEEP = 0.9;
const WALL_REFLECT_RGB = { r: 0.2, g: 0.17, b: 0.14 };

export const WATER_FACES = ['N', 'E', 'S', 'W'] as const;
export type WaterFace = (typeof WATER_FACES)[number];

const FACE_DELTA: Record<WaterFace, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 }
};

export type WaterCell = { x: number; y: number };

export type WaterRegion = {
  id: number;
  cells: WaterCell[];
  deep: WaterCell[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function listWaterCells(map: FloorMap): WaterCell[] {
  const out: WaterCell[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWaterCell(map, x, y)) out.push({ x, y });
    }
  }
  return out;
}

export function hasWaterNeighbor(map: FloorMap, x: number, y: number): boolean {
  for (const face of WATER_FACES) {
    const { dx, dz } = FACE_DELTA[face];
    if (isWaterCell(map, x + dx, y + dz)) return true;
  }
  return false;
}

export function isDeepWaterCell(map: FloorMap, x: number, y: number): boolean {
  return !!tileAt(map, x, y)?.deepWater;
}

export function dryFacingFaces(map: FloorMap, x: number, y: number): WaterFace[] {
  const out: WaterFace[] = [];
  for (const face of WATER_FACES) {
    const { dx, dz } = FACE_DELTA[face];
    if (!isWaterCell(map, x + dx, y + dz)) out.push(face);
  }
  return out;
}

/** One puddle per connected water region — cistern and cellar, not 12 separate pools. */
export function listWaterRegions(map: FloorMap): WaterRegion[] {
  const seen = new Set<string>();
  const regions: WaterRegion[] = [];
  for (const cell of listWaterCells(map)) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    const cells: WaterCell[] = [];
    const queue = [cell];
    seen.add(key);
    while (queue.length) {
      const cur = queue.shift()!;
      cells.push(cur);
      for (const face of WATER_FACES) {
        const { dx, dz } = FACE_DELTA[face];
        const nx = cur.x + dx;
        const ny = cur.y + dz;
        const nk = `${nx},${ny}`;
        if (seen.has(nk) || !isWaterCell(map, nx, ny)) continue;
        seen.add(nk);
        queue.push({ x: nx, y: ny });
      }
    }
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    regions.push({
      id: regions.length,
      cells,
      deep: cells.filter((c) => isDeepWaterCell(map, c.x, c.y)),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    });
  }
  return regions;
}

export function hash01(x: number, y: number, salt = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.2) * 43758.5453;
  return n - Math.floor(n);
}

export function pickWaterInnerIndex(tx: number, tz: number): 0 | 1 {
  return hash01(tx, tz, 41) < 0.5 ? 0 : 1;
}

export function isCisternRegion(region: WaterRegion): boolean {
  return region.cells.some((c) => c.x === 2 && c.y === 2);
}

export function cisternRegion(map: FloorMap): WaterRegion | undefined {
  return listWaterRegions(map).find(isCisternRegion);
}

/** Pool AABB in world metres, mapped to 0..1. North is v=0. */
export function regionWorldUv(region: WaterRegion, wx: number, wz: number): { u: number; v: number } {
  const minWx = (region.minX - 0.5) * CELL;
  const minWz = (region.minY - 0.5) * CELL;
  const spanX = (region.maxX - region.minX + 1) * CELL;
  const spanZ = (region.maxY - region.minY + 1) * CELL;
  return {
    u: (wx - minWx) / spanX,
    v: (wz - minWz) / spanZ
  };
}

/**
 * Sample UV for `cistern_bed.png` with flipY=true: v=1 is the top of the
 * PNG (north / y=1), v=0 is the south shore. u=0 is west / x=1.
 */
export function cisternBedWorldUvFromRegion(
  region: WaterRegion,
  wx: number,
  wz: number
): { u: number; v: number } {
  const uv = regionWorldUv(region, wx, wz);
  return { u: uv.u, v: 1 - uv.v };
}

export function cisternBedWorldUv(map: FloorMap, wx: number, wz: number): { u: number; v: number } {
  const region = cisternRegion(map);
  if (!region) return { u: 0, v: 0 };
  return cisternBedWorldUvFromRegion(region, wx, wz);
}

/** Image-space rect of one cistern cell. y=0 is the top of the PNG (north). */
export function cisternBedCellImageRect(
  region: WaterRegion,
  tx: number,
  tz: number,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  const cols = region.maxX - region.minX + 1;
  const rows = region.maxY - region.minY + 1;
  const w = width / cols;
  const h = height / rows;
  return {
    x: (tx - region.minX) * w,
    y: (tz - region.minY) * h,
    w,
    h
  };
}

function asBytes(src: ArrayLike<number>): Uint8ClampedArray {
  return src instanceof Uint8ClampedArray ? src : Uint8ClampedArray.from(src);
}

function copyRect(
  src: ArrayLike<number>,
  srcW: number,
  x: number,
  y: number,
  w: number,
  h: number
): Uint8ClampedArray {
  const bytes = asBytes(src);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const so = ((y + row) * srcW + x) * 4;
    out.set(bytes.subarray(so, so + w * 4), row * w * 4);
  }
  return out;
}

function writeRect(
  dest: Uint8ClampedArray,
  destW: number,
  x: number,
  y: number,
  w: number,
  h: number,
  src: ArrayLike<number>
): void {
  const bytes = asBytes(src);
  for (let row = 0; row < h; row++) {
    dest.set(bytes.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * destW + x) * 4);
  }
}

/** Blend the wet rim onto dry-facing sides of the cistern bed. Water–water joins stay as painted. */
export function compositeCisternBedRims(
  bed: { width: number; height: number; data: ArrayLike<number> },
  rim: ArrayLike<number>,
  northMask: Float32Array,
  maskSize: number,
  map: FloorMap,
  region: WaterRegion
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bed.data);
  for (const c of region.cells) {
    const mask = rimMaskForCell(map, c.x, c.y, northMask, maskSize);
    if (Math.max(...mask) === 0) continue;
    const rect = cisternBedCellImageRect(region, c.x, c.y, bed.width, bed.height);
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.round(rect.w);
    const h = Math.round(rect.h);
    if (w !== maskSize || h !== maskSize) continue;
    const cell = copyRect(out, bed.width, x, y, w, h);
    writeRect(out, bed.width, x, y, w, h, blendWaterOverInner(cell, rim, mask, maskSize));
  }
  return out;
}

export async function tryLoadOptionalPng(file: string): Promise<Awaited<ReturnType<typeof loadPng>> | null> {
  try {
    return await loadPng(file);
  } catch {
    return null;
  }
}

/**
 * Low-frequency world noise. Periods are 12–20 m, so a 2 m cell is a
 * slice of one wave, not a tile. `t` is seconds of slow drift.
 */
export function waterWorldNoise(wx: number, wz: number, t = 0): number {
  const a = Math.sin(wx * 0.41 + wz * 0.17 + t * 0.28);
  const b = Math.sin(-wx * 0.22 + wz * 0.36 + t * 0.19 + 1.7);
  const c = Math.sin(wx * 0.15 + wz * 0.13 + t * 0.11 + 0.6);
  return a * 0.52 + b * 0.33 + c * 0.15;
}

export function waterRippleHeight(wx: number, wz: number, t = 0): number {
  return WATER_RIPPLE_AMP * waterWorldNoise(wx, wz, t);
}

export function waterWorldUv(wx: number, wz: number): { u: number; v: number } {
  return { u: wx / WATER_NOISE_SPAN, v: wz / WATER_NOISE_SPAN };
}

/** 0–1 how much a water point sits inside a lit torch pool. */
export function cellTorchWarmth(
  tx: number,
  tz: number,
  sconces: readonly SconceSpec[]
): number {
  let best = 0;
  for (const [u, v] of [
    [0.5, 0.5],
    [0.08, 0.5],
    [0.92, 0.5],
    [0.5, 0.08],
    [0.5, 0.92]
  ] as const) {
    best = Math.max(best, torchWarmthAt((tx - 0.5 + u) * CELL, (tz - 0.5 + v) * CELL, sconces));
  }
  return best;
}

export function torchWarmthAt(
  wx: number,
  wz: number,
  sconces: readonly SconceSpec[],
  radius = TORCH_DISTANCE
): number {
  let best = 0;
  for (const s of sconces) {
    if (!sconceIsLit(s)) continue;
    const p = torchWorldPos(s);
    const t = 1 - Math.hypot(wx - p.x, wz - p.z) / radius;
    if (t > 0) best = Math.max(best, t ** 1.35);
  }
  return best;
}

export function rgbaToMask(data: ArrayLike<number>, size: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    out[i] = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
  }
  return out;
}

/** Rotate a north-rim mask `turns` × 90° clockwise. No mirror. */
export function rotateMaskCW(src: Float32Array, size: number, turns: number): Float32Array {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return src.slice();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sx = x;
      let sy = y;
      for (let k = 0; k < t; k++) {
        const nsx = sy;
        const nsy = size - 1 - sx;
        sx = nsx;
        sy = nsy;
      }
      out[y * size + x] = src[sy * size + sx];
    }
  }
  return out;
}

const RIM_TURNS: Record<WaterFace, number> = { N: 0, E: 1, S: 2, W: 3 };

/** Max of north-mask rotations for dry-facing sides. Water–water sides add nothing. */
export function rimMaskForCell(
  map: FloorMap,
  tx: number,
  tz: number,
  north: Float32Array,
  size: number
): Float32Array {
  const out = new Float32Array(size * size);
  for (const face of dryFacingFaces(map, tx, tz)) {
    const rot = rotateMaskCW(north, size, RIM_TURNS[face]);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], rot[i]);
  }
  return out;
}

export function blendWaterOverInner(
  inner: ArrayLike<number>,
  water: ArrayLike<number>,
  mask: Float32Array,
  size: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const m = mask[i];
    const o = i * 4;
    out[o] = inner[o] * (1 - m) + water[o] * m;
    out[o + 1] = inner[o + 1] * (1 - m) + water[o + 1] * m;
    out[o + 2] = inner[o + 2] * (1 - m) + water[o + 2] * m;
    out[o + 3] = 255;
  }
  return out;
}

export function waterAtlasGrid(count: number): { cols: number; rows: number } {
  const cols = 8;
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export type WaterGroutSampler = (wx: number, wz: number) => number;

let groutSampler: WaterGroutSampler | null = null;

export function setWaterGroutSampler(fn: WaterGroutSampler | null): void {
  groutSampler = fn;
}

export function floorStoneFile(tx: number, tz: number): string {
  const mapped = mappedFloorFile(tx, tz);
  if (mapped && !mapped.startsWith('floor_water')) return mapped;
  for (const face of WATER_FACES) {
    const { dx, dz } = FACE_DELTA[face];
    const neighbor = mappedFloorFile(tx + dx, tz + dz);
    if (neighbor && !neighbor.startsWith('floor_water')) return neighbor;
  }
  return pickVariant(FLOOR_VARIANTS, tx, tz, 'F');
}

/** 0–1 how much a world-tile point sits in grout or a crack (dark). */
export function proceduralGrout(wx: number, wz: number): number {
  const x = wx * CELL;
  const z = wz * CELL;
  const cycle = WATER_SLAB_M + WATER_GROUT_M;
  const fx = ((x % cycle) + cycle) % cycle;
  const fz = ((z % cycle) + cycle) % cycle;
  const groutX =
    smoothstep(WATER_SLAB_M - 0.012, WATER_SLAB_M, fx) * (1 - smoothstep(cycle - 0.01, cycle, fx));
  const groutZ =
    smoothstep(WATER_SLAB_M - 0.012, WATER_SLAB_M, fz) * (1 - smoothstep(cycle - 0.01, cycle, fz));
  const n = waterWorldNoise(x * 1.8, z * 1.6, 5.4);
  const crack = Math.max(0, n - 0.28) ** 1.6;
  return Math.min(1, Math.max(groutX, groutZ, crack));
}

export function groutAt(wx: number, wz: number): number {
  return groutSampler ? groutSampler(wx, wz) : proceduralGrout(wx, wz);
}

export function samplePngLuma(
  img: { width: number; height: number; data: ArrayLike<number> },
  u: number,
  v: number
): number {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)));
  const i = (y * img.width + x) * 4;
  return (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
}

/**
 * Dark grout / crack texels on the dry flagstone pull the waterline out.
 * Floor stone luma is ~0.08–0.28; p10 is the mortar.
 */
export function makeTextureGroutSampler(
  images: Map<string, { width: number; height: number; data: ArrayLike<number> }>,
  fileAt: (tx: number, tz: number) => string = floorStoneFile
): WaterGroutSampler {
  return (wx, wz) => {
    const tx = Math.floor(wx + 0.5);
    const tz = Math.floor(wz + 0.5);
    const img = images.get(fileAt(tx, tz)) ?? images.get('floor_stone.png');
    if (!img) return proceduralGrout(wx, wz);
    const u = wx - (tx - 0.5);
    const v = wz - (tz - 0.5);
    const luma = samplePngLuma(img, u, v);
    const dark = smoothstep(0.22, 0.105, luma);
    return Math.min(1, Math.max(dark, proceduralGrout(wx, wz) * 0.28));
  };
}

function faceWorldAlong(
  tx: number,
  tz: number,
  face: WaterFace,
  along: number
): { wx: number; wz: number } {
  if (face === 'N') return { wx: tx - 0.5 + along, wz: tz - 0.5 };
  if (face === 'S') return { wx: tx - 0.5 + along, wz: tz + 0.5 };
  if (face === 'E') return { wx: tx + 0.5, wz: tz - 0.5 + along };
  return { wx: tx - 0.5, wz: tz - 0.5 + along };
}

function clampInset(v: number): number {
  return Math.min(WATER_INSET_MAX, Math.max(WATER_INSET_MIN, v));
}

/**
 * Waterline steps around flagstone slabs. Grout and dark cracks flood
 * further; some slabs stay dry, others sit half under.
 */
export function puddleEdgeInset(tx: number, tz: number, face: WaterFace, along: number): number {
  const { wx, wz } = faceWorldAlong(tx, tz, face, along);
  const { dx, dz } = FACE_DELTA[face];
  const grout = groutAt(wx + dx * 0.03, wz + dz * 0.03);
  const cycle = WATER_SLAB_M + WATER_GROUT_M;
  const phase = hash01(tx, tz, face.charCodeAt(0)) * cycle * 0.4;
  const alongM = along * CELL + phase;
  const local = ((alongM % cycle) + cycle) % cycle;
  const inGrout = local >= WATER_SLAB_M;
  const slabI = Math.floor(alongM / cycle);
  const slabSink = hash01(slabI, face.charCodeAt(0) + tx * 17, tz + 11);
  const chip =
    0.01 * Math.sin(alongM * 17 + face.charCodeAt(0)) + 0.008 * (hash01(slabI, tz, 4) - 0.5);
  const wander = 0.05 * Math.sin(along * Math.PI * 2.15 + face.charCodeAt(0) * 0.31 + tx * 0.7);

  if (inGrout || grout > 0.62) {
    return clampInset(WATER_INSET_MIN + 0.018 * (1 - grout) + chip * 0.4 + wander * 0.4);
  }
  const poke = slabSink < 0.4;
  const inset = poke
    ? WATER_INSET_MAX - 0.035 * slabSink - 0.14 * grout
    : WATER_INSET_MIN + 0.035 + 0.07 * slabSink - 0.09 * grout;
  return clampInset(inset + chip + wander);
}

/**
 * 0–1 how wet a point in a water cell is.
 * Water–water joins stay wet. Dry borders step around slabs; grout
 * seeps closer to the matching stone edge than a dry slab does.
 */
export function puddleCoverage(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  if (!isWaterCell(map, tx, tz)) return 0;
  let wet = 1;
  const sides: Array<{ face: WaterFace; dist: number; along: number; nx: number; nz: number }> = [
    { face: 'W', dist: u, along: v, nx: tx - 1, nz: tz },
    { face: 'E', dist: 1 - u, along: v, nx: tx + 1, nz: tz },
    { face: 'N', dist: v, along: u, nx: tx, nz: tz - 1 },
    { face: 'S', dist: 1 - v, along: u, nx: tx, nz: tz + 1 }
  ];
  for (const s of sides) {
    if (isWaterCell(map, s.nx, s.nz)) continue;
    const inset = puddleEdgeInset(tx, tz, s.face, s.along);
    const t = s.dist / Math.max(0.02, inset);
    const body = smoothstep(0.78, 1.02, t);
    const grout = groutAt(tx - 0.5 + u, tz - 0.5 + v);
    const seep =
      grout * grout * smoothstep(0.012, 0.09, s.dist) * (1 - smoothstep(0.18, 1.12, t));
    wet = Math.min(wet, Math.max(body, seep));
  }
  return wet;
}

export function puddleCoverageWorld(map: FloorMap, wx: number, wz: number): number {
  const tx = Math.floor(wx + 0.5);
  const tz = Math.floor(wz + 0.5);
  return puddleCoverage(map, tx, tz, wx - (tx - 0.5), wz - (tz - 0.5));
}

export function wetRingWidth(wxM: number, wzM: number): number {
  const n = 0.5 + 0.5 * waterWorldNoise(wxM * 0.65, wzM * 0.7, 2.2);
  return WET_RING_MIN_M + (WET_RING_MAX_M - WET_RING_MIN_M) * n;
}

/** Metres from the stepped waterline. Used by the wet stone ring. */
export function shoreDistanceM(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  let best = Infinity;
  if (isWaterCell(map, tx, tz)) {
    const sides: Array<{ face: WaterFace; dist: number; along: number; nx: number; nz: number }> = [
      { face: 'W', dist: u, along: v, nx: tx - 1, nz: tz },
      { face: 'E', dist: 1 - u, along: v, nx: tx + 1, nz: tz },
      { face: 'N', dist: v, along: u, nx: tx, nz: tz - 1 },
      { face: 'S', dist: 1 - v, along: u, nx: tx, nz: tz + 1 }
    ];
    for (const s of sides) {
      if (isWaterCell(map, s.nx, s.nz)) continue;
      const inset = puddleEdgeInset(tx, tz, s.face, s.along);
      best = Math.min(best, Math.abs(s.dist - inset) * CELL);
    }
    return best;
  }
  const sides: Array<{ face: WaterFace; dist: number; wx: number; wz: number; along: number }> = [
    { face: 'E', dist: u, wx: tx - 1, wz: tz, along: v },
    { face: 'W', dist: 1 - u, wx: tx + 1, wz: tz, along: v },
    { face: 'S', dist: v, wx: tx, wz: tz - 1, along: u },
    { face: 'N', dist: 1 - v, wx: tx, wz: tz + 1, along: u }
  ];
  for (const s of sides) {
    if (!isWaterCell(map, s.wx, s.wz)) continue;
    const inset = puddleEdgeInset(s.wx, s.wz, s.face, s.along);
    best = Math.min(best, (s.dist + inset) * CELL);
  }
  return best;
}

/** 1 at the waterline, 0 outside the 20–40 cm wet band. */
export function wetRingAmount(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  const d = shoreDistanceM(map, tx, tz, u, v);
  if (!Number.isFinite(d)) return 0;
  const wxM = (tx - 0.5 + u) * CELL;
  const wzM = (tz - 0.5 + v) * CELL;
  const width = wetRingWidth(wxM, wzM);
  return 1 - smoothstep(width * 0.12, width, d);
}

export function listWetRingCells(map: FloorMap): WaterCell[] {
  const out: WaterCell[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    if (!isShellTile(tileAt(map, x, y))) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y });
  };
  for (const cell of listWaterCells(map)) {
    const dry = dryFacingFaces(map, cell.x, cell.y);
    if (!dry.length) continue;
    add(cell.x, cell.y);
    for (const face of dry) {
      const { dx, dz } = FACE_DELTA[face];
      add(cell.x + dx, cell.y + dz);
    }
  }
  return out;
}

/** 0–1 how close a point is to a true wall (for a broken wall reflection). */
export function wallProximity(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  let best = 0;
  const sides = [
    { dist: u, wall: isTrueWall(tileAt(map, tx - 1, tz)) },
    { dist: 1 - u, wall: isTrueWall(tileAt(map, tx + 1, tz)) },
    { dist: v, wall: isTrueWall(tileAt(map, tx, tz - 1)) },
    { dist: 1 - v, wall: isTrueWall(tileAt(map, tx, tz + 1)) }
  ];
  for (const s of sides) {
    if (!s.wall) continue;
    best = Math.max(best, 1 - smoothstep(0.08, 0.72, s.dist));
  }
  return best;
}

/** Faint broken wall/ceiling bounce, only inside a torch pool. */
export function puddleReflectBoost(
  warmth: number,
  deep: number,
  wxM: number,
  wzM: number,
  wallNear: number
): number {
  if (warmth <= 0) return 0;
  const n = waterWorldNoise(wxM * 1.15, wzM * 0.95, 4.2);
  const broken = 0.28 + 0.72 * Math.max(0, n);
  const lit = smoothstep(0, 0.06, warmth);
  return (
    lit * (0.05 + 0.11 * warmth) * broken * (0.4 + 0.6 * wallNear) * (1 - 0.35 * deep)
  );
}

/**
 * 0–1 how deep a point is, in world-tile space so the basin is continuous
 * across cell joins. Deep tiles are 1; the falloff into neighbouring
 * shallow cells makes (2,1)/(2,2) one darker channel, not two squares.
 */
export function waterDeepness(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  if (!isWaterCell(map, tx, tz)) return 0;
  const wx = tx - 0.5 + u;
  const wz = tz - 0.5 + v;
  let d = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx;
      const nz = tz + dy;
      if (!isDeepWaterCell(map, nx, nz)) continue;
      const ox = Math.max(0, nx - 0.5 - wx, wx - (nx + 0.5));
      const oz = Math.max(0, nz - 0.5 - wz, wz - (nz + 0.5));
      d = Math.max(d, 1 - smoothstep(0, 0.55, Math.hypot(ox, oz)));
    }
  }
  return d;
}

/** Puddle veil opacity. Deep hides the bed; shallow lets floor_water read through. */
export function puddleAlpha(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  const cover = puddleCoverage(map, tx, tz, u, v);
  const deep = waterDeepness(map, tx, tz, u, v);
  return smoothstep(0.28, 0.7, cover) * (PUDDLE_ALPHA_SHALLOW + (PUDDLE_ALPHA_DEEP - PUDDLE_ALPHA_SHALLOW) * deep);
}

/** Floor drop in metres. 0 on the matching dry-stone edge band. */
export function floorDip(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  const cover = puddleCoverage(map, tx, tz, u, v);
  if (cover < 0.08) return 0;
  const deep = waterDeepness(map, tx, tz, u, v);
  const wu = tx + u;
  const wv = tz + v;
  const wave =
    0.005 * Math.sin(wu * 2.15) * Math.cos(wv * 1.72) + 0.003 * Math.sin(wu * 3.4 + wv * 2.2);
  const maxDip = WATER_DIP_SHALLOW + (WATER_DIP_DEEP - WATER_DIP_SHALLOW) * deep;
  return -(maxDip + wave) * smoothstep(0.12, 0.78, cover);
}

export function puddleSurfaceY(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  return floorDip(map, tx, tz, u, v) + 0.002;
}

/** True when a dry-border contour is not a straight cell-aligned line. */
export function puddleEdgeIsIrregular(map: FloorMap, tx: number, tz: number, face: WaterFace): boolean {
  if (!dryFacingFaces(map, tx, tz).includes(face)) return false;
  const samples: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const along = i / 12;
    let u = 0.5;
    let v = 0.5;
    const find = (dist: number): number => {
      if (face === 'W') {
        u = dist;
        v = along;
      } else if (face === 'E') {
        u = 1 - dist;
        v = along;
      } else if (face === 'N') {
        u = along;
        v = dist;
      } else {
        u = along;
        v = 1 - dist;
      }
      return puddleCoverage(map, tx, tz, u, v);
    };
    let lo = 0;
    let hi = 0.35;
    for (let k = 0; k < 10; k++) {
      const mid = (lo + hi) / 2;
      if (find(mid) > 0.45) hi = mid;
      else lo = mid;
    }
    samples.push((lo + hi) / 2);
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return max - min > 0.02;
}

export function paintedFloorSize(tx: number, tz: number, map: FloorMap, defaultSize: number): number {
  if (isWaterCell(map, tx, tz) || hasWaterNeighbor(map, tx, tz)) return CELL;
  return defaultSize;
}

export type StrayPuddle = { tx: number; tz: number; x: number; z: number; sx: number; sz: number; rot: number };

/** Tiny extra puddles stay inside the cell, near a dry edge. */
export function listStrayPuddles(map: FloorMap): StrayPuddle[] {
  const out: StrayPuddle[] = [];
  for (const cell of listWaterCells(map)) {
    const dry = dryFacingFaces(map, cell.x, cell.y);
    if (!dry.length) continue;
    const n = 1 + (hash01(cell.x, cell.y, 21) > 0.62 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const face = dry[Math.floor(hash01(cell.x, cell.y, 22 + i) * dry.length) % dry.length];
      const along = 0.22 + 0.56 * hash01(cell.x, cell.y, 30 + i);
      const inset = 0.18 + 0.12 * hash01(cell.x, cell.y, 40 + i);
      let lu = 0.5;
      let lv = 0.5;
      if (face === 'W') {
        lu = inset;
        lv = along;
      } else if (face === 'E') {
        lu = 1 - inset;
        lv = along;
      } else if (face === 'N') {
        lu = along;
        lv = inset;
      } else {
        lu = along;
        lv = 1 - inset;
      }
      out.push({
        tx: cell.x,
        tz: cell.y,
        x: (cell.x - 0.5) * CELL + lu * CELL,
        z: (cell.y - 0.5) * CELL + lv * CELL,
        sx: 0.16 + 0.12 * hash01(cell.x, cell.y, 50 + i),
        sz: 0.12 + 0.1 * hash01(cell.x, cell.y, 60 + i),
        rot: (hash01(cell.x, cell.y, 70 + i) - 0.5) * 1.4
      });
    }
  }
  return out;
}

export function listWaterGlintCells(map: FloorMap, sconces: readonly SconceSpec[]): WaterCell[] {
  const seen = new Set<string>();
  const out: WaterCell[] = [];
  for (const s of sconces) {
    if (!sconceIsLit(s)) continue;
    const room = sconceRoom(s);
    for (const key of floodReach(map, room.x, room.y, SCONCE_RADIUS_TILES)) {
      const [x, y] = key.split(',').map(Number);
      if (!isWaterCell(map, x, y) || seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y });
    }
  }
  return out;
}

export type WaterTorchMark = {
  kind: 'streak' | 'wall';
  tx: number;
  tz: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  sx: number;
  sz: number;
};

export function planeRotY(ax: number, az: number): number {
  return Math.atan2(-az, ax);
}

export function listWaterTorchMarks(map: FloorMap, sconces: readonly SconceSpec[]): WaterTorchMark[] {
  const out: WaterTorchMark[] = [];
  for (const s of sconces) {
    if (!sconceIsLit(s)) continue;
    const room = sconceRoom(s);
    if (!isWaterCell(map, room.x, room.y)) continue;
    const { nx, nz } = FACE_INTO_ROOM[s.face];
    const wallX = room.x * CELL - nx * (CELL / 2);
    const wallZ = room.y * CELL - nz * (CELL / 2);
    const y = puddleSurfaceY(map, room.x, room.y, 0.5 - nx * 0.15, 0.5 - nz * 0.15) + 0.004;
    out.push({
      kind: 'streak',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * 0.85,
      y,
      z: wallZ + nz * 0.85,
      rotY: planeRotY(nx, nz),
      sx: 1.6,
      sz: 0.85
    });
    out.push({
      kind: 'wall',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * 0.18,
      y: y - 0.001,
      z: wallZ + nz * 0.18,
      rotY: planeRotY(-nz, nx),
      sx: CELL * 0.72,
      sz: 0.34
    });
  }
  return out;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  let vCount = 0;
  let iCount = 0;
  let hasColor = false;
  for (const g of geos) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()?.count ?? g.getAttribute('position').count;
    if (g.getAttribute('color')) hasColor = true;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = hasColor ? new Float32Array(vCount * 4) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  let vBase = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    const c = g.getAttribute('color');
    const ix = g.getIndex();
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nrm[(vo + i) * 3] = n.getX(i);
        nrm[(vo + i) * 3 + 1] = n.getY(i);
        nrm[(vo + i) * 3 + 2] = n.getZ(i);
      }
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
      if (col) {
        if (c) {
          col[(vo + i) * 4] = c.getX(i);
          col[(vo + i) * 4 + 1] = c.getY(i);
          col[(vo + i) * 4 + 2] = c.getZ(i);
          col[(vo + i) * 4 + 3] = c.itemSize > 3 ? c.getW(i) : 1;
        } else {
          col[(vo + i) * 4] = 1;
          col[(vo + i) * 4 + 1] = 1;
          col[(vo + i) * 4 + 2] = 1;
          col[(vo + i) * 4 + 3] = 1;
        }
      }
    }
    if (ix) {
      for (let i = 0; i < ix.count; i++) idx[io++] = ix.getX(i) + vBase;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = i + vBase;
    }
    vo += p.count;
    vBase += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function makeRippleNormal(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const height = (x: number, y: number): number => {
    const wx = (x / size) * WATER_NOISE_SPAN;
    const wz = (y / size) * WATER_NOISE_SPAN;
    return waterWorldNoise(wx, wz);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      let nx = -dx * 2.4;
      let ny = -dy * 2.4;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function paintSoftBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  alpha: number
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.35, `rgba(${rgb}, ${alpha * 0.45})`);
  g.addColorStop(0.7, `rgba(${rgb}, ${alpha * 0.12})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Soft wobbling torch shimmer — no hard-edged dash quads. */
function makeStreakAtlas(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const warm = '255, 206, 142';
  const dim = '198, 148, 88';
  let x = 8;
  while (x < w - 6) {
    const t = x / w;
    const fall = (1 - t) * (1 - t);
    const gap = 0.42 + 0.7 * hash01(x, 3, 1) + 0.35 * Math.sin(x * 0.09);
    if (hash01(x, 1, 4) > 0.78) {
      x += gap * 7;
      continue;
    }
    const mid =
      36 +
      16 * Math.sin(x * 0.041 + 0.6) +
      9 * Math.sin(x * 0.11 + 1.8) +
      4 * Math.sin(x * 0.23);
    const rx = 5 + 11 * hash01(x, 2, 6);
    const ry = 2.2 + 3.8 * hash01(x, 5, 7);
    paintSoftBlob(ctx, x, mid, rx, ry, warm, 0.55 * fall);
    if (hash01(x, 8, 2) > 0.55) {
      paintSoftBlob(
        ctx,
        x + (hash01(x, 9, 3) - 0.5) * 10,
        mid + (hash01(x, 10, 4) - 0.5) * 8,
        rx * 0.45,
        ry * 0.7,
        warm,
        0.22 * fall
      );
    }
    x += gap * (5 + 9 * hash01(x, 6, 8));
  }
  let wx = 10;
  while (wx < w - 8) {
    const t = wx / w;
    if (hash01(wx, 20, 1) < 0.35) {
      wx += 10;
      continue;
    }
    const mid = 100 + 6 * Math.sin(wx * 0.07) + 3 * Math.sin(wx * 0.19);
    paintSoftBlob(ctx, wx, mid, 14 + 8 * hash01(wx, 21, 2), 5 + 3 * hash01(wx, 22, 3), dim, 0.16 * (1 - t));
    wx += 14 + 18 * hash01(wx, 23, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeSoftShimmer(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = (x / w) * WATER_NOISE_SPAN;
      const wz = (y / h) * WATER_NOISE_SPAN;
      const n = waterWorldNoise(wx, wz);
      const peak = Math.max(0, n * 0.5 + 0.5);
      const a = peak * peak * 0.72;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 214;
      img.data[i + 2] = 160;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function cellGrid(
  tx: number,
  tz: number,
  map: FloorMap,
  kind: 'floor' | 'puddle' | 'shimmer' | 'wetring',
  opts?: {
    atlas?: { index: number; cols: number; rows: number };
    region?: WaterRegion;
    sconces?: readonly SconceSpec[];
    segs?: number;
  }
): THREE.BufferGeometry {
  const segs = opts?.segs ?? WATER_FLOOR_SEGS;
  const geo = new THREE.PlaneGeometry(CELL, CELL, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const uvAttr = geo.getAttribute('uv');
  const col = new Float32Array(pos.count * 4);
  const atlas = opts?.atlas;
  const region = opts?.region;
  const sconces = opts?.sconces;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + tx * CELL;
    const wz = pos.getZ(i) + tz * CELL;
    const u = pos.getX(i) / CELL + 0.5;
    const v = pos.getZ(i) / CELL + 0.5;
    const cover = puddleCoverage(map, tx, tz, u, v);
    const dip = floorDip(map, tx, tz, u, v);
    const deep = waterDeepness(map, tx, tz, u, v);
    const warmth = sconces ? torchWarmthAt(wx, wz, sconces) : 0;
    if (kind === 'floor') {
      pos.setXYZ(i, wx, dip, wz);
      if (region) {
        const uv = cisternBedWorldUvFromRegion(region, wx, wz);
        uvAttr.setXY(i, uv.u, uv.v);
      } else if (atlas) {
        const colI = atlas.index % atlas.cols;
        const rowI = Math.floor(atlas.index / atlas.cols);
        uvAttr.setXY(i, (colI + u) / atlas.cols, (rowI + v) / atlas.rows);
      } else {
        uvAttr.setXY(i, u, v);
      }
      const wet = smoothstep(0.05, 0.3, cover) * (1 - smoothstep(0.34, 0.85, cover));
      const bedHide = region ? 0 : 0.42 * deep * smoothstep(0.22, 0.85, cover);
      const k = 1 - 0.18 * wet - bedHide;
      col[i * 4] = k;
      col[i * 4 + 1] = k;
      col[i * 4 + 2] = k;
      col[i * 4 + 3] = 1;
    } else if (kind === 'wetring') {
      const ring = wetRingAmount(map, tx, tz, u, v);
      const y = (isWaterCell(map, tx, tz) ? dip : 0) + 0.0014;
      pos.setXYZ(i, wx, y, wz);
      uvAttr.setXY(i, u, v);
      const warm = 0.55 + 0.45 * warmth;
      col[i * 4] = 0.16 * warm + 0.12 * warmth;
      col[i * 4 + 1] = 0.125 * warm + 0.05 * warmth;
      col[i * 4 + 2] = 0.1 * warm;
      col[i * 4 + 3] = ring * (0.62 + 0.2 * warmth);
    } else if (kind === 'shimmer') {
      pos.setXYZ(i, wx, dip + 0.004, wz);
      const wuv = waterWorldUv(wx, wz);
      uvAttr.setXY(i, wuv.u, wuv.v);
      const veil = smoothstep(0.18, 0.62, cover) * warmth ** 0.65;
      col[i * 4] = 1;
      col[i * 4 + 1] = 0.9;
      col[i * 4 + 2] = 0.72;
      col[i * 4 + 3] = veil;
    } else {
      pos.setXYZ(i, wx, dip + 0.002, wz);
      const wuv = waterWorldUv(wx, wz);
      uvAttr.setXY(i, wuv.u, wuv.v);
      const edgeClear = 1 - 0.18 * (1 - smoothstep(0.15, 0.65, cover));
      const wallNear = wallProximity(map, tx, tz, u, v);
      const bounce = puddleReflectBoost(warmth, deep, wx, wz, wallNear);
      col[i * 4] =
        (WATER_SHALLOW_RGB.r + (WATER_DEEP_RGB.r - WATER_SHALLOW_RGB.r) * deep) *
          edgeClear *
          (1 + 0.9 * warmth) +
        WALL_REFLECT_RGB.r * bounce;
      col[i * 4 + 1] =
        (WATER_SHALLOW_RGB.g + (WATER_DEEP_RGB.g - WATER_SHALLOW_RGB.g) * deep) *
          edgeClear *
          (1 + 0.35 * warmth) +
        WALL_REFLECT_RGB.g * bounce;
      col[i * 4 + 2] =
        (WATER_SHALLOW_RGB.b + (WATER_DEEP_RGB.b - WATER_SHALLOW_RGB.b) * deep) *
          edgeClear *
          (1 + 0.1 * warmth) +
        WALL_REFLECT_RGB.b * bounce;
      col[i * 4 + 3] = puddleAlpha(map, tx, tz, u, v) * (1 + 0.45 * warmth);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  return geo;
}

export async function buildFloor1Water(
  map: FloorMap,
  sconces: readonly SconceSpec[]
): Promise<{
  group: THREE.Group;
  update: (now: number, freeze: boolean) => void;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-water';
  group.userData.castWhenOn = false;

  const cells = listWaterCells(map);
  const cistern = cisternRegion(map);
  const [innerA, innerB, rimPng, maskPng, cisternBed, ...stonePngs] = await Promise.all([
    loadPng(WATER_INNER_FILES[0]),
    loadPng(WATER_INNER_FILES[1]),
    loadPng(WATER_RIM_FILE),
    loadPng(WATER_RIM_MASK_N),
    tryLoadOptionalPng(CISTERN_BED_FILE),
    ...FLOOR_VARIANTS.map((file) => tryLoadOptionalPng(file))
  ]);
  const stoneImages = new Map<string, { width: number; height: number; data: ArrayLike<number> }>();
  FLOOR_VARIANTS.forEach((file, i) => {
    const png = stonePngs[i];
    if (png) stoneImages.set(file, png.data);
  });
  setWaterGroutSampler(stoneImages.size ? makeTextureGroutSampler(stoneImages) : null);
  const useCisternBed = !!(cistern && cisternBed);
  const cisternKeys = new Set(
    useCisternBed && cistern ? cistern.cells.map((c) => `${c.x},${c.y}`) : []
  );
  const atlasCells = cells.filter((c) => !cisternKeys.has(`${c.x},${c.y}`));
  const size = maskPng.data.width;
  const northMask = rgbaToMask(maskPng.data.data, size);
  const inners = [innerA.data.data, innerB.data.data] as const;
  const { cols, rows } = waterAtlasGrid(atlasCells.length);
  const atlasW = cols * size;
  const atlasH = rows * size;
  const atlasData = new Uint8ClampedArray(atlasW * atlasH * 4);
  atlasCells.forEach((c, index) => {
    const inner = inners[pickWaterInnerIndex(c.x, c.y)];
    const mask = rimMaskForCell(map, c.x, c.y, northMask, size);
    const blended = blendWaterOverInner(inner, rimPng.data.data, mask, size);
    const colI = index % cols;
    const rowI = Math.floor(index / cols);
    for (let y = 0; y < size; y++) {
      const dest = ((rowI * size + y) * atlasW + colI * size) * 4;
      atlasData.set(blended.subarray(y * size * 4, (y + 1) * size * 4), dest);
    }
  });
  const ripple = makeRippleNormal();
  if (useCisternBed && cistern && cisternBed) {
    const rimmed = compositeCisternBedRims(
      cisternBed.data,
      rimPng.data.data,
      northMask,
      size,
      map,
      cistern
    );
    const bedTex = textureFromPixels({
      width: cisternBed.data.width,
      height: cisternBed.data.height,
      data: rimmed
    });
    bedTex.flipY = CISTERN_BED_FLIP_Y;
    bedTex.wrapS = THREE.ClampToEdgeWrapping;
    bedTex.wrapT = THREE.ClampToEdgeWrapping;
    const bedMat = paintedShellMaterial(bedTex, undefined, 'floor_water.png');
    bedMat.vertexColors = true;
    bedMat.specularIntensity = 0;
    bedMat.map!.flipY = CISTERN_BED_FLIP_Y;
    bedMat.map!.needsUpdate = true;
    const bedGeos = cistern.cells.map((c) => cellGrid(c.x, c.y, map, 'floor', { region: cistern }));
    const bedGeo = mergeGeometries(bedGeos);
    bedGeo?.computeVertexNormals();
    if (bedGeo) {
      const mesh = new THREE.Mesh(bedGeo, bedMat);
      mesh.name = 'water-cistern-bed';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  if (atlasCells.length) {
    const atlasTex = textureFromPixels({ width: atlasW, height: atlasH, data: atlasData });
    atlasTex.flipY = false;
    const floorMat = paintedShellMaterial(atlasTex, undefined, 'floor_water.png');
    floorMat.vertexColors = true;
    floorMat.specularIntensity = 0;
    floorMat.map!.flipY = false;
    floorMat.map!.needsUpdate = true;
    const floorGeos = atlasCells.map((c, index) =>
      cellGrid(c.x, c.y, map, 'floor', { atlas: { index, cols, rows } })
    );
    const floorGeo = mergeGeometries(floorGeos);
    floorGeo?.computeVertexNormals();
    if (floorGeo) {
      const mesh = new THREE.Mesh(floorGeo, floorMat);
      mesh.name = 'water-broken-floor';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0.38,
    envMapIntensity: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    normalMap: ripple,
    normalScale: new THREE.Vector2(1.15, 1.15)
  });
  const puddleGeos = cells.map((c) => cellGrid(c.x, c.y, map, 'puddle', { sconces }));
  const puddleGeo = mergeGeometries(puddleGeos);
  puddleGeo?.computeVertexNormals();
  if (puddleGeo) {
    const mesh = new THREE.Mesh(puddleGeo, puddleMat);
    mesh.name = 'water-puddles';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.castWhenOn = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  const wetCells = listWetRingCells(map);
  const wetGeos = wetCells.map((c) => cellGrid(c.x, c.y, map, 'wetring', { sconces, segs: 8 }));
  const wetGeo = mergeGeometries(wetGeos);
  wetGeo?.computeVertexNormals();
  if (wetGeo) {
    const mesh = new THREE.Mesh(
      wetGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0,
        clearcoat: 0,
        sheen: 0,
        specularIntensity: 0.55,
        envMapIntensity: 0,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        fog: true,
        emissive: 0x000000,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    mesh.name = 'water-wet-ring';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.castWhenOn = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  const strays = listStrayPuddles(map);
  if (strays.length) {
    const geos = strays.map((s) => {
      const g = new THREE.PlaneGeometry(s.sx, s.sz, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.rotateY(s.rot);
      const y = puddleSurfaceY(map, s.tx, s.tz, 0.5, 0.5) + 0.001;
      g.translate(s.x, y, s.z);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          color: WATER_SURFACE_COLOR,
          roughness: 0.78,
          metalness: 0,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          fog: true,
          specularIntensity: 0.18,
          envMapIntensity: 0,
          emissive: 0x000000,
          normalMap: ripple,
          normalScale: new THREE.Vector2(0.4, 0.4)
        })
      );
      mesh.name = 'water-stray-puddles';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }

  const marks = listWaterTorchMarks(map, sconces);
  const atlas = makeStreakAtlas();
  if (marks.length) {
    const geos = marks.map((m) => {
      const g = new THREE.PlaneGeometry(m.sx, m.sz);
      g.rotateX(-Math.PI / 2);
      g.rotateY(m.rotY);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        if (m.kind === 'streak') uv.setXY(i, u, v * 0.5);
        else uv.setXY(i, u, 0.5 + v * 0.5);
      }
      g.translate(m.x, m.y, m.z);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: atlas,
          color: 0xf0d09a,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide
        })
      );
      mesh.name = 'water-torch-marks';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
  }

  let shimmerMat: THREE.MeshBasicMaterial | null = null;
  const shimmerCells = cells.filter((c) => cellTorchWarmth(c.x, c.y, sconces) > 0.03);
  const shimmerGeos = shimmerCells.map((c) =>
    cellGrid(c.x, c.y, map, 'shimmer', { sconces, segs: 8 })
  );
  const shimmerGeo = mergeGeometries(shimmerGeos);
  if (shimmerGeo) {
    shimmerMat = new THREE.MeshBasicMaterial({
      map: makeSoftShimmer(),
      color: 0xf2d4a0,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      vertexColors: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(shimmerGeo, shimmerMat);
    mesh.name = 'water-shimmer';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.castWhenOn = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
  }

  return {
    group,
    update: (now, freeze) => {
      const t = freeze ? 0 : now * 0.001;
      if (puddleMat.normalMap) puddleMat.normalMap.offset.set(t * 0.011, t * 0.007);
      if (shimmerMat) {
        shimmerMat.opacity = freeze ? 0.7 : 0.7 * (0.82 + 0.18 * Math.sin(t * 0.45));
        if (shimmerMat.map) shimmerMat.map.offset.set(t * 0.006, t * 0.004);
      }
    }
  };
}
