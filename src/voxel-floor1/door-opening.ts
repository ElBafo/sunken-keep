import { tileCorner } from '../voxel-lab/faces';
import type { MeshArrays } from '../voxel-lab/mesher';
import { CELL, CORNICE_HEIGHT, DOOR_WALL_DEPTH, DOOR_WALL_HALF, WALL_TEXELS } from './constants';
import { faceUOffset } from './wall-look';

export type DoorOpeningStyle = 'lintel';
export type FaceNESW = 'N' | 'E' | 'S' | 'W';

/**
 * All four floor-1 door edges share one style: a tall rectangle under a
 * heavy lintel. No arches. Keyed by the host cell.
 */
export const FLOOR1_DOOR_STYLES: Record<string, DoorOpeningStyle> = {
  '4,2': 'lintel',
  '14,2': 'lintel',
  '6,8': 'lintel',
  '19,5': 'lintel'
};

export function doorOpeningStyle(x: number, y: number): DoorOpeningStyle {
  return FLOOR1_DOOR_STYLES[`${x},${y}`] ?? 'lintel';
}

export const OPEN_WIDTH = 1.12;
export const OPEN_U0 = (CELL - OPEN_WIDTH) / 2;
export const OPEN_U1 = OPEN_U0 + OPEN_WIDTH;
export const JOINT = 0.024;
/** 3 cm proud of the wall plate — jambs. */
export const FRONT_PROUD = 0.03;
/** Lintel steps out so the single block reads from a cell back. */
export const LINTEL_PROUD = 0.1;
export const BRICK_COURSE = 0.18;
/** Heavy single lintel block, 28 cm. */
export const LINTEL_H = 0.28;
/** How far the lintel bears into the wall past each jamb. */
export const LINTEL_BEAR = 0.18;
/**
 * Tall rectangular opening — floor to lintel. Same size on all four doors.
 * 1.54 m is as tall as the 28 cm lintel allows under the 1.82 m cornice.
 */
export const JAMB_TOP = 1.54;
export const JAMB_TOP_LINTEL = JAMB_TOP;
/** Field-brick V on banded walls — below the carved knot course. */
export const FIELD_STONE_V0 = 0.14;
/** One room's half of the 30 cm doorway wall. */
export const ROOM_DEPTH = DOOR_WALL_HALF;
export const FRONT = ROOM_DEPTH + FRONT_PROUD;
export const LINTEL_FRONT = ROOM_DEPTH + LINTEL_PROUD;
/** Slight overlap past the shared edge so the two room plates seal. */
export const BACK = -0.004;
/** Door leaf sits in the combined wall thickness, centred on the edge. */
export const LEAF_PAD = 0.012;
export const LEAF_THICK = 0.04;
/** Quarter of the two-sided wall so the frame still reads from each room. */
export const LEAF_REVEAL = DOOR_WALL_DEPTH * 0.25;
export const LEAF_FRONT = LEAF_THICK / 2;
export const LEAF_BACK = -LEAF_THICK / 2;
export const IRON_PROUD = 0.004;
/**
 * Painted wood in `door_panel_aged.png` — the rectangular plank body only.
 * Crops the arched cap and the stone / dark recess around it.
 */
export const DOOR_PANEL_U0 = 0.32;
export const DOOR_PANEL_U1 = 0.66;
export const DOOR_PANEL_V0 = 0.1;
export const DOOR_PANEL_V1 = 0.6;
/** Aged leaf pixels stay at or under this luma — duller than lit stone. */
export const LEAF_MAX_LUMA = 0.42;
/** Painted leaf size after the pad / lintel inset. */
export const LEAF_WIDTH_M = OPEN_WIDTH - 2 * LEAF_PAD;
export const LEAF_HEIGHT_M = JAMB_TOP - LEAF_PAD;
/** 3D rusty padlock hung from the painted middle band. */
export const PADLOCK_BODY_W = 0.06;
export const PADLOCK_BODY_H = 0.07;
export const PADLOCK_BODY_D = 0.025;
export const PADLOCK_SHACKLE_T = 0.01;
export const PADLOCK_MAX_HEIGHT_M = 0.16;
/** World-Y of the painted middle iron band (crop V → leaf height). */
export const PADLOCK_BAND_Y = 1.222;
export type QuadRole = 'lintel' | 'jamb-soffit' | 'chip' | 'leaf' | 'iron';
export type QuadKind = 'front' | 'soffit' | 'back';

