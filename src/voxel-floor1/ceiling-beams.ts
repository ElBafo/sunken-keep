import * as THREE from 'three';
import floor1DecorJson from '../../levels/floor1_decor.json';
import { CELL, CORNICE_DEPTH } from './constants';
import { floor1Sunbeams } from './fixtures';
import { isShellTile, isTrueWall, tileAt, type FloorMap, type FloorTile } from './layout';

/**
 * Shallow ceiling rib: 0.14 m across, 0.09 m down, flush just under the slab.
 * Only pantry, guard hall, and muster hall. Ends rest on the cornice.
 * Placement is grid-only — it does not read ceiling tile files.
 */
export const BEAM_WIDTH = 0.14;
export const BEAM_DEPTH = 0.09;
export const BEAM_CEIL_GAP = 0.04;
export const BEAM_Y = CELL - BEAM_CEIL_GAP - BEAM_DEPTH / 2;
/** Cell centre or cell-boundary / slab-joint line. */
export const BEAM_GRID = CELL / 2;
const MIN_SPAN = 0.45;
const MIN_PAIR_SEP = CELL * 0.9;
const JOIN_EPS = 0.002;
const WALL_TOUCH = 0.02;
const OVERLAP_EPS = 0.0005;

const CORRIDOR_ZONES = new Set<string>();
const ROOM_ZONES = new Set(['muster_hall', 'guard_hall', 'pantry']);
const SKIP_ZONES = new Set(['water_hall']);

type DecorZone = { id: string; viewerSquares: number[][] };

const ZONES = (floor1DecorJson as { zones: DecorZone[] }).zones;

export type CeilingBeamBox = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  kind: 'corridor' | 'room' | 'joist';
};

function inRects(x: number, y: number, rects: number[][]): boolean {
  return rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

function zoneAt(x: number, y: number): DecorZone | undefined {
  return ZONES.find((z) => inRects(x, y, z.viewerSquares));
}

function isWaterTile(map: FloorMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  return !!(tile?.shallowWater || tile?.deepWater);
}

function isCisternCell(x: number, y: number): boolean {
  return zoneAt(x, y)?.id === 'water_hall' || SKIP_ZONES.has(zoneAt(x, y)?.id ?? '');
}

function isSunbeamCell(x: number, y: number): boolean {
  return floor1Sunbeams.some((b) => b.x === x && b.y === y);
}

function isOpeningTile(tile: FloorTile | undefined): boolean {
  return !!(tile && (tile.door || tile.secret));
}

/** No timber over water, the cistern, a crack sunbeam, or a door/secret opening. */
export function skipCeilingBeamCell(map: FloorMap, x: number, y: number): boolean {
  if (isCisternCell(x, y) || isSunbeamCell(x, y) || isWaterTile(map, x, y)) return true;
  const tile = tileAt(map, x, y);
  if (!isShellTile(tile) || isOpeningTile(tile)) return true;
  return false;
}

export function isBeamGridLine(world: number): boolean {
  const q = world / BEAM_GRID;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

function snapGrid(world: number): number {
  return Math.round(world / BEAM_GRID) * BEAM_GRID;
}

function isJointLine(world: number): boolean {
  return ((Math.round(world / BEAM_GRID) % 2) + 2) % 2 === 1;
}

function eligible(map: FloorMap, x: number, y: number): boolean {
  return !skipCeilingBeamCell(map, x, y);
}

function zoneCells(map: FloorMap, zone: DecorZone): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const [x0, y0, x1, y1] of zone.viewerSquares) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (eligible(map, x, y)) out.push({ x, y });
      }
    }
  }
  return out;
}

/** 1-cell doorway / secret-wall nook sticking out of a room into another zone. */
function isDoorwayNook(map: FloorMap, zone: DecorZone, x: number, y: number): boolean {
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  let n = 0;
  let opensOut = false;
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (inRects(nx, ny, zone.viewerSquares) && eligible(map, nx, ny)) n += 1;
    const tile = tileAt(map, nx, ny);
    if (isOpeningTile(tile)) opensOut = true;
    const other = zoneAt(nx, ny);
    if (other && other.id !== zone.id && eligible(map, nx, ny)) opensOut = true;
  }
  return n < 2 && opensOut;
}

