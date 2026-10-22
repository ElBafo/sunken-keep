import * as THREE from 'three';
import { CAMERA_NEAR, CELL, FLOOR_VARIANTS, LANTERN_DISTANCE, LANTERN_HOLD, SCONCE_RADIUS_TILES, TORCH_DISTANCE } from './constants';
import {
  FACE_INTO_ROOM,
  floodReach,
  floor1Sunbeams,
  sconceIsLit,
  sconceRoom,
  torchWorldPos,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
import { isShellTile, isTrueWall, isWaterCell, mappedFloorFile, tileAt, type FloorMap } from './layout';
import { pickVariant } from './variants';
import { paintedShellMaterial } from './painted';
import { loadPng, textureFromPixels } from '../voxel-lab/materials';
import {
  CISTERN_SHORE_XS,
  DECAL_MASK_DARKEN,
  SHORE_WIDE_COLS,
  SHORE_WIDE_ID,
  WATER_DECAL_FLOOR_FILE,
  WATER_DECAL_PX,
  cellToDecalUv,
  clearWaterDecalMasks,
  hasWaterDecal,
  isCrackPuddleDecal,
  isShoreWideDecal,
  waterDecalAt,
  installDecalMaskFromPixels,
  makePlaceholderPuddleDecal,
  placeWaterDecals,
  sampleWaterDecalMask,
  setDecalPlacements,
  shoreWideWorldUv,
  sliceDecalTile,
  waterDecalMaskPng,
  waterDecalPng,
  type DecalPixels
} from './water-decals';

/** Dry-border inset when a cell has no painted mask. */
export const WATER_INSET_MIN = 0.11;
export const WATER_INSET_MAX = 0.15;
/** Basin drop: 6–10 cm so the surface never meets the dry floor. */
export const WATER_DIP_SHALLOW = 0.07;
export const WATER_DIP_DEEP = 0.1;
/** Wet film / shimmer stay at least this far below dry stone. */
export const WATER_SURFACE_MIN_BELOW = 0.08;
/** Painted decals sit this far above the mesh they decorate. */
export const DECAL_LIFT = 0.008;
/** Pull floor decals toward the camera in depth — grazing views need more than a millimetre of Y. */
export const DECAL_OFFSET_FACTOR = -4;
export const DECAL_OFFSET_UNITS = -16;
export const WATER_FLOOR_SEGS = 16;
export const WATER_RIPPLE_AMP = 0.005;
/** One noise tile is larger than any pool so a 2 m cell cannot read as a repeat. */
export const WATER_NOISE_SPAN = 24;
export const CISTERN_BED_FILE = 'cistern_bed.png';
/** Artist painted north at the top of the PNG and assumed Three's default. */
export const CISTERN_BED_FLIP_Y = true;
/** Dry antechamber cell; its west edge is the cistern door. */
export const CISTERN_DOOR_CELL = { x: 4, y: 2 } as const;
/** Water cell whose east face meets that door. */
export const CISTERN_DOOR_WATER_CELL = { x: 3, y: 2 } as const;
export const WATER_INNER_FILES = ['floor_water_inner.png', 'floor_water_inner_2.png'] as const;
export const WATER_RIM_FILE = 'floor_water.png';
export const WATER_RIM_MASK_N = 'floor_water_rim_mask_n.png';
export const WATER_SURFACE_COLOR = 0x101410;
export const WATER_DEEP_COLOR = 0x030403;
const WATER_SHALLOW_RGB = { r: 0.03, g: 0.036, b: 0.03 };
const WATER_DEEP_RGB = { r: 0.01, g: 0.012, b: 0.011 };
const PUDDLE_ALPHA_SHALLOW = 0.16;
const PUDDLE_ALPHA_DEEP = 0.3;
/** Shore cells keep almost no veil so the painted lip stays readable. */
export const PUDDLE_ALPHA_DECAL_SHALLOW = 0.04;
export const PUDDLE_ALPHA_DECAL_DEEP = 0.08;
export const PUDDLE_SPECULAR = 0.07;
/** Wet-stone ring on the wide shore: warm only when a torch or lantern is in range. */
export const SHORE_LIP_GLINT = 0.42;
export const SHORE_LIP_WARM = { r: 1, g: 0.78, b: 0.52 };
/** Crack puddles: darker cooler wet film, slight sheen, not brown mud. */
export const CRACK_PUDDLE_DARKEN = 0.68;
export const CRACK_PUDDLE_OVERLAY_DARKEN = 0.52;
export const CRACK_PUDDLE_COOL = { r: 0.42, g: 0.64, b: 0.92 };
export const CRACK_PUDDLE_RGB = { r: 0.018, g: 0.028, b: 0.04 };
export const CRACK_PUDDLE_ALPHA = 0.18;
export const CRACK_PUDDLE_SPECULAR = 0.24;
/** Dark splash under a ceiling beam — smaller than a cell, not a glow disc. */
export const WATER_SPLASH_M = 0.7;
const WALL_REFLECT_RGB = { r: 0.12, g: 0.1, b: 0.08 };

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

export function hasDecalNeighbor(x: number, y: number): boolean {
  for (const face of WATER_FACES) {
    const { dx, dz } = FACE_DELTA[face];
    if (hasWaterDecal(x + dx, y + dz)) return true;
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

/**
 * Lift only the brighter painted flags off the dark bed. Water texels
 * (at or below the bed's typical luma) stay unchanged.
 */
export function liftCisternBedFlags(
  bed: { width: number; height: number; data: ArrayLike<number> },
  boost = 1.32
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(bed.data);
  const n = bed.width * bed.height;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luma[i] = 0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2];
  }
  const sorted = Float32Array.from(luma).sort();
  const lo = sorted[Math.min(n - 1, Math.floor(n * 0.45))] ?? 24;
  const cMin = lo + 14;
  const cMax = lo + 28;
  for (let i = 0; i < n; i++) {
    const t = smoothstep(cMin, cMax, luma[i]);
    if (t <= 0) continue;
    const c = 1 + (boost - 1) * t;
    const o = i * 4;
    out[o] = Math.min(255, Math.max(0, lo + (out[o] - lo) * c));
    out[o + 1] = Math.min(255, Math.max(0, lo + (out[o + 1] - lo) * c));
    out[o + 2] = Math.min(255, Math.max(0, lo + (out[o + 2] - lo) * c));
  }
  return out;
}

function meanRgbaLuma(data: ArrayLike<number>): number {
  const n = data.length >> 2;
  if (n <= 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    s += 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  return s / n;
}

/**
 * Darken a wet-rim texture so its mean luma matches the bed. Never brightens.
 * South/wall bed edges stay as painted; only the door still uses this strip.
 */
export function matchRimLumaToBed(
  rim: ArrayLike<number>,
  bed: ArrayLike<number>
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rim);
  const rimL = meanRgbaLuma(out);
  const bedL = meanRgbaLuma(bed);
  const scale = rimL > 1e-6 ? Math.min(1, bedL / rimL) : 1;
  if (scale >= 1) return out;
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.min(255, out[i] * scale);
    out[i + 1] = Math.min(255, out[i + 1] * scale);
    out[i + 2] = Math.min(255, out[i + 2] * scale);
  }
  return out;
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

/**
 * Door (4,2) is dry. Keep the bed dark on every other edge; only this
 * east face still gets a wet rim, darkened to the bed so no pale band shows.
 */
export function compositeCisternDoorRim(
  bed: { width: number; height: number; data: ArrayLike<number> },
  rim: ArrayLike<number>,
  northMask: Float32Array,
  maskSize: number,
  map: FloorMap,
  region: WaterRegion
): Uint8ClampedArray {
  if (isWaterCell(map, CISTERN_DOOR_CELL.x, CISTERN_DOOR_CELL.y)) {
    return new Uint8ClampedArray(bed.data);
  }
  const doorWater = region.cells.filter(
    (c) => c.x === CISTERN_DOOR_WATER_CELL.x && c.y === CISTERN_DOOR_WATER_CELL.y
  );
  if (!doorWater.length) return new Uint8ClampedArray(bed.data);
  return compositeCisternBedRims(
    bed,
    matchRimLumaToBed(rim, bed.data),
    northMask,
    maskSize,
    map,
    { ...region, cells: doorWater }
  );
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

/** 0–1 how close a water point is to the held lantern, in XZ. */
export function lanternWarmthAt(
  wx: number,
  wz: number,
  lx: number,
  lz: number,
  radius = LANTERN_DISTANCE
): number {
  const t = 1 - Math.hypot(wx - lx, wz - lz) / radius;
  return t > 0 ? t ** 1.5 : 0;
}

/** Wet-stone band around a painted waterline. Dry stone and open water stay 0. */
export function shoreLipResponse(cover: number): number {
  const c = Math.min(1, Math.max(0, cover));
  return smoothstep(0.1, 0.34, c) * (1 - smoothstep(0.5, 0.82, c));
}

/** Darker, cooler vertex tint inside a crack-puddle mask. */
export function crackPuddleAlbedo(
  cover: number,
  overlay: boolean
): { r: number; g: number; b: number } {
  const wet = Math.min(1, Math.max(0, cover));
  const dark = overlay ? CRACK_PUDDLE_OVERLAY_DARKEN : CRACK_PUDDLE_DARKEN;
  const k = 1 - dark * wet;
  return {
    r: k * (1 - (1 - CRACK_PUDDLE_COOL.r) * wet),
    g: k * (1 - (1 - CRACK_PUDDLE_COOL.g) * wet),
    b: k * (1 - (1 - CRACK_PUDDLE_COOL.b) * wet)
  };
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

/**
 * Wandering dry-border inset. Used only when a cell has no painted mask.
 */
export function puddleEdgeInset(tx: number, tz: number, face: WaterFace, along: number): number {
  const world = face === 'N' || face === 'S' ? tx - 0.5 + along : tz - 0.5 + along;
  const faceSeed = face.charCodeAt(0) * 0.17;
  const mid = WATER_INSET_MIN + (WATER_INSET_MAX - WATER_INSET_MIN) * 0.5;
  const bay =
    0.11 * Math.sin(world * Math.PI * 1.42 + faceSeed + 0.4) +
    0.06 * Math.sin(world * Math.PI * 2.35 + faceSeed * 2.3 + 2.2) +
    0.034 * Math.sin(world * Math.PI * 3.9 + hash01(tx, tz, 9) * 5);
  const tongue =
    Math.max(0, Math.sin(world * Math.PI * 1.85 + faceSeed + 1.1)) ** 7 *
    (0.08 + 0.045 * hash01(Math.floor(world * 2.5 + 0.2), face.charCodeAt(0), 14));
  const bite =
    Math.max(0, Math.sin(world * Math.PI * 1.05 + faceSeed * 1.7 + 2.1)) ** 9 * 0.06;
  const grain = 0.018 * Math.sin(world * Math.PI * 6.4 + faceSeed * 3 + along * 8);
  return Math.min(0.34, Math.max(WATER_INSET_MIN, mid + bay + tongue - bite) + grain);
}

function crackSeep(tx: number, tz: number, u: number, v: number): number {
  const wu = tx - 0.5 + u;
  const wv = tz - 0.5 + v;
  const a = Math.sin((wu * 4.6 + hash01(tx, tz, 3)) * Math.PI * 2);
  const b = Math.sin((wv * 3.9 + hash01(tx, tz, 5)) * Math.PI * 2);
  const c = Math.sin((wu * 1.7 - wv * 2.2 + hash01(tx, tz, 8)) * Math.PI * 2);
  const ridge = 1 - Math.min(1, Math.abs(a * 0.5 + b * 0.28 + c * 0.22) * 2.6);
  return Math.max(0, ridge) ** 1.6 * 0.85;
}

/** Mask on the far side of a cell edge, or null if that neighbour has no decal. */
export function neighborDecalMaskAcross(
  face: WaterFace,
  nx: number,
  nz: number,
  along: number
): number | null {
  if (face === 'W') return sampleWaterDecalMask(nx, nz, 1, along);
  if (face === 'E') return sampleWaterDecalMask(nx, nz, 0, along);
  if (face === 'N') return sampleWaterDecalMask(nx, nz, along, 1);
  return sampleWaterDecalMask(nx, nz, along, 0);
}

/**
 * 0–1 how wet a point in a water cell is.
 * Painted mask (white = water) wins. Water–water joins stay wet, including
 * a neighbour whose shore mask is wet at the shared edge, so the visible
 * shoreline is the painted lip instead of the cell boundary. Dry borders
 * use the wandering inset plus crack seepage.
 */
export function puddleCoverage(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  const painted = sampleWaterDecalMask(tx, tz, u, v);
  if (painted != null) return painted;
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
    const across = neighborDecalMaskAcross(s.face, s.nx, s.nz, s.along);
    if (across != null && across > 0.45) continue;
    const inset = puddleEdgeInset(tx, tz, s.face, s.along);
    const t = s.dist / Math.max(0.04, inset);
    const body = smoothstep(0.32, 1, t);
    const seep =
      crackSeep(tx, tz, u, v) * smoothstep(0.02, 0.2, s.dist) * (1 - smoothstep(0.18, 0.85, t));
    wet = Math.min(wet, Math.max(body, seep));
  }
  return wet;
}

export function puddleCoverageWorld(map: FloorMap, wx: number, wz: number): number {
  const tx = Math.floor(wx + 0.5);
  const tz = Math.floor(wz + 0.5);
  return puddleCoverage(map, tx, tz, wx - (tx - 0.5), wz - (tz - 0.5));
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
    lit * (0.07 + 0.14 * warmth) * broken * (0.45 + 0.55 * wallNear) * (1 - 0.3 * deep)
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

/** Puddle veil opacity. Thin dark tint; shore stays clear; crack film is a cool wet skim. */
export function puddleAlpha(map: FloorMap, tx: number, tz: number, u: number, v: number): number {
  const cover = puddleCoverage(map, tx, tz, u, v);
  const deep = waterDeepness(map, tx, tz, u, v);
  const spec = waterDecalAt(tx, tz);
  if (isCrackPuddleDecal(spec?.id)) {
    return smoothstep(0.28, 0.7, cover) * CRACK_PUDDLE_ALPHA;
  }
  const decal = !!spec;
  const lo = decal ? PUDDLE_ALPHA_DECAL_SHALLOW : PUDDLE_ALPHA_SHALLOW;
  const hi = decal ? PUDDLE_ALPHA_DECAL_DEEP : PUDDLE_ALPHA_DEEP;
  return smoothstep(0.28, 0.7, cover) * (lo + (hi - lo) * deep);
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
  return waterOverlayY(floorDip(map, tx, tz, u, v));
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

/**
 * Pad used to hide near-plane cracks on ceilings. Dry floors must not use
 * this — a 20 cm overlap with the next cell z-fights as a pale sawtooth
 * strip at a grazing look-back.
 */
export const FLOOR_SEAM_PAD = CAMERA_NEAR + 0.12;

export function paintedFloorDefaultSize(): number {
  return CELL + 2 * FLOOR_SEAM_PAD;
}

export type PaintedFloorQuad = {
  tx: number;
  tz: number;
  file: string;
  size: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * Painted dry floors stay one cell so neighbouring flagstone quads share an
 * edge. Water / decal cells already used CELL; stretching every other floor
 * by `FLOOR_SEAM_PAD` made two different `floor_stone*` variants coplanar
 * over a 20 cm strip, which iPhone depth precision draws as a stair-step.
 */
export function paintedFloorSize(
  _tx: number,
  _tz: number,
  _map: FloorMap,
  _defaultSize: number
): number {
  return CELL;
}

export function listPaintedFloorQuads(map: FloorMap): PaintedFloorQuad[] {
  const out: PaintedFloorQuad[] = [];
  for (let tz = 0; tz < map.height; tz++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!isShellTile(tileAt(map, tx, tz))) continue;
      if (isWaterCell(map, tx, tz) || hasWaterDecal(tx, tz)) continue;
      const size = paintedFloorSize(tx, tz, map, paintedFloorDefaultSize());
      const cx = tx * CELL;
      const cz = tz * CELL;
      const h = size / 2;
      out.push({
        tx,
        tz,
        file: mappedFloorFile(tx, tz) ?? pickVariant(FLOOR_VARIANTS, tx, tz, 'F'),
        size,
        minX: cx - h,
        maxX: cx + h,
        minZ: cz - h,
        maxZ: cz + h
      });
    }
  }
  return out;
}

export function paintedFloorQuadsCoveringCell(
  quads: readonly PaintedFloorQuad[],
  tx: number,
  tz: number,
  pad = 1e-4
): PaintedFloorQuad[] {
  const minX = (tx - 0.5) * CELL + pad;
  const maxX = (tx + 0.5) * CELL - pad;
  const minZ = (tz - 0.5) * CELL + pad;
  const maxZ = (tz + 0.5) * CELL - pad;
  return quads.filter((q) => q.maxX > minX && q.minX < maxX && q.maxZ > minZ && q.minZ < maxZ);
}

export function overlappingPaintedFloorPairs(
  quads: readonly PaintedFloorQuad[],
  minOverlap = 0.001
): Array<[PaintedFloorQuad, PaintedFloorQuad]> {
  const pairs: Array<[PaintedFloorQuad, PaintedFloorQuad]> = [];
  for (let i = 0; i < quads.length; i++) {
    for (let j = i + 1; j < quads.length; j++) {
      const a = quads[i]!;
      const b = quads[j]!;
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox > minOverlap && oz > minOverlap) pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Wet-film / shimmer height. Follows the basin, but never rises onto the
 * dry floor — that 1–2 mm lift was coplanar with floor_stone at the door
 * and shore and z-fought as a flat tan sheet.
 */
export function waterOverlayY(dip: number, lift = DECAL_LIFT): number {
  return Math.min(dip + lift, -WATER_SURFACE_MIN_BELOW);
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

export function listWaterfallSplashes(
  map: FloorMap,
  beams: readonly SunbeamSpec[] = floor1Sunbeams
): Array<{ tx: number; tz: number; x: number; y: number; z: number; span: number }> {
  const out: Array<{ tx: number; tz: number; x: number; y: number; z: number; span: number }> = [];
  for (const b of beams) {
    if (!isWaterCell(map, b.x, b.y)) continue;
    out.push({
      tx: b.x,
      tz: b.y,
      x: b.wx,
      y: puddleSurfaceY(map, b.x, b.y, 0.5, 0.5) + 0.006,
      z: b.wz,
      span: WATER_SPLASH_M
    });
  }
  return out;
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
      x: wallX + nx * 0.42,
      y,
      z: wallZ + nz * 0.42,
      rotY: planeRotY(nx, nz),
      sx: 0.36,
      sz: 0.14
    });
    out.push({
      kind: 'wall',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * 0.16,
      y: y - 0.001,
      z: wallZ + nz * 0.16,
      rotY: planeRotY(-nz, nx),
      sx: 0.4,
      sz: 0.12
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
      const peak = Math.max(0, n);
      const a = peak * peak * peak * 0.22;
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

/** Dark broken rings where a ceiling beam hits the pool. No filled disc. */
function makeWaterfallSplash(): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  const cx = (s - 1) * 0.5;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cx) / cx;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const wobble = 0.05 * Math.sin(ang * 5.4 + 0.7) + 0.028 * Math.sin(ang * 11.2 + 1.4);
      const rr = r + wobble;
      const ring =
        Math.exp(-(((rr - 0.34) * 18) ** 2)) * 0.55 +
        Math.exp(-(((rr - 0.52) * 14) ** 2)) * 0.9 +
        Math.exp(-(((rr - 0.7) * 11) ** 2)) * 0.4;
      const broken = 0.35 + 0.65 * Math.max(0, Math.sin(ang * 3.6 + 0.9));
      const spray =
        Math.exp(-(((rr - 0.6) * 9) ** 2)) * broken * (0.3 + 0.7 * Math.max(0, Math.sin(ang * 7.1)));
      const hole = 1 - smoothstep(0.0, 0.22, r);
      const fade = 1 - smoothstep(0.78, 1.02, r);
      const a = Math.min(1, (ring + spray) * fade * (1 - 0.85 * hole));
      const i = (y * s + x) * 4;
      img.data[i] = 10;
      img.data[i + 1] = 14;
      img.data[i + 2] = 12;
      img.data[i + 3] = Math.round(a * 230);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** A few warm specks on the splash ring — never a filled glow. */
function makeSplashGlints(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  const spots = [
    [0.72, 0.28, 2.2],
    [0.3, 0.34, 1.7],
    [0.78, 0.62, 1.9],
    [0.4, 0.76, 1.5],
    [0.58, 0.2, 1.4],
    [0.22, 0.58, 1.6]
  ] as const;
  for (const [u, v, rad] of spots) {
    paintSoftBlob(ctx, u * s, v * s, rad, rad * 0.7, '232, 176, 110', 0.7);
  }
  const tex = new THREE.CanvasTexture(canvas);
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
  kind: 'floor' | 'puddle' | 'shimmer',
  opts?: {
    atlas?: { index: number; cols: number; rows: number };
    region?: WaterRegion;
    sconces?: readonly SconceSpec[];
    segs?: number;
    crack?: boolean;
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
    } else if (kind === 'shimmer') {
      pos.setXYZ(i, wx, waterOverlayY(dip, DECAL_LIFT + 0.004), wz);
      const wuv = waterWorldUv(wx, wz);
      uvAttr.setXY(i, wuv.u, wuv.v);
      const peak = smoothstep(0.62, 0.88, waterWorldNoise(wx, wz, 3.1));
      const veil = peak * smoothstep(0.28, 0.7, cover) * warmth ** 1.35 * 0.16;
      col[i * 4] = 1;
      col[i * 4 + 1] = 0.86;
      col[i * 4 + 2] = 0.62;
      col[i * 4 + 3] = veil;
    } else {
      pos.setXYZ(i, wx, waterOverlayY(dip), wz);
      const wuv = waterWorldUv(wx, wz);
      uvAttr.setXY(i, wuv.u, wuv.v);
      const edgeClear = 1 - 0.18 * (1 - smoothstep(0.15, 0.65, cover));
      const wallNear = wallProximity(map, tx, tz, u, v);
      const bounce = puddleReflectBoost(warmth, deep, wx, wz, wallNear);
      const shallow = opts?.crack ? CRACK_PUDDLE_RGB : WATER_SHALLOW_RGB;
      const deepRgb = opts?.crack ? CRACK_PUDDLE_RGB : WATER_DEEP_RGB;
      col[i * 4] =
        (shallow.r + (deepRgb.r - shallow.r) * deep) * edgeClear * (1 + 0.12 * warmth) +
        WALL_REFLECT_RGB.r * bounce;
      col[i * 4 + 1] =
        (shallow.g + (deepRgb.g - shallow.g) * deep) * edgeClear * (1 + 0.08 * warmth) +
        WALL_REFLECT_RGB.g * bounce;
      col[i * 4 + 2] =
        (shallow.b + (deepRgb.b - shallow.b) * deep) * edgeClear * (1 + 0.04 * warmth) +
        WALL_REFLECT_RGB.b * bounce;
      col[i * 4 + 3] = puddleAlpha(map, tx, tz, u, v) * (1 + 0.05 * warmth);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  return geo;
}

function maskFromDecalAlpha(decal: DecalPixels): DecalPixels {
  const data = new Uint8ClampedArray(decal.data.length);
  for (let i = 0; i < decal.data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = decal.data[i + 3];
    data[i + 3] = 255;
  }
  return { width: decal.width, height: decal.height, data };
}

function resolvePuddleDecal(
  files: Map<string, { decal: DecalPixels | null; mask: DecalPixels | null }>,
  id: string,
  tile: number
): { decal: DecalPixels; mask: DecalPixels } {
  const found = files.get(id);
  if (found?.decal) {
    const decal = sliceDecalTile(found.decal, tile);
    const mask = found.mask ? sliceDecalTile(found.mask, tile) : maskFromDecalAlpha(decal);
    return { decal, mask };
  }
  return makePlaceholderPuddleDecal(tile, 'S');
}

/**
 * Flat cell quad. Floor_stone and the 512 decal share this UV so grout
 * lines up; rot/mirror must match exactly.
 */
function decalOrientedGrid(
  tx: number,
  tz: number,
  y: number,
  rot: 0 | 90 | 180 | 270 = 0,
  mirror = false,
  atlas?: { index: number; cols: number; rows: number },
  map?: FloorMap,
  darken = true,
  crack = false,
  strip?: { x0: number; cols: number }
): THREE.BufferGeometry {
  const segs = map ? WATER_FLOOR_SEGS : 1;
  const geo = new THREE.PlaneGeometry(CELL, CELL, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const uvAttr = geo.getAttribute('uv');
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + tx * CELL;
    const wz = pos.getZ(i) + tz * CELL;
    const u = pos.getX(i) / CELL + 0.5;
    const v = pos.getZ(i) / CELL + 0.5;
    const local = cellToDecalUv(u, v, rot, mirror);
    const dip = map ? floorDip(map, tx, tz, u, v) : 0;
    pos.setXYZ(i, wx, y + dip, wz);
    if (strip) {
      uvAttr.setXY(i, shoreWideWorldUv(tx, local.u, strip.x0, strip.cols), local.v);
    } else if (atlas) {
      const colI = atlas.index % atlas.cols;
      const rowI = Math.floor(atlas.index / atlas.cols);
      uvAttr.setXY(i, (colI + local.u) / atlas.cols, (rowI + local.v) / atlas.rows);
    } else {
      uvAttr.setXY(i, local.u, local.v);
    }
    const cover = map ? puddleCoverage(map, tx, tz, u, v) : 0;
    if (crack) {
      const tint = crackPuddleAlbedo(cover, !darken);
      col[i * 4] = tint.r;
      col[i * 4 + 1] = tint.g;
      col[i * 4 + 2] = tint.b;
    } else {
      const k = darken ? 1 - DECAL_MASK_DARKEN * cover : 1;
      col[i * 4] = k;
      col[i * 4 + 1] = k;
      col[i * 4 + 2] = k;
    }
    col[i * 4 + 3] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  return geo;
}

/** Transparent floor overlays: no depth write, pulled forward, discard empty texels. */
function floorOverlayFlags(alphaTest = 0.04): {
  transparent: true;
  depthWrite: false;
  polygonOffset: true;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  alphaTest: number;
} {
  return {
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: DECAL_OFFSET_FACTOR,
    polygonOffsetUnits: DECAL_OFFSET_UNITS,
    alphaTest
  };
}

export async function buildFloor1Water(
  map: FloorMap,
  sconces: readonly SconceSpec[]
): Promise<{
  group: THREE.Group;
  update: (now: number, freeze: boolean, camera?: THREE.Camera) => void;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-water';
  group.userData.castWhenOn = false;

  clearWaterDecalMasks();
  const cells = listWaterCells(map);
  const cistern = cisternRegion(map);
  const placements = placeWaterDecals(map);
  setDecalPlacements(placements);
  const decalIds = [...new Set(placements.map((d) => d.id))];
  const [innerA, innerB, rimPng, maskPng, cisternBed, stonePng] = await Promise.all([
    loadPng(WATER_INNER_FILES[0]),
    loadPng(WATER_INNER_FILES[1]),
    loadPng(WATER_RIM_FILE),
    loadPng(WATER_RIM_MASK_N),
    tryLoadOptionalPng(CISTERN_BED_FILE),
    loadPng(WATER_DECAL_FLOOR_FILE)
  ]);
  const decalFiles = new Map<string, { decal: DecalPixels | null; mask: DecalPixels | null }>();
  await Promise.all(
    decalIds.map(async (id) => {
      const [decal, mask] = await Promise.all([
        tryLoadOptionalPng(waterDecalPng(id)),
        tryLoadOptionalPng(waterDecalMaskPng(id))
      ]);
      decalFiles.set(id, {
        decal: decal ? { width: decal.data.width, height: decal.data.height, data: asBytes(decal.data.data) } : null,
        mask: mask ? { width: mask.data.width, height: mask.data.height, data: asBytes(mask.data.data) } : null
      });
    })
  );
  const decalPlacements = placements
    .filter((d) => isWaterCell(map, d.x, d.y) || isShoreWideDecal(d.id))
    .map((spec) => {
    const tile = spec.tile ?? 0;
    const pixels = resolvePuddleDecal(decalFiles, spec.id, tile);
    installDecalMaskFromPixels(spec.x, spec.y, pixels.mask);
    return { spec, tile, ...pixels };
  });
  const useCisternBed = !!(cistern && cisternBed);
  const cisternKeys = new Set(
    useCisternBed && cistern
      ? cistern.cells.filter((c) => !hasWaterDecal(c.x, c.y)).map((c) => `${c.x},${c.y}`)
      : []
  );
  const atlasCells = cells.filter(
    (c) => !cisternKeys.has(`${c.x},${c.y}`) && !hasWaterDecal(c.x, c.y)
  );
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
    const lifted = liftCisternBedFlags({
      width: cisternBed.data.width,
      height: cisternBed.data.height,
      data: asBytes(cisternBed.data.data)
    });
    const bedPixels = compositeCisternDoorRim(
      { width: cisternBed.data.width, height: cisternBed.data.height, data: lifted },
      rimPng.data.data,
      northMask,
      size,
      map,
      cistern
    );
    const bedTex = textureFromPixels({
      width: cisternBed.data.width,
      height: cisternBed.data.height,
      data: bedPixels
    });
    bedTex.flipY = CISTERN_BED_FLIP_Y;
    bedTex.wrapS = THREE.ClampToEdgeWrapping;
    bedTex.wrapT = THREE.ClampToEdgeWrapping;
    const bedMat = paintedShellMaterial(bedTex, undefined, 'floor_water.png');
    bedMat.vertexColors = true;
    bedMat.specularIntensity = 0;
    bedMat.map!.flipY = CISTERN_BED_FLIP_Y;
    bedMat.map!.needsUpdate = true;
    const bedGeos = cistern.cells
      .filter((c) => !hasWaterDecal(c.x, c.y))
      .map((c) => cellGrid(c.x, c.y, map, 'floor', { region: cistern }));
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

  const shorePlacements = decalPlacements.filter((p) => isShoreWideDecal(p.spec.id));
  const crackPlacements = decalPlacements.filter((p) => !isShoreWideDecal(p.spec.id));
  let shoreRimAttr: THREE.BufferAttribute | null = null;
  let shoreRimWx: Float32Array | null = null;
  let shoreRimWz: Float32Array | null = null;
  let shoreRimPeak: Float32Array | null = null;
  const lanternWorld = new THREE.Vector3();

  if (shorePlacements.length) {
    const wide = decalFiles.get(SHORE_WIDE_ID)?.decal;
    const shoreDecal =
      wide && wide.width >= WATER_DECAL_PX * SHORE_WIDE_COLS
        ? wide
        : {
            width: WATER_DECAL_PX * SHORE_WIDE_COLS,
            height: WATER_DECAL_PX,
            data: (() => {
              const out = new Uint8ClampedArray(WATER_DECAL_PX * SHORE_WIDE_COLS * WATER_DECAL_PX * 4);
              shorePlacements.forEach((p, i) => {
                const w = Math.min(WATER_DECAL_PX, p.decal.width);
                const h = Math.min(WATER_DECAL_PX, p.decal.height);
                for (let y = 0; y < h; y++) {
                  out.set(
                    p.decal.data.subarray(y * p.decal.width * 4, y * p.decal.width * 4 + w * 4),
                    (y * WATER_DECAL_PX * SHORE_WIDE_COLS + i * WATER_DECAL_PX) * 4
                  );
                }
              });
              return out;
            })()
          };
    const shoreMat = paintedShellMaterial(stonePng.texture, undefined, WATER_DECAL_FLOOR_FILE);
    shoreMat.specularIntensity = 0;
    shoreMat.vertexColors = true;
    const shoreGeos = shorePlacements.map(({ spec }) =>
      decalOrientedGrid(spec.x, spec.y, 0, 0, false, undefined, map, true, false)
    );
    const shoreGeo = mergeGeometries(shoreGeos);
    if (shoreGeo) {
      const mesh = new THREE.Mesh(shoreGeo, shoreMat);
      mesh.name = 'water-shore-wide';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    const paintTex = textureFromPixels(shoreDecal);
    paintTex.flipY = true;
    paintTex.wrapS = THREE.ClampToEdgeWrapping;
    paintTex.wrapT = THREE.ClampToEdgeWrapping;
    paintTex.magFilter = THREE.LinearFilter;
    paintTex.minFilter = THREE.LinearFilter;
    paintTex.generateMipmaps = false;
    paintTex.needsUpdate = true;
    const paintMat = new THREE.MeshPhysicalMaterial({
      map: paintTex,
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      clearcoat: 0,
      sheen: 0,
      specularIntensity: 0,
      envMapIntensity: 0,
      ...floorOverlayFlags(),
      opacity: 1,
      fog: true,
      emissive: 0x000000,
      vertexColors: false
    });
    const paintGeos = shorePlacements.map(({ spec }) =>
      decalOrientedGrid(
        spec.x,
        spec.y,
        DECAL_LIFT,
        0,
        false,
        undefined,
        map,
        false,
        false,
        { x0: CISTERN_SHORE_XS[0], cols: SHORE_WIDE_COLS }
      )
    );
    const paintGeo = mergeGeometries(paintGeos);
    if (paintGeo) {
      const mesh = new THREE.Mesh(paintGeo, paintMat);
      mesh.name = 'water-shore-paint';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      group.add(mesh);
    }
    const rimGeos = shorePlacements.map(({ spec }) =>
      decalOrientedGrid(
        spec.x,
        spec.y,
        DECAL_LIFT + 0.004,
        0,
        false,
        undefined,
        map,
        false,
        false,
        { x0: CISTERN_SHORE_XS[0], cols: SHORE_WIDE_COLS }
      )
    );
    const rimGeo = mergeGeometries(rimGeos);
    if (rimGeo) {
      const pos = rimGeo.getAttribute('position');
      const col = rimGeo.getAttribute('color') as THREE.BufferAttribute;
      shoreRimWx = new Float32Array(pos.count);
      shoreRimWz = new Float32Array(pos.count);
      shoreRimPeak = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i);
        const wz = pos.getZ(i);
        shoreRimWx[i] = wx;
        shoreRimWz[i] = wz;
        const cover = puddleCoverageWorld(map, wx, wz);
        const broken = 0.7 + 0.3 * Math.max(0, waterWorldNoise(wx, wz, 6.4));
        shoreRimPeak[i] = shoreLipResponse(cover) * broken;
        col.setXYZW(i, SHORE_LIP_WARM.r, SHORE_LIP_WARM.g, SHORE_LIP_WARM.b, 0);
      }
      shoreRimAttr = col;
      const mesh = new THREE.Mesh(
        rimGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe8b57a,
          ...floorOverlayFlags(0.01),
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          fog: false,
          toneMapped: false,
          vertexColors: true,
          side: THREE.DoubleSide
        })
      );
      mesh.name = 'water-shore-rim';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      group.add(mesh);
    }
  }

  if (crackPlacements.length) {
    const stoneMat = paintedShellMaterial(stonePng.texture, undefined, WATER_DECAL_FLOOR_FILE);
    stoneMat.specularIntensity = 0;
    stoneMat.vertexColors = true;
    const floorGeos = crackPlacements.map(({ spec }) =>
      decalOrientedGrid(
        spec.x,
        spec.y,
        0,
        spec.rot ?? 0,
        spec.mirror,
        undefined,
        map,
        true,
        isCrackPuddleDecal(spec.id)
      )
    );
    const floorGeo = mergeGeometries(floorGeos);
    if (floorGeo) {
      const mesh = new THREE.Mesh(floorGeo, stoneMat);
      mesh.name = 'water-decal-floor';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    const cols = crackPlacements.length;
    const atlasW = WATER_DECAL_PX * cols;
    const atlasH = WATER_DECAL_PX;
    const atlasData = new Uint8ClampedArray(atlasW * atlasH * 4);
    crackPlacements.forEach((p, i) => {
      const w = Math.min(WATER_DECAL_PX, p.decal.width);
      const h = Math.min(WATER_DECAL_PX, p.decal.height);
      for (let y = 0; y < h; y++) {
        atlasData.set(
          p.decal.data.subarray(y * p.decal.width * 4, y * p.decal.width * 4 + w * 4),
          ((y * atlasW) + i * WATER_DECAL_PX) * 4
        );
      }
    });
    const decalTex = textureFromPixels({ width: atlasW, height: atlasH, data: atlasData });
    decalTex.flipY = true;
    const decalMat = new THREE.MeshPhysicalMaterial({
      map: decalTex,
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      clearcoat: 0,
      sheen: 0,
      specularIntensity: 0,
      envMapIntensity: 0,
      ...floorOverlayFlags(),
      opacity: 1,
      fog: true,
      emissive: 0x000000,
      vertexColors: true
    });
    const decalGeos = crackPlacements.map(({ spec }, index) =>
      decalOrientedGrid(
        spec.x,
        spec.y,
        DECAL_LIFT,
        spec.rot ?? 0,
        spec.mirror,
        {
          index,
          cols,
          rows: 1
        },
        map,
        false,
        isCrackPuddleDecal(spec.id)
      )
    );
    const decalGeo = mergeGeometries(decalGeos);
    if (decalGeo) {
      const mesh = new THREE.Mesh(decalGeo, decalMat);
      mesh.name = 'water-decals';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      group.add(mesh);
    }
  }

  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: PUDDLE_SPECULAR,
    envMapIntensity: 0,
    ...floorOverlayFlags(),
    opacity: 1,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    normalMap: ripple,
    normalScale: new THREE.Vector2(0.55, 0.55)
  });
  const puddleGeos = cells
    .filter((c) => !hasWaterDecal(c.x, c.y))
    .map((c) => cellGrid(c.x, c.y, map, 'puddle', { sconces }));
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

  const crackCells = cells.filter((c) => isCrackPuddleDecal(waterDecalAt(c.x, c.y)?.id));
  let crackPuddleMat: THREE.MeshPhysicalMaterial | null = null;
  if (crackCells.length) {
    crackPuddleMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0,
      sheen: 0,
      specularIntensity: CRACK_PUDDLE_SPECULAR,
      envMapIntensity: 0,
      ...floorOverlayFlags(),
      opacity: 1,
      fog: true,
      emissive: 0x000000,
      emissiveIntensity: 0,
      vertexColors: true,
      normalMap: ripple,
      normalScale: new THREE.Vector2(0.78, 0.78)
    });
    const crackGeos = crackCells.map((c) =>
      cellGrid(c.x, c.y, map, 'puddle', { sconces, crack: true })
    );
    const crackGeo = mergeGeometries(crackGeos);
    crackGeo?.computeVertexNormals();
    if (crackGeo) {
      const mesh = new THREE.Mesh(crackGeo, crackPuddleMat);
      mesh.name = 'water-crack-puddles';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
  }

  let crackGlintAttr: THREE.BufferAttribute | null = null;
  let crackGlintWx: Float32Array | null = null;
  let crackGlintWz: Float32Array | null = null;
  let crackGlintPeak: Float32Array | null = null;
  if (crackCells.length) {
    const glintGeos = crackCells.map((c) => cellGrid(c.x, c.y, map, 'shimmer', { sconces, segs: 8 }));
    const glintGeo = mergeGeometries(glintGeos);
    if (glintGeo) {
      const pos = glintGeo.getAttribute('position');
      const col = glintGeo.getAttribute('color') as THREE.BufferAttribute;
      crackGlintWx = new Float32Array(pos.count);
      crackGlintWz = new Float32Array(pos.count);
      crackGlintPeak = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i);
        const wz = pos.getZ(i);
        crackGlintWx[i] = wx;
        crackGlintWz[i] = wz;
        const cover = puddleCoverageWorld(map, wx, wz);
        const peak = smoothstep(0.58, 0.9, waterWorldNoise(wx, wz, 5.1));
        crackGlintPeak[i] = peak * smoothstep(0.28, 0.7, cover);
        col.setXYZW(i, 1, 0.82, 0.58, 0);
      }
      crackGlintAttr = col;
      const mesh = new THREE.Mesh(
        glintGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf0c48a,
          ...floorOverlayFlags(0.01),
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          fog: false,
          toneMapped: false,
          vertexColors: true,
          side: THREE.DoubleSide
        })
      );
      mesh.name = 'water-crack-glints';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      group.add(mesh);
    }
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
          ...floorOverlayFlags(),
          opacity: 0.22,
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
          color: 0xd9b07a,
          ...floorOverlayFlags(0.01),
          opacity: 0.28,
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
  const shimmerCells = cells.filter(
    (c) => !hasWaterDecal(c.x, c.y) && cellTorchWarmth(c.x, c.y, sconces) > 0.03
  );
  const shimmerGeos = shimmerCells.map((c) =>
    cellGrid(c.x, c.y, map, 'shimmer', { sconces, segs: 8 })
  );
  const shimmerGeo = mergeGeometries(shimmerGeos);
  if (shimmerGeo) {
    shimmerMat = new THREE.MeshBasicMaterial({
      map: makeSoftShimmer(),
      color: 0xe2c090,
      ...floorOverlayFlags(0.01),
      opacity: 0.28,
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

  let splashMat: THREE.MeshBasicMaterial | null = null;
  const splashes = listWaterfallSplashes(map);
  if (splashes.length) {
    splashMat = new THREE.MeshBasicMaterial({
      map: makeWaterfallSplash(),
      color: 0xffffff,
      ...floorOverlayFlags(),
      opacity: 0.9,
      fog: true,
      toneMapped: true,
      side: THREE.DoubleSide
    });
    const splashGeos = splashes.map((s) => {
      const g = new THREE.PlaneGeometry(s.span, s.span);
      g.rotateX(-Math.PI / 2);
      g.translate(s.x, s.y, s.z);
      return g;
    });
    const splashGeo = mergeGeometries(splashGeos);
    if (splashGeo) {
      const mesh = new THREE.Mesh(splashGeo, splashMat);
      mesh.name = 'water-fall-splash';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      group.add(mesh);
    }
    const glintGeos = splashes.map((s) => {
      const g = new THREE.PlaneGeometry(s.span * 0.85, s.span * 0.85);
      g.rotateX(-Math.PI / 2);
      g.translate(s.x, s.y + 0.001, s.z);
      return g;
    });
    const glintGeo = mergeGeometries(glintGeos);
    if (glintGeo) {
      const mesh = new THREE.Mesh(
        glintGeo,
        new THREE.MeshBasicMaterial({
          map: makeSplashGlints(),
          color: 0xf0c48a,
          ...floorOverlayFlags(0.01),
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide
        })
      );
      mesh.name = 'water-fall-glints';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      group.add(mesh);
    }
  }

  return {
    group,
    update: (now: number, freeze: boolean, camera?: THREE.Camera) => {
      const t = freeze ? 0 : now * 0.001;
      if (puddleMat.normalMap) puddleMat.normalMap.offset.set(t * 0.011, t * 0.007);
      if (crackPuddleMat?.normalMap) crackPuddleMat.normalMap.offset.set(t * 0.011, t * 0.007);
      if (shimmerMat) {
        shimmerMat.opacity = freeze ? 0.28 : 0.28 * (0.84 + 0.16 * Math.sin(t * 0.45));
        if (shimmerMat.map) shimmerMat.map.offset.set(t * 0.006, t * 0.004);
      }
      if (splashMat?.map) {
        const spin = freeze ? 0 : t * 0.12;
        splashMat.map.center.set(0.5, 0.5);
        splashMat.map.rotation = spin;
      }
      if (camera) {
        lanternWorld.set(LANTERN_HOLD[0], LANTERN_HOLD[1], LANTERN_HOLD[2]).applyMatrix4(camera.matrixWorld);
      }
      if (crackGlintAttr && crackGlintWx && crackGlintWz && crackGlintPeak) {
        const arr = crackGlintAttr.array as Float32Array;
        for (let i = 0; i < crackGlintWx.length; i++) {
          const torch = torchWarmthAt(crackGlintWx[i], crackGlintWz[i], sconces);
          const lamp = camera
            ? lanternWarmthAt(crackGlintWx[i], crackGlintWz[i], lanternWorld.x, lanternWorld.z)
            : 0;
          const warmth = Math.max(torch, lamp);
          arr[i * 4 + 3] = crackGlintPeak[i] * warmth ** 1.25 * 0.4;
        }
        crackGlintAttr.needsUpdate = true;
      }
      if (shoreRimAttr && shoreRimWx && shoreRimWz && shoreRimPeak) {
        const arr = shoreRimAttr.array as Float32Array;
        for (let i = 0; i < shoreRimWx.length; i++) {
          const torch = torchWarmthAt(shoreRimWx[i], shoreRimWz[i], sconces);
          const lamp = camera
            ? lanternWarmthAt(shoreRimWx[i], shoreRimWz[i], lanternWorld.x, lanternWorld.z)
            : 0;
          const warmth = Math.max(torch, lamp);
          arr[i * 4 + 3] = shoreRimPeak[i] * warmth ** 1.15 * SHORE_LIP_GLINT;
        }
        shoreRimAttr.needsUpdate = true;
      }
    }
  };
}
