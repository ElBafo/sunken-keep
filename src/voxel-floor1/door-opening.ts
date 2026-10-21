import { tileCorner } from '../voxel-lab/faces';
import type { MeshArrays } from '../voxel-lab/mesher';
import { CELL, CORNICE_HEIGHT, DOOR_WALL_DEPTH, DOOR_WALL_HALF, WALL_TEXELS } from './constants';
import { faceUOffset } from './wall-look';

export type DoorOpeningStyle = 'faceted' | 'lintel';
export type FaceNESW = 'N' | 'E' | 'S' | 'W';

/**
 * Main doors sit between halls. Side doors are cellar / lair / pantry-type.
 * Floor 1 has four door *edges* — two of each style — keyed by the host cell.
 */
export const FLOOR1_DOOR_STYLES: Record<string, DoorOpeningStyle> = {
  '4,2': 'faceted',
  '14,2': 'faceted',
  '6,8': 'lintel',
  '19,5': 'lintel'
};

export function doorOpeningStyle(x: number, y: number): DoorOpeningStyle {
  return FLOOR1_DOOR_STYLES[`${x},${y}`] ?? 'lintel';
}

export const OPEN_WIDTH = 1.16;
export const OPEN_U0 = (CELL - OPEN_WIDTH) / 2;
export const OPEN_U1 = OPEN_U0 + OPEN_WIDTH;
/** Visible thickness of each head slab on the wall face. */
export const SLAB_THICK = 0.26;
export const JOINT = 0.02;
/** 2.5 cm proud of the wall plate — cut-in, not a pillar. */
export const FRONT_PROUD = 0.025;
export const BRICK_COURSE = 0.18;
/** 45° run = rise on the relieving arch above the main-door lintel. */
export const CHAMFER = 0.2;
export const KEYSTONE_H = 0.12;
export const LINTEL_H = 0.24;
export const JAMB_TOP_H = 0.12;
/** Rectangular opening height — main doors (relieving arch sits above). */
export const JAMB_TOP_FACETED = 1.08;
/** Rectangular opening height — side doors (plain heavy lintel). */
export const JAMB_TOP_LINTEL = 1.4;
/** One room's half of the 30 cm doorway wall. */
export const ROOM_DEPTH = DOOR_WALL_HALF;
export const FRONT = ROOM_DEPTH + FRONT_PROUD;
/** Slight overlap past the shared edge so the two room plates seal. */
export const BACK = -0.004;
/** Door leaf sits in the combined wall thickness, centred on the edge. */
export const LEAF_PAD = 0.03;
export const LEAF_THICK = 0.04;
/** Quarter of the two-sided wall so the frame still reads from each room. */
export const LEAF_REVEAL = DOOR_WALL_DEPTH * 0.25;
export const LEAF_FRONT = LEAF_THICK / 2;
export const LEAF_BACK = -LEAF_THICK / 2;
export const IRON_PROUD = 0.004;
/**
 * Painted wood in `door_panel.png` — the rectangular plank body only.
 * Crops the arched cap and the stone / dark recess around it.
 */
export const DOOR_PANEL_U0 = 0.285;
export const DOOR_PANEL_U1 = 0.715;
export const DOOR_PANEL_V0 = 0.09;
export const DOOR_PANEL_V1 = 0.655;
/** Aged leaf pixels stay at or under this luma — duller than lit stone. */
export const LEAF_MAX_LUMA = 0.42;
/** Fills sit a hair proud of the 15 cm plate so they do not z-fight. */
const FILL_PROUD = 0.006;

export type QuadRole =
  | 'jamb-top'
  | 'chamfer'
  | 'keystone'
  | 'lintel'
  | 'jamb-soffit'
  | 'chip'
  | 'corner'
  | 'chamfer-end'
  | 'leaf'
  | 'iron';
export type QuadKind = 'front' | 'soffit' | 'back';

export type OpeningQuad = {
  role: QuadRole;
  kind: QuadKind;
  /** Local (across, up, depth) corners, CCW. */
  corners: Array<[number, number, number]>;
};

export type OpeningHole = { u0: number; u1: number; v0: number; v1: number };

export function jambTop(style: DoorOpeningStyle): number {
  return style === 'faceted' ? JAMB_TOP_FACETED : JAMB_TOP_LINTEL;
}