function roomCells(map: FloorMap, zone: DecorZone): Array<{ x: number; y: number }> {
  return zoneCells(map, zone).filter((c) => !isDoorwayNook(map, zone, c.x, c.y));
}

function runsOf(values: number[]): Array<[number, number]> {
  if (!values.length) return [];
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  let a = sorted[0];
  let b = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === b + 1) {
      b = sorted[i];
      continue;
    }
    runs.push([a, b]);
    a = sorted[i];
    b = sorted[i];
  }
  runs.push([a, b]);
  return runs;
}

export function cellOverlapsBeam(cx: number, cy: number, box: Pick<CeilingBeamBox, 'x' | 'z' | 'sx' | 'sz'>): boolean {
  const half = CELL / 2;
  const x0 = cx * CELL - half;
  const x1 = cx * CELL + half;
  const z0 = cy * CELL - half;
  const z1 = cy * CELL + half;
  const bx0 = box.x - box.sx / 2;
  const bx1 = box.x + box.sx / 2;
  const bz0 = box.z - box.sz / 2;
  const bz1 = box.z + box.sz / 2;
  return bx0 < x1 && bx1 > x0 && bz0 < z1 && bz1 > z0;
}

function blockedByKeepout(map: FloorMap, box: Pick<CeilingBeamBox, 'x' | 'z' | 'sx' | 'sz'>): boolean {
  const half = CELL / 2;
  const x0 = Math.floor((box.x - box.sx / 2 + half) / CELL);
  const x1 = Math.floor((box.x + box.sx / 2 - 1e-6 + half) / CELL);
  const z0 = Math.floor((box.z - box.sz / 2 + half) / CELL);
  const z1 = Math.floor((box.z + box.sz / 2 - 1e-6 + half) / CELL);
  for (let y = z0; y <= z1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (skipCeilingBeamCell(map, x, y) && cellOverlapsBeam(x, y, box)) return true;
    }
  }
  return false;
}

function boxesOverlap(a: Pick<CeilingBeamBox, 'x' | 'z' | 'sx' | 'sz'>, b: Pick<CeilingBeamBox, 'x' | 'z' | 'sx' | 'sz'>): boolean {
  return (
    a.x - a.sx / 2 < b.x + b.sx / 2 - OVERLAP_EPS &&
    a.x + a.sx / 2 > b.x - b.sx / 2 + OVERLAP_EPS &&
    a.z - a.sz / 2 < b.z + b.sz / 2 - OVERLAP_EPS &&
    a.z + a.sz / 2 > b.z - b.sz / 2 + OVERLAP_EPS
  );
}

function overlapsAny(box: Pick<CeilingBeamBox, 'x' | 'z' | 'sx' | 'sz'>, list: CeilingBeamBox[]): boolean {
  return list.some((other) => boxesOverlap(box, other));
}