export type OpeningQuad = {
  role: QuadRole;
  kind: QuadKind;
  /** Local (across, up, depth) corners, CCW. */
  corners: Array<[number, number, number]>;
};

export type OpeningHole = { u0: number; u1: number; v0: number; v1: number };

export function jambTop(_style: DoorOpeningStyle = 'lintel'): number {
  return JAMB_TOP;
}

/** Rectangular walkable void — the lintel sits above this. */
export function openingPunchRect(_style: DoorOpeningStyle = 'lintel'): OpeningHole {
  return {
    u0: OPEN_U0,
    u1: OPEN_U1,
    v0: 0,
    v1: JAMB_TOP
  };
}

/**
 * Hole cut in the wall plate: walkable opening plus the lintel band so
 * wall courses do not run through the head. The lintel fills that band.
 */
export function openingPlateRect(_style: DoorOpeningStyle = 'lintel'): OpeningHole {
  return {
    u0: OPEN_U0,
    u1: OPEN_U1,
    v0: 0,
    v1: lintelTop()
  };
}

/** True inside the walkable opening. Both styles are a rectangle under the lintel. */
export function inOpeningVoid(style: DoorOpeningStyle, u: number, v: number): boolean {
  if (v < 0) return false;
  return u >= OPEN_U0 && u < OPEN_U1 && v < jambTop(style);
}

export function punchOpening(
  volume: Uint8Array,
  dims: [number, number, number],
  style: DoorOpeningStyle,
  cell = CELL
): Uint8Array {
  return punchOpeningRect(volume, dims, openingPlateRect(style), cell);
}

export function punchOpeningRect(
  volume: Uint8Array,
  dims: [number, number, number],
  hole: OpeningHole,
  cell = CELL
): Uint8Array {
  const [W, H, D] = dims;
  const out = new Uint8Array(volume);
  const slice = W * H;
  const u0 = Math.max(0, Math.floor((hole.u0 / cell) * W));
  const u1 = Math.min(W, Math.ceil((hole.u1 / cell) * W));
  const v0 = Math.max(0, Math.floor((hole.v0 / cell) * H));
  const v1 = Math.min(H, Math.ceil((hole.v1 / cell) * H));
  for (let v = v0; v < v1; v++) {
    for (let u = u0; u < u1; u++) {
      for (let d = 0; d < D; d++) out[u + v * W + d * slice] = 0;
    }
  }
  return out;
}

export function lintelTop(): number {
  return JAMB_TOP + LINTEL_H;
}

export function corniceBottom(): number {
  return CELL - CORNICE_HEIGHT;
}

export function wallAboveOpening(_style: DoorOpeningStyle = 'lintel'): number {
  return corniceBottom() - lintelTop();
}

function frontRect(
  a0: number,
  a1: number,
  u0: number,
  u1: number,
  d = FRONT
): OpeningQuad['corners'] {
  return [
    [a0, u0, d],
    [a1, u0, d],
    [a1, u1, d],
    [a0, u1, d]
  ];
}

function soffitRect(
  a0: number,
  a1: number,
  u0: number,
  u1: number,
  d = FRONT
): OpeningQuad['corners'] {
  return [
    [a0, u0, d],
    [a0, u0, BACK],
    [a1, u1, BACK],
    [a1, u1, d]
  ];
}

/** Reverse winding so a room-facing quad also exists from the opening / other room. */
export function flipQuadCorners(corners: OpeningQuad['corners']): OpeningQuad['corners'] {
  return [corners[0], corners[3], corners[2], corners[1]];
}