/** Rectangular walkable void — lintel and relieving arch sit above this. */
export function openingPunchRect(style: DoorOpeningStyle): OpeningHole {
  return {
    u0: OPEN_U0,
    u1: OPEN_U1,
    v0: 0,
    v1: jambTop(style)
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
  const [W, H, D] = dims;
  const out = new Uint8Array(volume);
  const slice = W * H;
  for (let iv = 0; iv < H; iv++) {
    const y = ((iv + 0.5) / H) * cell;
    for (let iu = 0; iu < W; iu++) {
      const x = ((iu + 0.5) / W) * cell;
      if (!inOpeningVoid(style, x, y)) continue;
      const idx = iu + iv * W;
      for (let d = 0; d < D; d++) out[idx + d * slice] = 0;
    }
  }
  return out;
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
  return JAMB_TOP_LINTEL + LINTEL_H;
}

/** Top of the five-slab relieving arch above a main-door lintel. */
export function facetedTop(): number {
  return JAMB_TOP_FACETED + LINTEL_H + CHAMFER + KEYSTONE_H;
}

export function mainLintelTop(): number {
  return JAMB_TOP_FACETED + LINTEL_H;
}

export function corniceBottom(): number {
  return CELL - CORNICE_HEIGHT;
}

export function wallAboveOpening(style: DoorOpeningStyle): number {
  return corniceBottom() - (style === 'faceted' ? facetedTop() : lintelTop());
}

function frontRect(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  const d = FRONT;
  return [
    [a0, u0, d],
    [a1, u0, d],
    [a1, u1, d],
    [a0, u1, d]
  ];
}

function soffitRect(a0: number, a1: number, u0: number, u1: number): OpeningQuad['corners'] {
  return [
    [a0, u0, FRONT],
    [a0, u0, BACK],
    [a1, u1, BACK],
    [a1, u1, FRONT]
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
 * Room-stone fills between the faceted opening outline and the punched wall
 * rectangle. Front faces the room; back faces the reveal so the triangles
 * are not culled from either side.
 */
export function listFacetedCornerFills(): OpeningQuad[] {
  const u0 = OPEN_U0;
  const u1 = OPEN_U1;
  const spring = mainLintelTop();
  const kb = spring + CHAMFER;
  const ft = facetedTop();
  const cf = ROOM_DEPTH + FILL_PROUD;
  const fronts: OpeningQuad[] = [
    {
      role: 'corner',
      kind: 'front',
      corners: [
        [u0, spring, cf],
        [u0 + CHAMFER, kb, cf],
        [u0 + CHAMFER, ft, cf],
        [u0, ft, cf]
      ]
    },
    {
      role: 'corner',
      kind: 'front',
      corners: [
        [u1, spring, cf],
        [u1, ft, cf],
        [u1 - CHAMFER, ft, cf],
        [u1 - CHAMFER, kb, cf]
      ]
    }
  ];
  return [
    ...fronts,
    ...fronts.map((q) => ({
      role: q.role,
      kind: 'back' as const,
      corners: flipQuadCorners(q.corners)
    }))
  ];
}

/**
 * Wall cell minus the walkable opening must be covered from `side`.
 * Inside the rectangular punch, only the faceted corner fills (and any
 * overlapping slabs) close the two triangles beside the 45° chamfers.
 */
export function openingWallCovered(
  style: DoorOpeningStyle,
  u: number,
  v: number,
  side: 'front' | 'back'
): boolean {
  if (inOpeningVoid(style, u, v)) return true;
  const rect = openingPunchRect(style);
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

/**
 * Rectangular opening, heavy lintel, then a five-slab relieving arch above
 * the lintel with stone fill in the tympanum.
 */
export function listFacetedHeadQuads(): OpeningQuad[] {
  const u0 = OPEN_U0;
  const u1 = OPEN_U1;
  const jt = JAMB_TOP_FACETED;
  const spring = mainLintelTop();
  const ch = CHAMFER;
  const kh = KEYSTONE_H;
  const th = SLAB_THICK;
  const j = JOINT / 2;
  const inv = 1 / Math.SQRT2;
  const out: OpeningQuad[] = [];

  out.push({
    role: 'lintel',
    kind: 'front',
    corners: frontRect(u0 - 0.08, u1 + 0.08, jt, spring)
  });
  out.push({
    role: 'lintel',
    kind: 'soffit',
    corners: soffitRect(u0, u1, jt, jt)
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

  const leftTop0 = spring;
  out.push({
    role: 'jamb-top',
    kind: 'front',
    corners: frontRect(u0 - th, u0 - j, leftTop0 - 0.02, leftTop0 + JAMB_TOP_H)
  });
  out.push({
    role: 'jamb-top',
    kind: 'soffit',
    corners: soffitRect(u0, u0, leftTop0 + j, leftTop0 + JAMB_TOP_H)
  });

  const la0: [number, number] = [u0 + j, spring + j];
  const la1: [number, number] = [u0 + ch - j, spring + ch - j];
  const lp: [number, number] = [-inv * 0.12, inv * 0.12];
  out.push({
    role: 'chamfer',
    kind: 'front',
    corners: [
      [la0[0], la0[1], FRONT],
      [la1[0], la1[1], FRONT],
      [la1[0] + lp[0], la1[1] + lp[1], FRONT],
      [la0[0] + lp[0], la0[1] + lp[1], FRONT]
    ]
  });
  out.push({
    role: 'chamfer',
    kind: 'soffit',
    corners: [
      [la0[0], la0[1], FRONT],
      [la0[0], la0[1], BACK],
      [la1[0], la1[1], BACK],
      [la1[0], la1[1], FRONT]
    ]
  });

  const k0 = u0 + ch + j;
  const k1 = u1 - ch - j;
  const kb = spring + ch;
  out.push({
    role: 'keystone',
    kind: 'front',
    corners: frontRect(k0, k1, kb, kb + kh)
  });
  out.push({
    role: 'keystone',
    kind: 'soffit',
    corners: soffitRect(k0, k1, kb, kb)
  });

  const ra0: [number, number] = [u1 - ch + j, spring + ch - j];
  const ra1: [number, number] = [u1 - j, spring + j];
  const rp: [number, number] = [inv * 0.12, inv * 0.12];
  out.push({
    role: 'chamfer',
    kind: 'front',
    corners: [
      [ra0[0], ra0[1], FRONT],
      [ra1[0], ra1[1], FRONT],
      [ra1[0] + rp[0], ra1[1] + rp[1], FRONT],
      [ra0[0] + rp[0], ra0[1] + rp[1], FRONT]
    ]
  });
  out.push({
    role: 'chamfer',
    kind: 'soffit',
    corners: [
      [ra0[0], ra0[1], FRONT],
      [ra0[0], ra0[1], BACK],
      [ra1[0], ra1[1], BACK],
      [ra1[0], ra1[1], FRONT]
    ]
  });

  out.push({
    role: 'jamb-top',
    kind: 'front',
    corners: frontRect(u1 + j, u1 + th, leftTop0 - 0.02, leftTop0 + JAMB_TOP_H)
  });
  out.push({
    role: 'jamb-top',
    kind: 'soffit',
    corners: soffitRect(u1, u1, leftTop0 + j, leftTop0 + JAMB_TOP_H)
  });

  const ft = kb + kh;
  const cf = ROOM_DEPTH + FILL_PROUD;
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u0 - th, spring, cf],
      [u0, spring, cf],
      [u0 + ch, kb, cf],
      [u0 - th, kb, cf]
    ]
  });
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u0 - th, kb, cf],
      [u0 + ch, kb, cf],
      [u0 + ch, ft, cf],
      [u0 - th, ft, cf]
    ]
  });
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u1, spring, cf],
      [u1 + th, spring, cf],
      [u1 + th, kb, cf],
      [u1 - ch, kb, cf]
    ]
  });
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u1 - ch, kb, cf],
      [u1 + th, kb, cf],
      [u1 + th, ft, cf],
      [u1 - ch, ft, cf]
    ]
  });
  const tymp = ROOM_DEPTH + FILL_PROUD;
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u0 + ch, spring, tymp],
      [u1 - ch, spring, tymp],
      [u1 - ch, kb, tymp],
      [u0 + ch, kb, tymp]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [la0[0], la0[1], FRONT],
      [la0[0] + lp[0], la0[1] + lp[1], FRONT],
      [la0[0] + lp[0], la0[1] + lp[1], BACK],
      [la0[0], la0[1], BACK]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [la1[0], la1[1], FRONT],
      [la1[0], la1[1], BACK],
      [la1[0] + lp[0], la1[1] + lp[1], BACK],
      [la1[0] + lp[0], la1[1] + lp[1], FRONT]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [ra0[0], ra0[1], FRONT],
      [ra0[0] + rp[0], ra0[1] + rp[1], FRONT],
      [ra0[0] + rp[0], ra0[1] + rp[1], BACK],
      [ra0[0], ra0[1], BACK]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [ra1[0], ra1[1], FRONT],
      [ra1[0], ra1[1], BACK],
      [ra1[0] + rp[0], ra1[1] + rp[1], BACK],
      [ra1[0] + rp[0], ra1[1] + rp[1], FRONT]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [la0[0] + lp[0], la0[1] + lp[1], FRONT],
      [la0[0] + lp[0], la0[1] + lp[1], BACK],
      [la1[0] + lp[0], la1[1] + lp[1], BACK],
      [la1[0] + lp[0], la1[1] + lp[1], FRONT]
    ]
  });
  out.push({
    role: 'chamfer-end',
    kind: 'soffit',
    corners: [
      [ra0[0] + rp[0], ra0[1] + rp[1], FRONT],
      [ra1[0] + rp[0], ra1[1] + rp[1], FRONT],
      [ra1[0] + rp[0], ra1[1] + rp[1], BACK],
      [ra0[0] + rp[0], ra0[1] + rp[1], BACK]
    ]
  });
  out.push(...listFacetedCornerFills());
  return out;
}

