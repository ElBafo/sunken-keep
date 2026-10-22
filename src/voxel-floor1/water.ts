import * as THREE from 'three';
import { CELL, SCONCE_RADIUS_TILES } from './constants';
import { FACE_INTO_ROOM, floodReach, sconceIsLit, sconceRoom, type SconceSpec } from './fixtures';
import { isWaterCell, tileAt, type FloorMap } from './layout';
import { paintedShellMaterial } from './painted';
import { loadPng, textureFromPixels } from '../voxel-lab/materials';

/** Dip stays in the inner 70–80% of a dry-facing cell. */
export const WATER_INSET_MIN = 0.11;
export const WATER_INSET_MAX = 0.15;
export const WATER_DIP_SHALLOW = 0.028;
export const WATER_DIP_DEEP = 0.06;
export const WATER_FLOOR_SEGS = 16;
export const WATER_RIPPLE_AMP = 0.005;
const WATER_RIPPLE_HZ = 0.14;
export const WATER_INNER_FILES = ['floor_water_inner.png', 'floor_water_inner_2.png'] as const;
export const WATER_RIM_FILE = 'floor_water.png';
export const WATER_RIM_MASK_N = 'floor_water_rim_mask_n.png';
export const WATER_SURFACE_COLOR = 0x101410;
export const WATER_DEEP_COLOR = 0x030403;
const WATER_SHALLOW_RGB = { r: 0.07, g: 0.078, b: 0.07 };
const WATER_DEEP_RGB = { r: 0.016, g: 0.02, b: 0.018 };
const PUDDLE_ALPHA_SHALLOW = 0.26;
const PUDDLE_ALPHA_DEEP = 0.86;

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
 * How far the puddle body sits in from a dry face, in cell units.
 * World-space bays and tongues so a 3-cell cistern edge wanders in
 * the player's view instead of reading as one straight line.
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
  return Math.min(0.34, Math.max(0.11, mid + bay + tongue - bite) + grain);
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