/** Cell rows/cols the beam's thin axis overlaps (centre line = 1, slab joint = 2). */
function lineCells(world: number): number[] {
  const half = BEAM_WIDTH / 2;
  const a = Math.floor((world - half + CELL / 2) / CELL);
  const b = Math.floor((world + half - 1e-7 + CELL / 2) / CELL);
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function runCellOk(map: FloorMap, alongX: boolean, run: number, cross: number): boolean {
  for (const other of lineCells(cross)) {
    const x = alongX ? run : other;
    const y = alongX ? other : run;
    if (!eligible(map, x, y)) return false;
  }
  return true;
}

function runHasWalls(map: FloorMap, alongX: boolean, a: number, b: number, cross: number): boolean {
  for (const other of lineCells(cross)) {
    if (alongX) {
      if (!isTrueWall(tileAt(map, a - 1, other)) || !isTrueWall(tileAt(map, b + 1, other))) return false;
    } else if (!isTrueWall(tileAt(map, other, a - 1)) || !isTrueWall(tileAt(map, other, b + 1))) {
      return false;
    }
  }
  return true;
}

function makeRunBox(
  kind: CeilingBeamBox['kind'],
  alongX: boolean,
  cross: number,
  a: number,
  b: number
): CeilingBeamBox {
  const u0 = a * CELL - CELL / 2 + CORNICE_DEPTH;
  const u1 = b * CELL + CELL / 2 - CORNICE_DEPTH;
  if (alongX) {
    return { x: (u0 + u1) / 2, y: BEAM_Y, z: cross, sx: u1 - u0, sy: BEAM_DEPTH, sz: BEAM_WIDTH, kind };
  }
  return { x: cross, y: BEAM_Y, z: (u0 + u1) / 2, sx: BEAM_WIDTH, sy: BEAM_DEPTH, sz: u1 - u0, kind };
}

/** Longest wall-to-wall span on a grid line. Dropped when either end is an opening. */
function tryWallSpan(
  map: FloorMap,
  kind: CeilingBeamBox['kind'],
  alongX: boolean,
  cross: number,
  run0: number,
  run1: number
): CeilingBeamBox | null {
  if (!isBeamGridLine(cross)) return null;
  const cells: number[] = [];
  for (let r = run0; r <= run1; r++) {
    if (runCellOk(map, alongX, r, cross)) cells.push(r);
  }
  let best: CeilingBeamBox | null = null;
  for (const [a, b] of runsOf(cells)) {
    if (!runHasWalls(map, alongX, a, b, cross)) continue;
    const box = makeRunBox(kind, alongX, cross, a, b);
    if (Math.max(box.sx, box.sz) < MIN_SPAN) continue;
    if (blockedByKeepout(map, box)) continue;
    if (!best || Math.max(box.sx, box.sz) > Math.max(best.sx, best.sz)) best = box;
  }
  return best;
}

type LineHit = { cross: number; box: CeilingBeamBox };

function nearestLine(valid: LineHit[], target: number, exclude: LineHit | null, minSep: number): LineHit | null {
  let best: LineHit | null = null;
  let bestD = Infinity;
  for (const v of valid) {
    if (exclude && Math.abs(v.cross - exclude.cross) < minSep) continue;
    const d = Math.abs(v.cross - target);
    const tieJoint = best && d === bestD && isJointLine(v.cross) && !isJointLine(best.cross);
    if (d < bestD || tieJoint) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function pickPair(valid: LineHit[], crossMin: number, crossMax: number): LineHit[] {
  if (valid.length <= 1) return valid;
  const z0 = (crossMin - 0.5) * CELL;
  const z1 = (crossMax + 0.5) * CELL;
  const targetA = snapGrid(z0 + (z1 - z0) * 0.28);
  const targetB = snapGrid(z0 + (z1 - z0) * 0.72);
  const a = nearestLine(valid, targetA, null, 0);
  const b = a ? nearestLine(valid, targetB, a, MIN_PAIR_SEP) : null;
  if (a && b) return a.cross <= b.cross ? [a, b] : [b, a];
  return a ? [a] : [valid[0]];
}

function pickJoistLines(runMin: number, runMax: number): number[] {
  const joints: number[] = [];
  for (let i = runMin; i < runMax; i++) joints.push((i + 0.5) * CELL);
  if (joints.length <= 3) return joints;
  const out: number[] = [];
  for (let i = 0; i < joints.length; i += 2) out.push(joints[i]);
  return out;
}

function tryJoist(map: FloorMap, alongX: boolean, cross: number, pair0: number, pair1: number): CeilingBeamBox | null {
  if (!isBeamGridLine(cross)) return null;
  const lo = Math.min(pair0, pair1) + BEAM_WIDTH / 2 + JOIN_EPS;
  const hi = Math.max(pair0, pair1) - BEAM_WIDTH / 2 - JOIN_EPS;
  if (hi - lo < MIN_SPAN) return null;
  const box: CeilingBeamBox = alongX
    ? { x: (lo + hi) / 2, y: BEAM_Y, z: cross, sx: hi - lo, sy: BEAM_DEPTH, sz: BEAM_WIDTH, kind: 'joist' }
    : { x: cross, y: BEAM_Y, z: (lo + hi) / 2, sx: BEAM_WIDTH, sy: BEAM_DEPTH, sz: hi - lo, kind: 'joist' };
  if (blockedByKeepout(map, box)) return null;
  return box;
}

function accept(out: CeilingBeamBox[], box: CeilingBeamBox | null): void {
  if (!box || overlapsAny(box, out)) return;
  out.push(box);
}

function firstCellOpensOut(map: FloorMap, zone: DecorZone, longX: boolean, first: number, crosses: number[]): boolean {
  for (const c of crosses) {
    const x = longX ? first - 1 : c;
    const y = longX ? c : first - 1;
    if (isOpeningTile(tileAt(map, x, y))) return true;
    const other = zoneAt(x, y);
    if (other && other.id !== zone.id && eligible(map, x, y)) return true;
  }
  return false;
}

function corridorPhase(map: FloorMap, zone: DecorZone, longX: boolean, a: number, b: number, crosses: number[]): number {
  const skipFirst = b - a >= 2 || firstCellOpensOut(map, zone, longX, a, crosses);
  const phase = skipFirst ? 1 : 0;
  return a + phase <= b ? phase : 0;
}

function placeCorridor(map: FloorMap, zone: DecorZone, out: CeilingBeamBox[]): void {
  const cells = zoneCells(map, zone);
  if (!cells.length) return;
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.y);
  const longX = new Set(xs).size >= new Set(zs).size;
  if (longX) {
    const xsU = [...new Set(xs)].sort((a, b) => a - b);
    for (const [a, b] of runsOf(xsU)) {
      const crosses = cells.filter((c) => c.x >= a && c.x <= b).map((c) => c.y);
      const phase = corridorPhase(map, zone, true, a, b, crosses);
      for (let x = a + phase; x <= b; x += 2) {
        const ys = cells.filter((c) => c.x === x).map((c) => c.y);
        for (const [y0, y1] of runsOf(ys)) {
          accept(out, tryWallSpan(map, 'corridor', false, x * CELL, y0, y1));
        }
      }
    }
    return;
  }
  const zsU = [...new Set(zs)].sort((a, b) => a - b);
  for (const [a, b] of runsOf(zsU)) {
    const crosses = cells.filter((c) => c.y >= a && c.y <= b).map((c) => c.x);
    const phase = corridorPhase(map, zone, false, a, b, crosses);
    for (let y = a + phase; y <= b; y += 2) {
      const xsAt = cells.filter((c) => c.y === y).map((c) => c.x);
      for (const [x0, x1] of runsOf(xsAt)) {
        accept(out, tryWallSpan(map, 'corridor', true, y * CELL, x0, x1));
      }
    }
  }
}

function tryOrientation(
  map: FloorMap,
  alongX: boolean,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): CeilingBeamBox[] {
  const crossMin = alongX ? minZ : minX;
  const crossMax = alongX ? maxZ : maxX;
  const runMin = alongX ? minX : minZ;
  const runMax = alongX ? maxX : maxZ;
  const candidates: number[] = [];
  for (let c = crossMin; c <= crossMax; c++) candidates.push(c * CELL);
  for (let c = crossMin; c < crossMax; c++) candidates.push((c + 0.5) * CELL);
  const valid: LineHit[] = [];
  for (const cross of candidates) {
    const box = tryWallSpan(map, 'room', alongX, cross, runMin, runMax);
    if (box) valid.push({ cross, box });
  }
  const picked = pickPair(valid, crossMin, crossMax);
  const boxes = picked.map((p) => p.box);
  if (picked.length >= 2) {
    const a = picked[0].cross;
    const b = picked[1].cross;
    for (const cross of pickJoistLines(runMin, runMax)) {
      const joist = tryJoist(map, !alongX, cross, a, b);
      if (joist && !overlapsAny(joist, boxes)) boxes.push(joist);
    }
  }
  return boxes;
}

function placeRoom(map: FloorMap, zone: DecorZone, out: CeilingBeamBox[]): void {
  const cells = roomCells(map, zone);
  if (cells.length < 2) return;
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minZ = Math.min(...cells.map((c) => c.y));
  const maxZ = Math.max(...cells.map((c) => c.y));
  const preferAlongX = maxX - minX >= maxZ - minZ;
  const primary = tryOrientation(map, preferAlongX, minX, maxX, minZ, maxZ);
  const alt = tryOrientation(map, !preferAlongX, minX, maxX, minZ, maxZ);
  const score = (boxes: CeilingBeamBox[]): number => {
    const rooms = boxes.filter((b) => b.kind === 'room').length;
    const joists = boxes.filter((b) => b.kind === 'joist').length;
    const span = boxes.reduce((n, b) => n + Math.max(b.sx, b.sz), 0);
    const coverage = boxes.reduce((n, b) => n + b.sx * b.sz, 0);
    return (rooms >= 2 ? 50 : 0) + rooms * 10 + joists * 4 + span + coverage;
  };
  const chosen = score(alt) > score(primary) ? alt : primary;
  for (const box of chosen) accept(out, box);
}

export type CeilingBeamIssue = {
  code: 'grid' | 'wall' | 'opening' | 'overlap' | 'keepout' | 'joist';
  message: string;
};

function alongAxis(b: Pick<CeilingBeamBox, 'sx' | 'sz'>): 'x' | 'z' {
  return b.sx >= b.sz ? 'x' : 'z';
}

function endWorld(b: CeilingBeamBox, which: 'min' | 'max'): number {
  return alongAxis(b) === 'x'
    ? which === 'min'
      ? b.x - b.sx / 2
      : b.x + b.sx / 2
    : which === 'min'
      ? b.z - b.sz / 2
      : b.z + b.sz / 2;
}

function endTouchesWall(map: FloorMap, box: CeilingBeamBox, which: 'min' | 'max'): boolean {
  const axis = alongAxis(box);
  const end = endWorld(box, which);
  const inner = which === 'min' ? end + 0.01 : end - 0.01;
  const cell = Math.round(inner / CELL);
  const others = lineCells(axis === 'x' ? box.z : box.x);
  for (const other of others) {
    const cx = axis === 'x' ? cell : other;
    const cy = axis === 'x' ? other : cell;
    const nx = axis === 'x' ? (which === 'min' ? cx - 1 : cx + 1) : cx;
    const ny = axis === 'x' ? cy : which === 'min' ? cy - 1 : cy + 1;
    if (!isTrueWall(tileAt(map, nx, ny))) return false;
    const face = (axis === 'x' ? cx : cy) * CELL + (which === 'min' ? -CELL / 2 : CELL / 2);
    const rest = face + (which === 'min' ? CORNICE_DEPTH : -CORNICE_DEPTH);
    if (Math.abs(end - rest) > WALL_TOUCH) return false;
  }
  return others.length > 0;
}

function endTouchesBeam(box: CeilingBeamBox, which: 'min' | 'max', supports: CeilingBeamBox[]): boolean {
  const axis = alongAxis(box);
  const end = endWorld(box, which);
  const mid = axis === 'x' ? box.z : box.x;
  for (const other of supports) {
    if (other === box) continue;
    if (axis === 'x') {
      const left = other.x - other.sx / 2;
      const right = other.x + other.sx / 2;
      if (Math.abs(end - left) > WALL_TOUCH && Math.abs(end - right) > WALL_TOUCH) continue;
      if (mid >= other.z - other.sz / 2 - WALL_TOUCH && mid <= other.z + other.sz / 2 + WALL_TOUCH) return true;
    } else {
      const south = other.z - other.sz / 2;
      const north = other.z + other.sz / 2;
      if (Math.abs(end - south) > WALL_TOUCH && Math.abs(end - north) > WALL_TOUCH) continue;
      if (mid >= other.x - other.sx / 2 - WALL_TOUCH && mid <= other.x + other.sx / 2 + WALL_TOUCH) return true;
    }
  }
  return false;
}

function listOpenings(map: FloorMap): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isOpeningTile(map.tiles[y][x])) out.push({ x, y });
    }
  }
  return out;
}

