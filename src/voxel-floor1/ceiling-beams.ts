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
      const phase = b - a >= 2 ? 1 : 0;
      for (let x = a + phase; x <= b; x += 2) {
        emitSpanZ(out, map, 'corridor', x * CELL, spineZ, spineZ);
      }
    }
    return;
  }
  const spineX = mode(xs);
  const spine = cells.filter((c) => c.x === spineX).map((c) => c.y);
  for (const [a, b] of runsOf(spine)) {
    const phase = b - a >= 2 ? 1 : 0;
    for (let y = a + phase; y <= b; y += 2) {
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

/** 64² wood_beam.png: one texel is one centimetre. */
export const TEXEL_M = 0.01;
export const WOOD_TILE_M = 64 * TEXEL_M;
const STRAP_M = 0.05;
const STRAP_U0 = 0.17;
const STRAP_U1 = 0.3;

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
          sy: b.sy + 0.014,
          sz: b.sz + 0.014,
          kind: b.kind
        });
      } else {
        out.push({
          ...b,
          z: at,
          sx: b.sx + 0.014,
          sy: b.sy + 0.014,
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
  const uv = geo.getAttribute('uv');
  const thin = Math.min(box.sx, box.sz);
  for (let f = 0; f < 6; f++) {
    const [wu, wv] = FACE_SIZE[f](box);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u0 = uv.getX(i);
      const v0 = uv.getY(i);
      if (Math.abs(wu - thin) < 0.02) {
        uv.setXY(i, STRAP_U0 + u0 * (STRAP_U1 - STRAP_U0), v0);
      } else if (Math.abs(wv - thin) < 0.02) {
        uv.setXY(i, STRAP_U0 + v0 * (STRAP_U1 - STRAP_U0), u0);
      } else {
        uv.setXY(i, STRAP_U0 + u0 * (STRAP_U1 - STRAP_U0), v0 * (wv / WOOD_TILE_M));
      }
    }
  }
  uv.needsUpdate = true;
}

function sootyPixel(r: number, g: number, b: number): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = 0.28;
  const dim = 0.74;
  return [
    (luma + (r - luma) * sat) * dim,
    (luma + (g - luma) * sat) * dim,
    (luma + (b - luma) * sat) * dim
  ];
}

function inpaintWood(pix: ImageData): void {
  const w = pix.width;
  const h = pix.height;
  const colScore = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let bright = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const luma = 0.2126 * pix.data[i] + 0.7152 * pix.data[i + 1] + 0.0722 * pix.data[i + 2];
      if (luma > 140) bright += 1;
    }
    colScore[x] = bright;
  }
  const strap = Array.from(colScore, (s) => s >= 3);
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

/** Pull the crate-bright plank toward sooty oak. `woodOnly` fills strap columns with grain. */
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
  for (let i = 0; i < pix.data.length; i += 4) {
    const [r, g, b] = sootyPixel(pix.data[i] / 255, pix.data[i + 1] / 255, pix.data[i + 2] / 255);
    pix.data[i] = Math.round(r * 255);
    pix.data[i + 1] = Math.round(g * 255);
    pix.data[i + 2] = Math.round(b * 255);
  }
  ctx.putImageData(pix, 0, 0);
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
  const strapMap = sootyOakMap(map, false);
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
          color: new THREE.Color(0.84, 0.82, 0.78),
          roughness: 0.94,
          metalness: 0,
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
          color: new THREE.Color(0.55, 0.52, 0.5),
          roughness: 0.52,
          metalness: 0.38,
          envMapIntensity: 0
        })
      )
    );
  }
  return group;
}