/**
 * 0–1 how wet a point in a water cell is.
 * Water–water joins stay wet. Dry borders inset to the inner 70–80%,
 * with only crack seepage reaching the matching stone edge.
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
      x: wallX + nx * 0.52,
      y,
      z: wallZ + nz * 0.52,
      rotY: planeRotY(nx, nz),
      sx: 0.95,
      sz: 0.4
    });
    out.push({
      kind: 'wall',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * 0.18,
      y: y - 0.001,
      z: wallZ + nz * 0.18,
      rotY: planeRotY(-nz, nx),
      sx: CELL * 0.55,
      sz: 0.22
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
    const u = x / size;
    const v = y / size;
    return (
      Math.sin(u * Math.PI * 4.4) * 0.42 +
      Math.sin((u * 0.7 + v) * Math.PI * 3.1) * 0.3 +
      Math.sin((v * 1.4 - u * 0.5) * Math.PI * 6.2) * 0.18
    );
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      let nx = -dx * 3.2;
      let ny = -dy * 3.2;
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
  ctx.clearRect(0, 0, w, h);
  const blobs = [
    [40, 70, 38, 18, 0.42],
    [120, 40, 52, 16, 0.3],
    [200, 110, 34, 22, 0.36],
    [70, 180, 46, 20, 0.28],
    [170, 200, 40, 14, 0.33],
    [150, 130, 28, 12, 0.22]
  ] as const;
  for (const [x, y, rx, ry, a] of blobs) {
    paintSoftBlob(ctx, x, y, rx, ry, '255, 214, 160', a);
  }
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
  kind: 'floor' | 'puddle',
  atlas?: { index: number; cols: number; rows: number }
): THREE.BufferGeometry {
  const segs = WATER_FLOOR_SEGS;
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
    const cover = puddleCoverage(map, tx, tz, u, v);
    const dip = floorDip(map, tx, tz, u, v);
    const deep = waterDeepness(map, tx, tz, u, v);
    if (kind === 'floor') {
      pos.setXYZ(i, wx, dip, wz);
      if (atlas) {
        const colI = atlas.index % atlas.cols;
        const rowI = Math.floor(atlas.index / atlas.cols);
        uvAttr.setXY(i, (colI + u) / atlas.cols, (rowI + v) / atlas.rows);
      } else {
        uvAttr.setXY(i, u, v);
      }
      const wet = smoothstep(0.05, 0.3, cover) * (1 - smoothstep(0.34, 0.85, cover));
      const bedHide = 0.42 * deep * smoothstep(0.22, 0.85, cover);
      const k = 1 - 0.18 * wet - bedHide;
      col[i * 4] = k;
      col[i * 4 + 1] = k;
      col[i * 4 + 2] = k;
      col[i * 4 + 3] = 1;
    } else {
      pos.setXYZ(i, wx, dip + 0.002, wz);
      uvAttr.setXY(i, wx / (CELL * 2.8), wz / (CELL * 2.8));
      const edgeClear = 1 - 0.18 * (1 - smoothstep(0.15, 0.65, cover));
      col[i * 4] = (WATER_SHALLOW_RGB.r + (WATER_DEEP_RGB.r - WATER_SHALLOW_RGB.r) * deep) * edgeClear;
      col[i * 4 + 1] = (WATER_SHALLOW_RGB.g + (WATER_DEEP_RGB.g - WATER_SHALLOW_RGB.g) * deep) * edgeClear;
      col[i * 4 + 2] = (WATER_SHALLOW_RGB.b + (WATER_DEEP_RGB.b - WATER_SHALLOW_RGB.b) * deep) * edgeClear;
      col[i * 4 + 3] = puddleAlpha(map, tx, tz, u, v);
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
  const [innerA, innerB, rimPng, maskPng] = await Promise.all([
    loadPng(WATER_INNER_FILES[0]),
    loadPng(WATER_INNER_FILES[1]),
    loadPng(WATER_RIM_FILE),
    loadPng(WATER_RIM_MASK_N)
  ]);
  const size = maskPng.data.width;
  const northMask = rgbaToMask(maskPng.data.data, size);
  const inners = [innerA.data.data, innerB.data.data] as const;
  const { cols, rows } = waterAtlasGrid(cells.length);
  const atlasW = cols * size;
  const atlasH = rows * size;
  const atlasData = new Uint8ClampedArray(atlasW * atlasH * 4);
  cells.forEach((c, index) => {
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
  const atlasTex = textureFromPixels({ width: atlasW, height: atlasH, data: atlasData });
  atlasTex.flipY = false;
  const ripple = makeRippleNormal();
  const floorMat = paintedShellMaterial(atlasTex, undefined, 'floor_water.png');
  floorMat.vertexColors = true;
  floorMat.specularIntensity = 0;
  floorMat.map!.flipY = false;
  floorMat.map!.needsUpdate = true;

  const floorGeos = cells.map((c, index) => cellGrid(c.x, c.y, map, 'floor', { index, cols, rows }));
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

  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0.18,
    envMapIntensity: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    normalMap: ripple,
    normalScale: new THREE.Vector2(0.9, 0.9)
  });
  const puddleGeos = cells.map((c) => cellGrid(c.x, c.y, map, 'puddle'));
  let puddle: THREE.Mesh | null = null;
  let restY: Float32Array | null = null;
  const puddleGeo = mergeGeometries(puddleGeos);
  puddleGeo?.computeVertexNormals();
  if (puddleGeo) {
    const pos = puddleGeo.getAttribute('position');
    restY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) restY[i] = pos.getY(i);
    const mesh = new THREE.Mesh(puddleGeo, puddleMat);
    mesh.name = 'water-puddles';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.castWhenOn = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
    puddle = mesh;
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
          opacity: 0.62,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: true,
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
  const glintKeys = new Set(listWaterGlintCells(map, sconces).map((c) => `${c.x},${c.y}`));
  const shimmerRegions = listWaterRegions(map).filter((r) =>
    r.cells.some((c) => glintKeys.has(`${c.x},${c.y}`))
  );
  if (shimmerRegions.length) {
    shimmerMat = new THREE.MeshBasicMaterial({
      map: makeSoftShimmer(),
      color: 0xf2d4a0,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const geos = shimmerRegions.map((r) => {
      const sx = (r.maxX - r.minX + 1) * CELL * 0.9;
      const sz = (r.maxY - r.minY + 1) * CELL * 0.9;
      const cx = ((r.minX + r.maxX) / 2) * CELL;
      const cz = ((r.minY + r.maxY) / 2) * CELL;
      const mid = r.cells[Math.floor(r.cells.length / 2)] ?? r.cells[0];
      const y = puddleSurfaceY(map, mid.x, mid.y, 0.5, 0.5) + 0.006;
      const g = new THREE.PlaneGeometry(sx, sz);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, y, cz);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(geo, shimmerMat);
      mesh.name = 'water-shimmer';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.castWhenOn = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      group.add(mesh);
    }
  }

  return {
    group,
    update: (now, freeze) => {
      const t = freeze ? 0 : now * 0.001;
      if (puddleMat.normalMap) puddleMat.normalMap.offset.set(t * 0.02, t * 0.012);
      if (puddle && restY && !freeze) {
        const pos = puddle.geometry.getAttribute('position');
        const wave = t * Math.PI * 2 * WATER_RIPPLE_HZ;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          pos.setY(i, restY[i] + WATER_RIPPLE_AMP * Math.sin(x * 1.7 + wave) * Math.cos(z * 1.3 + wave * 0.7));
        }
        pos.needsUpdate = true;
      }
      if (shimmerMat) {
        shimmerMat.opacity = freeze ? 0.26 : 0.26 * (0.78 + 0.22 * Math.sin(t * 0.7));
        if (shimmerMat.map) shimmerMat.map.offset.set(t * 0.012, t * 0.007);
      }
    }
  };
}