/** Dev/test: every run sits on the grid, ends on a wall or the pair, and misses openings. */
export function auditCeilingBeamBoxes(map: FloorMap, beams: CeilingBeamBox[]): CeilingBeamIssue[] {
  const issues: CeilingBeamIssue[] = [];
  const openings = listOpenings(map);
  const supports = beams.filter((b) => b.kind !== 'joist');
  for (const [i, b] of beams.entries()) {
    const label = `${b.kind}#${i} (${(b.x / CELL).toFixed(2)},${(b.z / CELL).toFixed(2)})`;
    const axis = alongAxis(b);
    const cross = axis === 'x' ? b.z : b.x;
    if (!isBeamGridLine(cross)) issues.push({ code: 'grid', message: `${label} is off the cell grid` });
    if (b.kind === 'joist') {
      if (!endTouchesBeam(b, 'min', supports) || !endTouchesBeam(b, 'max', supports)) {
        issues.push({ code: 'joist', message: `${label} does not meet the pair at both ends` });
      }
    } else if (!endTouchesWall(map, b, 'min') || !endTouchesWall(map, b, 'max')) {
      issues.push({ code: 'wall', message: `${label} end does not sit on a wall face` });
    }
    for (const o of openings) {
      if (cellOverlapsBeam(o.x, o.y, b)) {
        issues.push({ code: 'opening', message: `${label} intersects opening ${o.x},${o.y}` });
      }
    }
    if (blockedByKeepout(map, b)) issues.push({ code: 'keepout', message: `${label} overlaps water, cistern, or sunbeam` });
    for (let j = i + 1; j < beams.length; j++) {
      if (boxesOverlap(b, beams[j])) {
        issues.push({ code: 'overlap', message: `${label} overlaps ${beams[j].kind}#${j}` });
      }
    }
  }
  return issues;
}

