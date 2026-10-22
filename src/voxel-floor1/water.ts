import * as THREE from 'three';
import { CELL, SCONCE_RADIUS_TILES } from './constants';
import { FACE_INTO_ROOM, floodReach, sconceIsLit, sconceRoom, type SconceSpec } from './fixtures';
import { isWaterCell, tileAt, type FloorMap } from './layout';
import { paintedShellMaterial } from './painted';
import { loadPng } from '../voxel-lab/materials';

/** Dip stays in the inner 70–80% of a dry-facing cell. */
export const WATER_INSET_MIN = 0.11;
export const WATER_INSET_MAX = 0.15;
export const WATER_DIP_SHALLOW = 0.028;
export const WATER_DIP_DEEP = 0.06;
export const WATER_FLOOR_SEGS = 8;
export const WATER_RIPPLE_AMP = 0.004;
const WATER_RIPPLE_HZ = 0.16;
export const WATER_SURFACE_COLOR = 0x1a2c22;
export const WATER_DEEP_COLOR = 0x040706;
const WATER_SHALLOW_RGB = { r: 0x1a / 255, g: 0x2c / 255, b: 0x22 / 255 };
const WATER_DEEP_RGB = { r: 0x04 / 255, g: 0x07 / 255, b: 0x06 / 255 };
const PUDDLE_ALPHA_SHALLOW = 0.56;
const PUDDLE_ALPHA_DEEP = 0.94;

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

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Seeded warp so a dry-facing puddle edge is not a straight cell line. */
export function puddleEdgeInset(tx: number, tz: number, face: WaterFace, along: number): number {
  const n = hash01(tx, tz, face.charCodeAt(0));
  const mid = WATER_INSET_MIN + (WATER_INSET_MAX - WATER_INSET_MIN) * n;
  const wobble =
    0.048 * Math.sin(along * Math.PI * 2 * (1.7 + n) + n * 6.2) +
    0.028 * Math.sin(along * Math.PI * 5.3 + hash01(tx, tz, 9) * 8);
  return Math.min(0.2, Math.max(0.07, mid + wobble));
}

