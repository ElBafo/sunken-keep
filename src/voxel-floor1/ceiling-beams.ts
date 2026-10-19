import * as THREE from 'three';
import floor1DecorJson from '../../levels/floor1_decor.json';
import { CELL } from './constants';
import { floor1Sunbeams } from './fixtures';
import { isShellTile, tileAt, type FloorMap } from './layout';

/** Squared timber: ~0.25 m across, 0.3 m tall, just under the ceiling. */
export const BEAM_WIDTH = 0.25;
export const BEAM_DEPTH = 0.3;
export const BEAM_CEIL_GAP = 0.04;
export const BEAM_Y = CELL - BEAM_CEIL_GAP - BEAM_DEPTH / 2;
const WALL_PAD = 0.08;
const MIN_SPAN = 0.45;
const UV_TILE = 0.5;

const CORRIDOR_ZONES = new Set(['entry_gate', 'hook_corridor', 'slime_trail', 'lair']);
const ROOM_ZONES = new Set([
  'muster_hall',
  'antechamber',
  'guard_hall',
  'pantry',
  'pell',
  'cellar',
  'stair_room'
]);
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

/** No timber over water, the cistern hall, or a crack sunbeam square. */
export function skipCeilingBeamCell(map: FloorMap, x: number, y: number): boolean {
  if (isCisternCell(x, y) || isSunbeamCell(x, y) || isWaterTile(map, x, y)) return true;
  const tile = tileAt(map, x, y);
  return !isShellTile(tile);
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

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function cellOverlapsBeam(cx: number, cy: number, box: Omit<CeilingBeamBox, 'kind' | 'y'>): boolean {
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

function blockedByKeepout(map: FloorMap, box: Omit<CeilingBeamBox, 'kind' | 'y'>): boolean {
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

function pushBox(
  out: CeilingBeamBox[],
  map: FloorMap,
  kind: CeilingBeamBox['kind'],
  x: number,
  z: number,
  sx: number,
  sz: number
): void {
  if (sx < MIN_SPAN && sz < MIN_SPAN) return;
  const box = { x, y: BEAM_Y, z, sx, sy: BEAM_DEPTH, sz, kind };
  if (blockedByKeepout(map, box)) return;
  out.push(box);
}

/** Split an X-axis run around keep-out cells, then emit one box per segment. */
function emitSpanX(
  out: CeilingBeamBox[],
  map: FloorMap,
  kind: CeilingBeamBox['kind'],
  z: number,
  xStart: number,
  xEnd: number
): void {
  const xs: number[] = [];
  for (let x = xStart; x <= xEnd; x++) {
    const trial = {
      x: x * CELL,
      z,
      sx: CELL - WALL_PAD * 2,
      sy: BEAM_DEPTH,
      sz: BEAM_WIDTH
    };
    if (!blockedByKeepout(map, trial) && eligible(map, x, Math.round(z / CELL))) xs.push(x);
  }
  for (const [a, b] of runsOf(xs)) {
    const x0 = a * CELL - CELL / 2 + WALL_PAD;
    const x1 = b * CELL + CELL / 2 - WALL_PAD;
    pushBox(out, map, kind, (x0 + x1) / 2, z, x1 - x0, BEAM_WIDTH);
  }
}

function emitSpanZ(
  out: CeilingBeamBox[],
  map: FloorMap,
  kind: CeilingBeamBox['kind'],
  x: number,
  zStart: number,
  zEnd: number
): void {
  const zs: number[] = [];
  for (let z = zStart; z <= zEnd; z++) {
    const trial = {
      x,
      z: z * CELL,
      sx: BEAM_WIDTH,
      sy: BEAM_DEPTH,
      sz: CELL - WALL_PAD * 2
    };
    if (!blockedByKeepout(map, trial) && eligible(map, Math.round(x / CELL), z)) zs.push(z);
  }
  for (const [a, b] of runsOf(zs)) {
    const z0 = a * CELL - CELL / 2 + WALL_PAD;
    const z1 = b * CELL + CELL / 2 - WALL_PAD;
    pushBox(out, map, kind, x, (z0 + z1) / 2, BEAM_WIDTH, z1 - z0);
  }
}

function placeCorridor(map: FloorMap, zone: DecorZone, out: CeilingBeamBox[]): void {
  const cells = zoneCells(map, zone);
  if (!cells.length) return;
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.y);
  const alongX = new Set(xs).size >= new Set(zs).size;
  if (alongX) {
    const spineZ = mode(zs);
    const spine = cells.filter((c) => c.y === spineZ).map((c) => c.x);
    for (const [a, b] of runsOf(spine)) {
      for (let x = a; x <= b; x += 2) {
        emitSpanZ(out, map, 'corridor', x * CELL, spineZ, spineZ);
      }
    }
    return;
  }
  const spineX = mode(xs);
  const spine = cells.filter((c) => c.x === spineX).map((c) => c.y);
  for (const [a, b] of runsOf(spine)) {
    for (let y = a; y <= b; y += 2) {
      emitSpanX(out, map, 'corridor', y * CELL, spineX, spineX);
    }
  }
}

function placeRoom(map: FloorMap, zone: DecorZone, out: CeilingBeamBox[]): void {
  const cells = zoneCells(map, zone);
  if (cells.length < 2) return;
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minZ = Math.min(...cells.map((c) => c.y));
  const maxZ = Math.max(...cells.map((c) => c.y));
  const wide = maxX - minX + 1;
  const deep = maxZ - minZ + 1;
  const alongX = wide >= deep;
  const joists = Math.min(3, Math.max(2, Math.floor((Math.max(wide, deep) + 1) / 2)));

  if (alongX) {
    const z0 = minZ - 0.5;
    const z1 = maxZ + 0.5;
    const zA = (z0 + (z1 - z0) * 0.28) * CELL;
    const zB = (z0 + (z1 - z0) * 0.72) * CELL;
    emitSpanX(out, map, 'room', zA, minX, maxX);
    emitSpanX(out, map, 'room', zB, minX, maxX);
    for (let i = 1; i <= joists; i++) {
      const t = i / (joists + 1);
      const x = (minX - 0.5 + (maxX + 1 - minX) * t) * CELL;
      emitSpanZ(out, map, 'joist', x, minZ, maxZ);
    }
    return;
  }

  const x0 = minX - 0.5;
  const x1 = maxX + 0.5;
  const xA = (x0 + (x1 - x0) * 0.28) * CELL;
  const xB = (x0 + (x1 - x0) * 0.72) * CELL;
  emitSpanZ(out, map, 'room', xA, minZ, maxZ);
  emitSpanZ(out, map, 'room', xB, minZ, maxZ);
  for (let i = 1; i <= joists; i++) {
    const t = i / (joists + 1);
    const z = (minZ - 0.5 + (maxZ + 1 - minZ) * t) * CELL;
    emitSpanX(out, map, 'joist', z, minX, maxX);
  }
}

export function listCeilingBeams(map: FloorMap): CeilingBeamBox[] {
  const out: CeilingBeamBox[] = [];
  for (const zone of ZONES) {
    if (SKIP_ZONES.has(zone.id)) continue;
    if (CORRIDOR_ZONES.has(zone.id)) placeCorridor(map, zone, out);
    else if (ROOM_ZONES.has(zone.id)) placeRoom(map, zone, out);
  }
  return out;
}

function scaleBoxUvs(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number): void {
  const uv = geo.getAttribute('uv');
  const uScale = Math.max(sx, sz) / UV_TILE;
  const vScale = Math.max(sy, Math.min(sx, sz)) / UV_TILE;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  }
  uv.needsUpdate = true;
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
    pos.set(p.array as ArrayLike<number> as Float32Array, vo * 3);
    if (n) nrm.set(n.array as ArrayLike<number> as Float32Array, vo * 3);
    if (u) uv.set(u.array as ArrayLike<number> as Float32Array, vo * 2);
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

export function meshCeilingBeams(map: THREE.Texture, boxes: CeilingBeamBox[]): THREE.Mesh | null {
  const geos = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    scaleBoxUvs(g, b.sx, b.sy, b.sz);
    g.translate(b.x, b.y, b.z);
    return g;
  });
  const geo = mergeGeometries(geos);
  if (!geo) return null;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ceiling-beams';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = false;
  return mesh;
}