export function auditCeilingBeams(map: FloorMap, beams?: CeilingBeamBox[]): CeilingBeamIssue[] {
  return auditCeilingBeamBoxes(map, beams ?? listCeilingBeams(map));
}

function maybeDevAudit(map: FloorMap, beams: CeilingBeamBox[]): void {
  const dev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
  if (!dev) return;
  const issues = auditCeilingBeamBoxes(map, beams);
  if (issues.length) console.warn('[voxel-floor1] ceiling beam audit', issues);
}

export function listCeilingBeams(map: FloorMap): CeilingBeamBox[] {
  const out: CeilingBeamBox[] = [];
  for (const zone of ZONES) {
    if (SKIP_ZONES.has(zone.id)) continue;
    if (CORRIDOR_ZONES.has(zone.id)) placeCorridor(map, zone, out);
    else if (ROOM_ZONES.has(zone.id)) placeRoom(map, zone, out);
  }
  maybeDevAudit(map, out);
  return out;
}

/** 64² wood_beam.png: one texel is one centimetre. */
export const TEXEL_M = 0.01;
export const WOOD_TILE_M = 64 * TEXEL_M;
/** Iron strap width, scaled with the slimmer 0.14 m rib. */
export const STRAP_M = 0.028;
const STRAP_PROUD = 0.008;
/** Centre iron column in wood_beam.png (texels 29–34: mid-grey band + rivet). */
const STRAP_U0 = 0.45;
const STRAP_U1 = 0.53;
/** Near-black iron. The generated map carries at most a faint rivet glint. */
export const STRAP_TINT = new THREE.Color(0.16, 0.14, 0.12);