function pointInTri(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-12) return false;
  const a = (v2x * v1y - v1x * v2y) / den;
  const b = (v0x * v2y - v2x * v0y) / den;
  return a >= -1e-5 && b >= -1e-5 && a + b <= 1 + 1e-5;
}

/** True if (across, up) sits inside the quad's wall-plane projection. */
export function pointInQuadUV(u: number, v: number, corners: OpeningQuad['corners']): boolean {
  return (
    pointInTri(u, v, corners[0][0], corners[0][1], corners[1][0], corners[1][1], corners[2][0], corners[2][1]) ||
    pointInTri(u, v, corners[0][0], corners[0][1], corners[2][0], corners[2][1], corners[3][0], corners[3][1])
  );
}

/**
 * Wall cell minus the walkable opening must be covered from `side`.
 * The plate hole above the walkable void is the lintel band.
 */
export function openingWallCovered(
  style: DoorOpeningStyle,
  u: number,
  v: number,
  side: 'front' | 'back'
): boolean {
  if (inOpeningVoid(style, u, v)) return true;
  const rect = openingPlateRect(style);
  if (u < rect.u0 || u >= rect.u1 || v < rect.v0 || v >= rect.v1) return true;
  return listOpeningQuads(style).some((q) => q.kind === side && pointInQuadUV(u, v, q.corners));
}

export function openingWallIsWatertight(
  style: DoorOpeningStyle,
  side: 'front' | 'back',
  step = CELL / 64
): boolean {
  for (let v = step * 0.5; v < CELL; v += step) {
    for (let u = step * 0.5; u < CELL; u += step) {
      if (!openingWallCovered(style, u, v, side)) return false;
    }
  }
  return true;
}

/** World-space unit normal for an opening quad (same winding as the mesh). */
export function openingQuadWorldNormal(
  q: OpeningQuad,
  face: FaceNESW,
  tx: number,
  tz: number
): [number, number, number] {
  const world = q.corners.map((c) => mapLocal(face, tx, tz, c[0], c[1], c[2]));
  const ax = world[1][0] - world[0][0];
  const ay = world[1][1] - world[0][1];
  const az = world[1][2] - world[0][2];
  const bx = world[3][0] - world[0][0];
  const by = world[3][1] - world[0][1];
  const bz = world[3][2] - world[0][2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Unit vector from the wall plate into the viewing room. */
export function roomInward(face: FaceNESW): [number, number, number] {
  switch (face) {
    case 'N':
      return [0, 0, 1];
    case 'S':
      return [0, 0, -1];
    case 'W':
      return [1, 0, 0];
    case 'E':
      return [-1, 0, 0];
  }
}

export function listLintelQuads(): OpeningQuad[] {
  const u0 = OPEN_U0;
  const u1 = OPEN_U1;
  const jt = JAMB_TOP_LINTEL;
  const lh = LINTEL_H;
  const j = JOINT / 2;
  const chip = 0.07;
  const out: OpeningQuad[] = [];
  const lintelFront = frontRect(u0 - LINTEL_BEAR, u1 + LINTEL_BEAR, jt, jt + lh, LINTEL_FRONT);
  out.push({
    role: 'lintel',
    kind: 'front',
    corners: lintelFront
  });
  out.push({
    role: 'lintel',
    kind: 'back',
    corners: flipQuadCorners(lintelFront)
  });
  out.push({
    role: 'lintel',
    kind: 'soffit',
    corners: soffitRect(u0 + chip, u1 - chip, jt, jt, LINTEL_FRONT)
  });
  out.push({
    role: 'chip',
    kind: 'soffit',
    corners: soffitRect(u0, u0 + chip, jt + 0.05, jt + 0.05, LINTEL_FRONT)
  });
  out.push({
    role: 'chip',
    kind: 'soffit',
    corners: soffitRect(u1 - chip, u1, jt + 0.05, jt + 0.05, LINTEL_FRONT)
  });
  out.push({
    role: 'jamb-soffit',
    kind: 'soffit',
    corners: soffitRect(u0, u0, 0, jt - j)
  });
  out.push({
    role: 'jamb-soffit',
    kind: 'soffit',
    corners: soffitRect(u1, u1, 0, jt - j)
  });
  return out;
}

export function listOpeningQuads(_style: DoorOpeningStyle = 'lintel'): OpeningQuad[] {
  return listLintelQuads();
}

/** Head of every floor-1 door is the single lintel block. */
export function listHeadRoles(_style: DoorOpeningStyle = 'lintel'): QuadRole[] {
  return ['lintel'];
}

export function listOpeningSlabs(style: DoorOpeningStyle): Array<{ role: QuadRole; kind: QuadKind }> {
  return listOpeningQuads(style).map((q) => ({ role: q.role, kind: q.kind }));
}

function leafFrontRect(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  return [
    [a0, u0, LEAF_FRONT],
    [a1, u0, LEAF_FRONT],
    [a1, u1, LEAF_FRONT],
    [a0, u1, LEAF_FRONT]
  ];
}

function leafBackRect(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  return [
    [a0, u0, LEAF_BACK],
    [a0, u1, LEAF_BACK],
    [a1, u1, LEAF_BACK],
    [a1, u0, LEAF_BACK]
  ];
}

function leafEdge(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  return [
    [a0, u0, LEAF_FRONT],
    [a0, u0, LEAF_BACK],
    [a1, u1, LEAF_BACK],
    [a1, u1, LEAF_FRONT]
  ];
}

/** Every floor-1 door tile has an Open-button leaf. There are no plain archways. */
export function doorHasLeaf(x: number, y: number): boolean {
  return `${x},${y}` in FLOOR1_DOOR_STYLES;
}

/** Front / back / edge quads for a rectangular leaf under the lintel. */
export function listLeafQuads(style: DoorOpeningStyle): OpeningQuad[] {
  const pad = LEAF_PAD;
  const u0 = OPEN_U0 + pad;
  const u1 = OPEN_U1 - pad;
  const top = jambTop(style) - pad;
  const out: OpeningQuad[] = [];
  out.push({ role: 'leaf', kind: 'front', corners: leafFrontRect(u0, u1, 0, top) });
  out.push({ role: 'leaf', kind: 'back', corners: leafBackRect(u0, u1, 0, top) });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0, u0, 0, top) });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u1, u1, 0, top) });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0, u1, top, top) });
  return out;
}