export function listLintelQuads(): OpeningQuad[] {
  const u0 = OPEN_U0;
  const u1 = OPEN_U1;
  const jt = JAMB_TOP_LINTEL;
  const lh = LINTEL_H;
  const j = JOINT / 2;
  const chip = 0.07;
  const out: OpeningQuad[] = [];
  out.push({
    role: 'lintel',
    kind: 'front',
    corners: frontRect(u0 - 0.06, u1 + 0.06, jt, jt + lh)
  });
  out.push({
    role: 'lintel',
    kind: 'soffit',
    corners: soffitRect(u0 + chip, u1 - chip, jt, jt)
  });
  out.push({
    role: 'chip',
    kind: 'soffit',
    corners: soffitRect(u0, u0 + chip, jt + 0.05, jt + 0.05)
  });
  out.push({
    role: 'chip',
    kind: 'soffit',
    corners: soffitRect(u1 - chip, u1, jt + 0.05, jt + 0.05)
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

export function listOpeningQuads(style: DoorOpeningStyle): OpeningQuad[] {
  return style === 'faceted' ? listFacetedHeadQuads() : listLintelQuads();
}

/** Left-to-right head roles on the opening. Faceted is exactly these five. */
export function listHeadRoles(style: DoorOpeningStyle): QuadRole[] {
  if (style === 'faceted') return ['jamb-top', 'chamfer', 'keystone', 'chamfer', 'jamb-top'];
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

/**
 * Recolour/age pass on `door_panel.png`. Keeps the plank layout, bands,
 * studs, and padlock; shifts wood to dark grey-brown and iron to rusty matte.
 * Original highlight pixels on studs / rivets / the padlock become dull
 * rusty or dark-grey iron — never near white, no specular sparkle.
 */
export function ageDoorPanelPixels(
  src: ArrayLike<number>,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.55;
  const rx = width * 0.32;
  const ry = height * 0.42;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = src[i] / 255;
      const g = src[i + 1] / 255;
      const b = src[i + 2] / 255;
      const a = src[i + 3];
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const sat = maxc > 1e-6 ? (maxc - minc) / maxc : 0;
      const luma = pixelLuma(r, g, b);
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inDoor = dx * dx + dy * dy <= 1.15;
      const edge = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const wood = sat > 0.12 && r > g + 0.02 && r > b + 0.04 && luma < 0.78;
      const highlight = inDoor && !wood && sat < 0.38 && luma >= 0.55;
      const iron = inDoor && !wood && sat < 0.28 && luma > 0.22;
      let nr = r;
      let ng = g;
      let nb = b;
      if (wood) {
        const grey = luma;
        nr = grey * 0.42 + 0.1;
        ng = grey * 0.36 + 0.08;
        nb = grey * 0.3 + 0.06;
        if (luma < 0.22) {
          nr = ng = nb = luma * 0.35;
        }
        const grime = 1 - edge * 0.28;
        nr *= grime;
        ng *= grime * 0.98;
        nb *= grime * 0.92;
      } else if (iron || highlight) {
        [nr, ng, nb] = rustIron(luma);
      }
      if (inDoor) {
        [nr, ng, nb] = clampLeafLuma(nr, ng, nb);
      }
      out[i] = Math.round(Math.min(1, nr) * 255);
      out[i + 1] = Math.round(Math.min(1, ng) * 255);
      out[i + 2] = Math.round(Math.min(1, nb) * 255);
      out[i + 3] = a;
    }
  }
  return out;
}

function pushQuad(
  mesh: MeshArrays,
  corners: Array<[number, number, number]>,
  kind: QuadKind,
  face: FaceNESW,
  tx: number,
  tz: number,
  wood = false,
  leafTop = 0
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
    pushQuad(dest, q.corners, q.kind, face, tx, tz);
  }
  return { stone, lintel };
}

export function leafMeshes(
  style: DoorOpeningStyle,
  face: FaceNESW,
  tx: number,
  tz: number
): { wood: MeshArrays; iron: MeshArrays } {
  const wood = emptyMesh();
  const iron = emptyMesh();
  const top = jambTop(style) - LEAF_PAD;
  for (const q of listLeafQuads(style)) {
    pushQuad(wood, q.corners, q.kind, face, tx, tz, true, top);
  }
  for (const q of listIronQuads(style)) {
    pushQuad(iron, q.corners, q.kind, face, tx, tz);
  }
  return { wood, iron };
}

export function openingUsesWallTexels(): number {
  return WALL_TEXELS;
}