function hash01(x: number, z: number, salt: number): number {
  let n = Math.imul(Math.round(x * 100) ^ (Math.round(z * 100) << 8) ^ salt, 2246822519);
  n ^= n >>> 15;
  return ((n >>> 0) % 10000) / 10000;
}

function alongX(b: Pick<CeilingBeamBox, 'sx' | 'sz'>): boolean {
  return b.sx >= b.sz;
}

/** 2–3 iron bands per beam, jittered off a regular split. */
export function listBeamStraps(boxes: CeilingBeamBox[]): CeilingBeamBox[] {
  const out: CeilingBeamBox[] = [];
  for (const b of boxes) {
    const xRun = alongX(b);
    const len = xRun ? b.sx : b.sz;
    const n = len < 2.4 ? 2 : 3;
    const bases = n === 2 ? [0.27, 0.71] : [0.15, 0.49, 0.83];
    const start = xRun ? b.x - b.sx / 2 : b.z - b.sz / 2;
    for (let i = 0; i < n; i++) {
      const t = Math.min(0.92, Math.max(0.08, bases[i] + (hash01(b.x, b.z, 3 + i) - 0.5) * 0.12));
      const at = start + t * len;
      if (xRun) {
        out.push({
          ...b,
          x: at,
          sx: STRAP_M,
          sy: b.sy + STRAP_PROUD,
          sz: b.sz + STRAP_PROUD,
          kind: b.kind
        });
      } else {
        out.push({
          ...b,
          z: at,
          sx: b.sx + STRAP_PROUD,
          sy: b.sy + STRAP_PROUD,
          sz: STRAP_M,
          kind: b.kind
        });
      }
    }
  }
  return out;
}