export function listLeafHeadRoles(_style: DoorOpeningStyle): QuadRole[] {
  return ['leaf'];
}

function ironRect(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  const d = LEAF_FRONT + IRON_PROUD;
  return [
    [a0, u0, d],
    [a1, u0, d],
    [a1, u1, d],
    [a0, u1, d]
  ];
}

/** Dark rusty bands, studs, and a ring handle. */
export function listIronQuads(style: DoorOpeningStyle): OpeningQuad[] {
  const pad = LEAF_PAD;
  const a0 = OPEN_U0 + pad;
  const a1 = OPEN_U1 - pad;
  const top = jambTop(style) - pad;
  const out: OpeningQuad[] = [];
  const push = (x0: number, x1: number, y0: number, y1: number): void => {
    out.push({ role: 'iron', kind: 'front', corners: ironRect(x0, x1, y0, y1) });
  };
  const strap = 0.045;
  push(a0, a0 + strap, 0.08, top - 0.05);
  push(a1 - strap, a1, 0.08, top - 0.05);
  const bh = 0.04;
  const bands = [0.13, 0.44, Math.min(0.9, top - 0.14)];
  const stud = 0.024;
  for (const y of bands) {
    push(a0, a1, y, y + bh);
    for (let i = 0; i < 5; i++) {
      const cx = a0 + ((a1 - a0) * (i + 0.5)) / 5;
      const cy = y + bh * 0.5;
      push(cx - stud * 0.5, cx + stud * 0.5, cy - stud * 0.5, cy + stud * 0.5);
    }
  }
  const cx = (a0 + a1) * 0.5;
  const cy = 0.7;
  const s = 1 / Math.SQRT2;
  const ring: Array<[number, number]> = [
    [1, 0],
    [s, s],
    [0, 1],
    [-s, s],
    [-1, 0],
    [-s, -s],
    [0, -1],
    [s, -s]
  ];
  const rOut = 0.07;
  const rIn = 0.044;
  const d = LEAF_FRONT + IRON_PROUD;
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) & 7;
    const a = ring[i];
    const b = ring[j];
    out.push({
      role: 'iron',
      kind: 'front',
      corners: [
        [cx + a[0] * rIn, cy + a[1] * rIn, d],
        [cx + a[0] * rOut, cy + a[1] * rOut, d],
        [cx + b[0] * rOut, cy + b[1] * rOut, d],
        [cx + b[0] * rIn, cy + b[1] * rIn, d]
      ]
    });
  }
  push(cx - 0.012, cx + 0.012, cy + rOut - 0.008, cy + rOut + 0.048);
  return out;
}