function crackSeep(tx: number, tz: number, u: number, v: number): number {
  const a = Math.sin((u * 7.3 + hash01(tx, tz, 3)) * Math.PI * 2);
  const b = Math.sin((v * 6.1 + hash01(tx, tz, 5)) * Math.PI * 2);
  const ridge = 1 - Math.min(1, Math.abs(a * 0.65 + b * 0.35) * 3.4);
  return Math.max(0, ridge) ** 2 * 0.55 * hash01(tx, tz, 7);
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
    const body = smoothstep(0.2, 1, t);
    const seep =
      crackSeep(tx, tz, u, v) * smoothstep(0.02, 0.09, s.dist) * (1 - smoothstep(0.28, 1, t));
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
  return smoothstep(0.14, 0.38, cover) * (PUDDLE_ALPHA_SHALLOW + (PUDDLE_ALPHA_DEEP - PUDDLE_ALPHA_SHALLOW) * deep);
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
    const y = puddleSurfaceY(map, room.x, room.y, 0.5 - nx * 0.2, 0.5 - nz * 0.2) + 0.004;
    out.push({
      kind: 'streak',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * (0.22 + 0.7),
      y,
      z: wallZ + nz * (0.22 + 0.7),
      rotY: planeRotY(nx, nz),
      sx: 1.35,
      sz: 0.48
    });
    out.push({
      kind: 'wall',
      tx: room.x,
      tz: room.y,
      x: wallX + nx * 0.2,
      y: y - 0.001,
      z: wallZ + nz * 0.2,
      rotY: planeRotY(-nz, nx),
      sx: CELL * 0.62,
      sz: 0.26
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

function makeStreakAtlas(): THREE.CanvasTexture {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const fall = (1 - t) * (1 - t);
    const gap = Math.sin(x * 0.38) * Math.sin(x * 0.11);
    if (gap < -0.35) continue;
    const mid = 32 + 9 * Math.sin(x * 0.17) + 5 * Math.sin(x * 0.41);
    const half = 5 + 3 * Math.abs(Math.sin(x * 0.23));
    const g = ctx.createLinearGradient(x, mid - half * 2, x, mid + half * 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgba(255, 196, 120, ${0.15 * fall})`);
    g.addColorStop(0.5, `rgba(255, 226, 168, ${0.85 * fall})`);
    g.addColorStop(0.55, `rgba(210, 150, 70, ${0.2 * fall})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, mid - half * 2, 1, half * 4);
    if (x % 9 === 0) {
      ctx.fillStyle = `rgba(255, 236, 190, ${0.55 * fall})`;
      ctx.fillRect(x, mid - 1 + Math.sin(x * 0.5) * 6, 3, 1);
    }
  }
  for (let x = 0; x < w; x++) {
    const t = x / w;
    if (Math.sin(x * 0.5 + 1.2) < 0.15) continue;
    const mid = 96 + 4 * Math.sin(x * 0.21);
    const a = (1 - t) * 0.4;
    ctx.fillStyle = `rgba(198, 150, 88, ${a})`;
    ctx.fillRect(x, mid - 6, 1, 12);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeSparkleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const dashes = [
    [8, 18, 7, 1],
    [22, 40, 5, 1],
    [40, 12, 6, 1],
    [14, 50, 4, 1],
    [48, 34, 8, 1],
    [30, 26, 3, 1],
    [54, 52, 5, 1]
  ];
  for (const [x, y, w, h] of dashes) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(255, 200, 120, 0)');
    g.addColorStop(0.5, 'rgba(255, 230, 170, 0.95)');
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
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

function cellGrid(tx: number, tz: number, map: FloorMap, kind: 'floor' | 'puddle'): THREE.BufferGeometry {
  const segs = WATER_FLOOR_SEGS;
  const geo = new THREE.PlaneGeometry(CELL, CELL, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 4);
  const colors = kind === 'puddle';
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
      const wet = smoothstep(0.08, 0.4, cover) * (1 - smoothstep(0.45, 0.95, cover));
      const bedHide = 0.58 * deep * smoothstep(0.18, 0.82, cover);
      const k = 1 - 0.4 * wet - bedHide;
      col[i * 4] = k * 0.92;
      col[i * 4 + 1] = k * 0.9;
      col[i * 4 + 2] = k * 0.86;
      col[i * 4 + 3] = 1;
    } else {
      pos.setXYZ(i, wx, dip + 0.0025, wz);
      const edgeClear = 1 - 0.28 * (1 - smoothstep(0.2, 0.7, cover));
      col[i * 4] = (WATER_SHALLOW_RGB.r + (WATER_DEEP_RGB.r - WATER_SHALLOW_RGB.r) * deep) * edgeClear;
      col[i * 4 + 1] = (WATER_SHALLOW_RGB.g + (WATER_DEEP_RGB.g - WATER_SHALLOW_RGB.g) * deep) * edgeClear;
      col[i * 4 + 2] = (WATER_SHALLOW_RGB.b + (WATER_DEEP_RGB.b - WATER_SHALLOW_RGB.b) * deep) * edgeClear;
      col[i * 4 + 3] = puddleAlpha(map, tx, tz, u, v);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  void colors;
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
  const waterPng = await loadPng('floor_water.png');
  const ripple = makeRippleNormal();
  const floorMat = paintedShellMaterial(waterPng.texture, undefined, 'floor_water.png');
  floorMat.vertexColors = true;
  floorMat.specularIntensity = 0;

  const floorGeos = cells.map((c) => cellGrid(c.x, c.y, map, 'floor'));
  const floorGeo = mergeGeometries(floorGeos);
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
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0,
    sheen: 0,
    specularIntensity: 0.28,
    envMapIntensity: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
    normalMap: ripple,
    normalScale: new THREE.Vector2(0.55, 0.55)
  });
  const puddleGeos = cells.map((c) => cellGrid(c.x, c.y, map, 'puddle'));
  let puddle: THREE.Mesh | null = null;
  let restY: Float32Array | null = null;
  const puddleGeo = mergeGeometries(puddleGeos);
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
          roughness: 0.62,
          metalness: 0,
          transparent: true,
          opacity: 0.38,
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
          color: 0xffe2a4,
          transparent: true,
          opacity: 0.72,
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

  let sparkleMat: THREE.MeshBasicMaterial | null = null;
  const glintCells = listWaterGlintCells(map, sconces);
  const glintKeys = new Set(glintCells.map((c) => `${c.x},${c.y}`));
  const sparkleRegions = listWaterRegions(map).filter((r) =>
    r.cells.some((c) => glintKeys.has(`${c.x},${c.y}`))
  );
  if (sparkleRegions.length) {
    sparkleMat = new THREE.MeshBasicMaterial({
      map: makeSparkleTexture(),
      color: 0xffe6b0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const geos = sparkleRegions.map((r) => {
      const sx = (r.maxX - r.minX + 1) * CELL * 0.88;
      const sz = (r.maxY - r.minY + 1) * CELL * 0.88;
      const cx = ((r.minX + r.maxX) / 2) * CELL;
      const cz = ((r.minY + r.maxY) / 2) * CELL;
      const mid = r.cells[Math.floor(r.cells.length / 2)] ?? r.cells[0];
      const y = puddleSurfaceY(map, mid.x, mid.y, 0.5, 0.5) + 0.005;
      const g = new THREE.PlaneGeometry(sx, sz);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, y, cz);
      const uv = g.getAttribute('uv');
      const tilesX = r.maxX - r.minX + 1;
      const tilesZ = r.maxY - r.minY + 1;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tilesX * 1.1, uv.getY(i) * tilesZ * 1.1);
      return g;
    });
    const geo = mergeGeometries(geos);
    if (geo) {
      const mesh = new THREE.Mesh(geo, sparkleMat);
      mesh.name = 'water-sparkles';
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
      if (puddleMat.normalMap) puddleMat.normalMap.offset.set(t * 0.014, t * 0.008);
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
      if (sparkleMat) {
        sparkleMat.opacity = freeze ? 0.42 : 0.42 * (0.8 + 0.2 * Math.sin(t * 1.15));
        if (sparkleMat.map) sparkleMat.map.offset.set(t * 0.02, t * 0.01);
      }
    }
  };
}