/** BoxGeometry faces: +X −X +Y −Y +Z −Z. U/V follow the face width/height. */
const FACE_SIZE: Array<(s: CeilingBeamBox) => [number, number]> = [
  (s) => [s.sz, s.sy],
  (s) => [s.sz, s.sy],
  (s) => [s.sx, s.sz],
  (s) => [s.sx, s.sz],
  (s) => [s.sx, s.sy],
  (s) => [s.sx, s.sy]
];

function setWoodUvs(geo: THREE.BufferGeometry, box: CeilingBeamBox, uOffset: number): void {
  const uv = geo.getAttribute('uv');
  for (let f = 0; f < 6; f++) {
    const [wu, wv] = FACE_SIZE[f](box);
    const uScale = wu / WOOD_TILE_M;
    const vScale = wv / WOOD_TILE_M;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * uScale + uOffset, uv.getY(i) * vScale);
    }
  }
  uv.needsUpdate = true;
}

function setStrapUvs(geo: THREE.BufferGeometry, box: CeilingBeamBox): void {
  // Generated iron map — do not crop wood_beam.png (those texels are pale grey).
  const uv = geo.getAttribute('uv');
  for (let f = 0; f < 6; f++) {
    const [wu, wv] = FACE_SIZE[f](box);
    const uScale = wu / WOOD_TILE_M;
    const vScale = wv / WOOD_TILE_M;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
    }
  }
  uv.needsUpdate = true;
}

/**
 * wood_beam.png straps are mid-grey (~0.32–0.45 luma) with a ~0.68 rivet.
 * Remap the body to near-black iron; only the rivet lifts as a faint highlight.
 */
export function ironStrapPixel(r: number, g: number, b: number): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const t = Math.min(1, Math.max(0, (luma - 0.5) / 0.22));
  const lift = t * t;
  return [0.055 + lift * 0.3, 0.052 + lift * 0.24, 0.048 + lift * 0.2];
}

function inpaintWood(pix: ImageData): void {
  const w = pix.width;
  const h = pix.height;
  const strap = new Array<boolean>(w).fill(false);
  for (let x = 0; x < w; x++) {
    let bright = 0;
    let satSum = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const r = pix.data[i];
      const g = pix.data[i + 1];
      const b = pix.data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b);
      const sat = mx <= 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
      if (luma > 140) bright += 1;
      satSum += sat;
    }
    const u = (x + 0.5) / w;
    // Rivet cols are bright; the rest of the iron band is mid-grey / low-sat.
    strap[x] = bright >= 3 || satSum / h < 0.28 || (u >= STRAP_U0 - 0.03 && u <= STRAP_U1 + 0.03);
  }
  const woodCols: number[] = [];
  for (let x = 0; x < w; x++) if (!strap[x]) woodCols.push(x);
  if (woodCols.length < 8) return;
  for (let x = 0; x < w; x++) {
    if (!strap[x]) continue;
    let src = woodCols[0];
    let best = w;
    for (const c of woodCols) {
      const d = Math.abs(c - x);
      if (d < best) {
        best = d;
        src = c;
      }
    }
    for (let y = 0; y < h; y++) {
      const a = (y * w + x) * 4;
      const b = (y * w + src) * 4;
      pix.data[a] = pix.data[b];
      pix.data[a + 1] = pix.data[b + 1];
      pix.data[a + 2] = pix.data[b + 2];
      pix.data[a + 3] = pix.data[b + 3];
    }
  }
}