function ironBox(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number
): OpeningQuad[] {
  const q = (corners: OpeningQuad['corners']): OpeningQuad => ({
    role: 'iron',
    kind: 'front',
    corners
  });
  return [
    q([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ]),
    q([
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0]
    ]),
    q([
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0]
    ]),
    q([
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1]
    ]),
    q([
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1]
    ]),
    q([
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0]
    ])
  ];
}

function ironTube(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  thick: number
): OpeningQuad[] {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  let px = uy;
  let py = -ux;
  let pz = 0;
  if (Math.hypot(px, py, pz) < 1e-6) {
    px = 0;
    py = uz;
    pz = -uy;
  }
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  const qx = uy * pz - uz * py;
  const qy = uz * px - ux * pz;
  const qz = ux * py - uy * px;
  const h = thick / 2;
  const ring = [
    [-px - qx, -py - qy, -pz - qz],
    [px - qx, py - qy, pz - qz],
    [px + qx, py + qy, pz + qz],
    [-px + qx, -py + qy, -pz + qz]
  ];
  const a = ring.map((r) => [ax + r[0] * h, ay + r[1] * h, az + r[2] * h] as [number, number, number]);
  const b = ring.map((r) => [bx + r[0] * h, by + r[1] * h, bz + r[2] * h] as [number, number, number]);
  const q = (corners: OpeningQuad['corners']): OpeningQuad => ({
    role: 'iron',
    kind: 'front',
    corners
  });
  return [
    q([a[0], a[1], b[1], b[0]]),
    q([a[1], a[2], b[2], b[1]]),
    q([a[2], a[3], b[3], b[2]]),
    q([a[3], a[0], b[0], b[3]])
  ];
}

/**
 * Hasp on the painted middle band near the centre seam, plus a dark rusty
 * padlock (6×7×2.5 cm body, ~1 cm round shackle, keyhole).
 */
export function listPadlockQuads(
  _style: DoorOpeningStyle = 'lintel',
  part: 'all' | 'body' | 'shackle' = 'all'
): OpeningQuad[] {
  const a0 = OPEN_U0 + LEAF_PAD;
  const a1 = OPEN_U1 - LEAF_PAD;
  const cx = (a0 + a1) * 0.5 + 0.035;
  const bandY = PADLOCK_BAND_Y;
  const bodyW = PADLOCK_BODY_W;
  const bodyH = PADLOCK_BODY_H;
  const bodyD = PADLOCK_BODY_D;
  const t = PADLOCK_SHACKLE_T;
  const z0 = LEAF_FRONT + IRON_PROUD;
  const z1 = z0 + bodyD;
  const zc = (z0 + z1) * 0.5;
  const bodyTop = bandY - 0.012;
  const bodyBot = bodyTop - bodyH;
  const body: OpeningQuad[] = [];
  const shackle: OpeningQuad[] = [];
  body.push(...ironBox(cx - bodyW * 0.5, cx + bodyW * 0.5, bodyBot, bodyTop, z0, z1));
  body.push(
    ...ironBox(
      cx - bodyW * 0.42,
      cx + bodyW * 0.42,
      bodyBot - 0.008,
      bodyBot + 0.002,
      z0 + 0.003,
      z1 - 0.003
    )
  );
  const holeW = 0.008;
  const holeH = 0.014;
  const holeY = bodyBot + bodyH * 0.42;
  body.push(
    ...ironBox(
      cx - holeW * 0.5,
      cx + holeW * 0.5,
      holeY,
      holeY + holeH,
      z1 - 0.008,
      z1 + 0.001
    )
  );
  const haspW = 0.02;
  const haspOut = 0.018;
  const haspT = 0.008;
  body.push(...ironTube(cx - haspW * 0.5, bandY, z0, cx - haspW * 0.5, bandY, z0 + haspOut, haspT));
  body.push(...ironTube(cx + haspW * 0.5, bandY, z0, cx + haspW * 0.5, bandY, z0 + haspOut, haspT));
  body.push(
    ...ironTube(cx - haspW * 0.5, bandY, z0 + haspOut, cx + haspW * 0.5, bandY, z0 + haspOut, haspT)
  );
  const r = 0.02;
  const postTop = bandY;
  const left = cx - r;
  const right = cx + r;
  shackle.push(...ironTube(left, bodyTop, zc, left, postTop, zc, t));
  shackle.push(...ironTube(right, bodyTop, zc, right, postTop, zc, t));
  const s = 1 / Math.SQRT2;
  const arc: Array<[number, number]> = [
    [-1, 0],
    [-s, s],
    [0, 1],
    [s, s],
    [1, 0]
  ];
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i];
    const b = arc[i + 1];
    shackle.push(
      ...ironTube(cx + a[0] * r, postTop + a[1] * r, zc, cx + b[0] * r, postTop + b[1] * r, zc, t)
    );
  }
  if (part === 'body') return body;
  if (part === 'shackle') return shackle;
  return [...body, ...shackle];
}

export function padlockHeightM(style: DoorOpeningStyle = 'lintel'): number {
  let minY = 1e9;
  let maxY = -1e9;
  for (const q of listPadlockQuads(style)) {
    for (const c of q.corners) {
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    }
  }
  return maxY - minY;
}

function mapLocal(face: FaceNESW, tx: number, tz: number, a: number, u: number, d: number): [number, number, number] {
  const { ox, oz } = tileCorner(tx, tz, CELL, 'center');
  switch (face) {
    case 'N':
      return [ox + a, u, oz + d];
    case 'S':
      return [ox + CELL - a, u, oz + CELL - d];
    case 'W':
      return [ox + d, u, oz + CELL - a];
    case 'E':
      return [ox + CELL - d, u, oz + a];
  }
}

/** Map a rectangular leaf onto the painted door, cropping only the arched cap. */
function woodUv(a: number, u: number, leafTop: number): [number, number] {
  const a0 = OPEN_U0 + LEAF_PAD;
  const a1 = OPEN_U1 - LEAF_PAD;
  const s = a1 > a0 ? Math.min(1, Math.max(0, (a - a0) / (a1 - a0))) : 0;
  const t = leafTop > 1e-6 ? Math.min(1, Math.max(0, u / leafTop)) : 0;
  return [
    DOOR_PANEL_U0 + s * (DOOR_PANEL_U1 - DOOR_PANEL_U0),
    DOOR_PANEL_V0 + t * (DOOR_PANEL_V1 - DOOR_PANEL_V0)
  ];
}

function pixelLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rustIron(luma: number): [number, number, number] {
  const tone = Math.min(luma, 0.58);
  return [tone * 0.36 + 0.07, tone * 0.22 + 0.045, tone * 0.14 + 0.032];
}

function clampLeafLuma(r: number, g: number, b: number): [number, number, number] {
  const luma = pixelLuma(r, g, b);
  if (luma <= LEAF_MAX_LUMA) return [r, g, b];
  const k = LEAF_MAX_LUMA / luma;
  return [r * k, g * k, b * k];
}