/** Fill strap columns with grain. Artie's old-wood albedo is already the play colour. */
export function sootyOakMap(src: THREE.Texture, woodOnly = false): THREE.Texture {
  const img = src.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  const w = img?.naturalWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.height || 0;
  if (!img || !w || !h || typeof document === 'undefined') return src;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const pix = ctx.getImageData(0, 0, w, h);
  if (woodOnly) inpaintWood(pix);
  ctx.putImageData(pix, 0, 0);
  return nearestMap(canvas);
}

function nearestMap(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.Texture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Near-black iron that does not sample wood_beam.png (those strap texels are pale). */
export function makeIronStrapMap(): THREE.DataTexture {
  const w = 32;
  const h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rivet = (y & 7) === 3 && x >= 13 && x <= 18;
      data[i] = rivet ? 58 : 16;
      data[i + 1] = rivet ? 52 : 15;
      data[i + 2] = rivet ? 46 : 14;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Near-black iron from the pale strap columns; rivet stays a faint glint. */
export function ironStrapMap(src: THREE.Texture): THREE.Texture {
  const img = src.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  const w = img?.naturalWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.height || 0;
  if (!img || !w || !h || typeof document === 'undefined') return makeIronStrapMap();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return makeIronStrapMap();
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const pix = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < pix.data.length; i += 4) {
    const [r, g, b] = ironStrapPixel(pix.data[i] / 255, pix.data[i + 1] / 255, pix.data[i + 2] / 255);
    pix.data[i] = Math.round(r * 255);
    pix.data[i + 1] = Math.round(g * 255);
    pix.data[i + 2] = Math.round(b * 255);
  }
  ctx.putImageData(pix, 0, 0);
  return nearestMap(canvas);
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()?.count ?? g.getAttribute('position').count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  let vBase = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
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
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function batchBoxes(
  boxes: CeilingBeamBox[],
  setUvs: (geo: THREE.BufferGeometry, box: CeilingBeamBox) => void
): THREE.BufferGeometry | null {
  const geos = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    setUvs(g, b);
    g.translate(b.x, b.y, b.z);
    return g;
  });
  const geo = mergeGeometries(geos);
  if (!geo) return null;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function beamMesh(name: string, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** Two batched MeshPhysical draws: wood grain at 1 cm/texel, then 2–3 iron rings. */
export function meshCeilingBeams(map: THREE.Texture, boxes: CeilingBeamBox[]): THREE.Group | null {
  if (!boxes.length) return null;
  const woodGeo = batchBoxes(boxes, (g, b) => {
    const start = alongX(b) ? b.x - b.sx / 2 : b.z - b.sz / 2;
    setWoodUvs(g, b, start / WOOD_TILE_M + hash01(b.x, b.z, 1) * 0.35);
  });
  const strapGeo = batchBoxes(listBeamStraps(boxes), (g, b) => setStrapUvs(g, b));
  if (!woodGeo && !strapGeo) return null;

  const woodMap = sootyOakMap(map, true);
  const strapMap = makeIronStrapMap();
  const group = new THREE.Group();
  group.name = 'ceiling-beams';
  group.userData.castWhenOn = false;
  if (woodGeo) {
    group.add(
      beamMesh(
        'ceiling-beams-wood',
        woodGeo,
        new THREE.MeshPhysicalMaterial({
          map: woodMap,
          roughness: 1,
          metalness: 0,
          clearcoat: 0,
          sheen: 0,
          envMapIntensity: 0
        })
      )
    );
  }
  if (strapGeo) {
    group.add(
      beamMesh(
        'ceiling-beams-straps',
        strapGeo,
        new THREE.MeshPhysicalMaterial({
          map: strapMap,
          color: STRAP_TINT,
          roughness: 0.82,
          metalness: 0.08,
          envMapIntensity: 0,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        })
      )
    );
  }
  return group;
}