/** Image-space rectangle of the cropped plank body (PNG y=0 is top). */
export function doorPanelLeafRect(
  width: number,
  height: number
): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: Math.round(DOOR_PANEL_U0 * width),
    x1: Math.round(DOOR_PANEL_U1 * width),
    y0: Math.round((1 - DOOR_PANEL_V1) * height),
    y1: Math.round((1 - DOOR_PANEL_V0) * height)
  };
}

/** Real board floor — above this is arch-surround / gap, not plank. */
const PLANK_LUMA = 0.15;

/**
 * Copy real plank pixels up the same column into the dark arch corners so
 * the rectangular leaf reads as boards to the lintel. Leaves the top 2 px
 * black (a thin gap under the lintel). Does not change UVs.
 */
function fillLeafArchCorners(out: Uint8ClampedArray, width: number, height: number): void {
  if (width < 64 || height < 64) return;
  const leaf = doorPanelLeafRect(width, height);
  const span = Math.max(1, leaf.x1 - leaf.x0);
  let firstBand = leaf.y0 + 12;
  for (let y = leaf.y0 + 6; y < leaf.y0 + 20 && y < leaf.y1; y++) {
    let dark = 0;
    for (let x = leaf.x0; x < leaf.x1; x++) {
      const i = (y * width + x) * 4;
      if (out[i] + out[i + 1] + out[i + 2] < 90) dark += 1;
    }
    if (dark >= span * 0.7) {
      firstBand = y;
      break;
    }
  }
  const lumaAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return pixelLuma(out[i] / 255, out[i + 1] / 255, out[i + 2] / 255);
  };
  let plankRow = -1;
  const search0 = Math.min(leaf.y1, firstBand + 8);
  const search1 = Math.min(leaf.y1, firstBand + 28);
  for (let y = search0; y < search1; y++) {
    let wood = 0;
    for (let x = leaf.x0; x < leaf.x1; x++) {
      if (lumaAt(x, y) >= PLANK_LUMA) wood += 1;
    }
    if (wood >= span * 0.5) {
      plankRow = y;
      break;
    }
  }
  for (let x = leaf.x0; x < leaf.x1; x++) {
    let donor = -1;
    if (plankRow >= 0 && lumaAt(x, plankRow) >= PLANK_LUMA) donor = plankRow;
    if (donor < 0) {
      const from = plankRow >= 0 ? plankRow : firstBand + 8;
      for (let y = from; y < leaf.y1; y++) {
        if (lumaAt(x, y) >= PLANK_LUMA) {
          donor = y;
          break;
        }
      }
    }
    if (donor < 0) continue;
    const di = (donor * width + x) * 4;
    for (let y = leaf.y0 + 2; y < firstBand; y++) {
      if (lumaAt(x, y) >= PLANK_LUMA) continue;
      const i = (y * width + x) * 4;
      out[i] = out[di];
      out[i + 1] = out[di + 1];
      out[i + 2] = out[di + 2];
      out[i + 3] = out[di + 3];
    }
  }
}

/**
 * Stud / luma clamp only. Artie's `door_panel_aged.png` is already aged —
 * do not recolour wood or iron (that would double the wear). Fills the
 * arched-cap corners with same-column plank pixels.
 */
export function ageDoorPanelPixels(
  src: ArrayLike<number>,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = src[i] / 255;
      const g = src[i + 1] / 255;
      const b = src[i + 2] / 255;
      const a = src[i + 3];
      const luma = pixelLuma(r, g, b);
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const sat = maxc > 1e-6 ? (maxc - minc) / maxc : 0;
      let nr = r;
      let ng = g;
      let nb = b;
      if (sat < 0.38 && luma >= 0.55) {
        [nr, ng, nb] = rustIron(luma);
      }
      [nr, ng, nb] = clampLeafLuma(nr, ng, nb);
      out[i] = Math.round(Math.min(1, nr) * 255);
      out[i + 1] = Math.round(Math.min(1, ng) * 255);
      out[i + 2] = Math.round(Math.min(1, nb) * 255);
      out[i + 3] = a;
    }
  }
  fillLeafArchCorners(out, width, height);
  return out;
}

/** Dark grey-brown iron (#3a342e) with subtle orange-brown rust; no red cast. */
export function padlockIronPixels(kind: 'body' | 'shackle', size = 8): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const base = kind === 'shackle' ? [50, 48, 46] : [58, 52, 46];
  const rust = [74, 58, 42];
  const pit = [40, 36, 32];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = (x * 17 + y * 31 + (kind === 'body' ? 0 : 5)) & 7;
      const c = kind === 'body' && (n === 0 || n === 4) ? rust : n === 2 ? pit : base;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return data;
}


const FIELD_STONE_ROLES = new Set<QuadRole>(['lintel', 'chip']);

function pushQuad(
  mesh: MeshArrays,
  corners: Array<[number, number, number]>,
  kind: QuadKind,
  face: FaceNESW,
  tx: number,
  tz: number,
  wood = false,
  leafTop = 0,
  role?: QuadRole
): void {
  const world = corners.map((c) => mapLocal(face, tx, tz, c[0], c[1], c[2]));
  const ax = world[1][0] - world[0][0];
  const ay = world[1][1] - world[0][1];
  const az = world[1][2] - world[0][2];
  const bx = world[3][0] - world[0][0];
  const by = world[3][1] - world[0][1];
  const bz = world[3][2] - world[0][2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  const uOff = faceUOffset(face, tx, tz);
  const uv: Array<[number, number]> = [];
  if (wood && (kind === 'front' || kind === 'back')) {
    for (const c of corners) uv.push(woodUv(c[0], c[1], leafTop));
  } else if (kind === 'front' && role && FIELD_STONE_ROLES.has(role)) {
    const y0 = Math.min(...corners.map((c) => c[1]));
    for (const c of corners) uv.push([c[0] / CELL + uOff, FIELD_STONE_V0 + (c[1] - y0) / CELL]);
  } else if (kind === 'front') {
    for (const c of corners) uv.push([c[0] / CELL + uOff, c[1] / CELL]);
  } else {
    const along = (c: [number, number, number]): number =>
      Math.hypot(c[0] - corners[0][0], c[1] - corners[0][1]) / CELL + uOff;
    for (const c of corners) uv.push([along(c), c[2] / CELL]);
  }
  const base = mesh.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    mesh.positions.push(world[i][0], world[i][1], world[i][2]);
    mesh.normals.push(nx, ny, nz);
    mesh.uvs.push(uv[i][0], uv[i][1]);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emptyMesh(): MeshArrays {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function openingSlabMeshes(
  style: DoorOpeningStyle,
  face: FaceNESW,
  tx: number,
  tz: number
): { stone: MeshArrays; lintel: MeshArrays } {
  const stone = emptyMesh();
  const lintel = emptyMesh();
  for (const q of listOpeningQuads(style)) {
    const dest = q.role === 'lintel' || q.role === 'chip' ? lintel : stone;
    pushQuad(dest, q.corners, q.kind, face, tx, tz, false, 0, q.role);
  }
  return { stone, lintel };
}

export function leafMeshes(
  style: DoorOpeningStyle,
  face: FaceNESW,
  tx: number,
  tz: number
): { wood: MeshArrays; iron: MeshArrays; shackle: MeshArrays } {
  const wood = emptyMesh();
  const iron = emptyMesh();
  const shackle = emptyMesh();
  const top = jambTop(style) - LEAF_PAD;
  for (const q of listLeafQuads(style)) {
    pushQuad(wood, q.corners, q.kind, face, tx, tz, true, top);
  }
  for (const q of listPadlockQuads(style, 'body')) {
    pushQuad(iron, q.corners, q.kind, face, tx, tz);
  }
  for (const q of listPadlockQuads(style, 'shackle')) {
    pushQuad(shackle, q.corners, q.kind, face, tx, tz);
  }
  return { wood, iron, shackle };
}

export function openingUsesWallTexels(): number {
  return WALL_TEXELS;
}
