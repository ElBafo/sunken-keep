import { tileCorner } from '../voxel-lab/faces';
import type { MeshArrays } from '../voxel-lab/mesher';
import { ARCH_DEPTH, ARCH_FRONT, CELL, CORNICE_HEIGHT, DOOR_PANEL_INSET, WALL_TEXELS } from './constants';
import { faceUOffset } from './wall-look';

export type DoorOpeningStyle = 'faceted' | 'lintel';

/**
 * Main doors sit between halls. Side doors are cellar / lair / pantry-type.
 * Floor 1 has four door tiles — two of each style.
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
/** 45° run = rise. Keeps a full brick course of wall under the cornice. */
export const CHAMFER = 0.3;
export const KEYSTONE_H = 0.2;
export const LINTEL_H = 0.22;
export const JAMB_TOP_H = 0.4;
export const JAMB_TOP_FACETED = 1.14;
export const JAMB_TOP_LINTEL = 1.4;
export const ROOM_DEPTH = ARCH_DEPTH + ARCH_FRONT;
export const FRONT = ROOM_DEPTH + FRONT_PROUD;
export const BACK = 0;
/** Door leaf sits just inside the room-side plate. */
export const LEAF_PAD = 0.03;
export const LEAF_THICK = 0.055;
export const LEAF_FRONT = ROOM_DEPTH - DOOR_PANEL_INSET;
export const LEAF_BACK = LEAF_FRONT - LEAF_THICK;
/** Crop of door_panel.png wood, skipping the painted stone surround. */
export const WOOD_UV = { u0: 0.23, u1: 0.77, v0: 0.1, v1: 0.68 } as const;

export type QuadRole =
  | 'jamb-top'
  | 'chamfer'
  | 'keystone'
  | 'lintel'
  | 'jamb-soffit'
  | 'chip'
  | 'corner'
  | 'chamfer-end'
  | 'leaf';
export type QuadKind = 'front' | 'soffit' | 'back';

export type OpeningQuad = {
  role: QuadRole;
  kind: QuadKind;
  /** Local (across, up, depth) corners, CCW. */
  corners: Array<[number, number, number]>;
};

export type OpeningHole = { u0: number; u1: number; v0: number; v1: number };

/** Bounding box of the inner void. Faceted is not this rectangle — see inOpeningVoid. */
export function openingPunchRect(style: DoorOpeningStyle): OpeningHole {
  const v1 =
    style === 'faceted' ? JAMB_TOP_FACETED + CHAMFER + KEYSTONE_H : JAMB_TOP_LINTEL + LINTEL_H;
  return {
    u0: OPEN_U0,
    u1: OPEN_U1,
    v0: 0,
    v1
  };
}

/** True inside the walkable opening. Faceted head is five straight segments, not a box. */
export function inOpeningVoid(style: DoorOpeningStyle, u: number, v: number): boolean {
  if (v < 0) return false;
  if (style === 'lintel') {
    return u >= OPEN_U0 && u < OPEN_U1 && v < lintelTop();
  }
  if (v >= facetedTop()) return false;
  if (v <= JAMB_TOP_FACETED) {
    return u >= OPEN_U0 && u < OPEN_U1;
  }
  const rise = v - JAMB_TOP_FACETED;
  if (rise < CHAMFER) {
    return u >= OPEN_U0 + rise && u < OPEN_U1 - rise;
  }
  return u >= OPEN_U0 + CHAMFER && u < OPEN_U1 - CHAMFER;
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

export function facetedTop(): number {
  return JAMB_TOP_FACETED + CHAMFER + KEYSTONE_H;
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

/** Five head slabs, left to right, each with one front and one soffit. */
export function listFacetedHeadQuads(): OpeningQuad[] {
  const u0 = OPEN_U0;
  const u1 = OPEN_U1;
  const jt = JAMB_TOP_FACETED;
  const ch = CHAMFER;
  const kh = KEYSTONE_H;
  const th = SLAB_THICK;
  const j = JOINT / 2;
  const inv = 1 / Math.SQRT2;
  const out: OpeningQuad[] = [];

  const leftTop0 = jt - JAMB_TOP_H;
  out.push({
    role: 'jamb-top',
    kind: 'front',
    corners: frontRect(u0 - th, u0 - j, leftTop0, jt)
  });
  out.push({
    role: 'jamb-top',
    kind: 'soffit',
    corners: soffitRect(u0, u0, leftTop0 + j, jt - j)
  });

  const la0: [number, number] = [u0 + j, jt + j];
  const la1: [number, number] = [u0 + ch - j, jt + ch - j];
  const lp: [number, number] = [-inv * th, inv * th];
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
  const kb = jt + ch;
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

  const ra0: [number, number] = [u1 - ch + j, jt + ch - j];
  const ra1: [number, number] = [u1 - j, jt + j];
  const rp: [number, number] = [inv * th, inv * th];
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
    corners: frontRect(u1 + j, u1 + th, leftTop0, jt)
  });
  out.push({
    role: 'jamb-top',
    kind: 'soffit',
    corners: soffitRect(u1, u1, leftTop0 + j, jt - j)
  });

  out.push({
    role: 'jamb-soffit',
    kind: 'soffit',
    corners: soffitRect(u0, u0, 0, leftTop0)
  });
  out.push({
    role: 'jamb-soffit',
    kind: 'soffit',
    corners: soffitRect(u1, u1, 0, leftTop0)
  });

  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u0 - th, jt, FRONT],
      [u0, jt, FRONT],
      [u0 + ch, kb, FRONT],
      [u0 - th, kb, FRONT]
    ]
  });
  out.push({
    role: 'corner',
    kind: 'front',
    corners: [
      [u1, jt, FRONT],
      [u1 + th, jt, FRONT],
      [u1 + th, kb, FRONT],
      [u1 - ch, kb, FRONT]
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

/** Front / back / edge quads for a leaf that matches the opening silhouette. */
export function listLeafQuads(style: DoorOpeningStyle): OpeningQuad[] {
  const pad = LEAF_PAD;
  const u0 = OPEN_U0 + pad;
  const u1 = OPEN_U1 - pad;
  const out: OpeningQuad[] = [];
  const pushPair = (a0: number, a1: number, y0: number, y1: number): void => {
    out.push({ role: 'leaf', kind: 'front', corners: leafFrontRect(a0, a1, y0, y1) });
    out.push({ role: 'leaf', kind: 'back', corners: leafBackRect(a0, a1, y0, y1) });
  };

  if (style === 'lintel') {
    const top = JAMB_TOP_LINTEL - pad;
    pushPair(u0, u1, 0, top);
    out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0, u0, 0, top) });
    out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u1, u1, 0, top) });
    out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0, u1, top, top) });
    return out;
  }

  const jt = JAMB_TOP_FACETED;
  const ch = CHAMFER;
  const top = jt + ch - pad;
  pushPair(u0, u1, 0, jt);
  out.push({
    role: 'leaf',
    kind: 'front',
    corners: [
      [u0, jt, LEAF_FRONT],
      [u0 + ch, jt, LEAF_FRONT],
      [u0 + ch, top, LEAF_FRONT],
      [u0 + (top - jt), top, LEAF_FRONT]
    ]
  });
  out.push({
    role: 'leaf',
    kind: 'back',
    corners: [
      [u0, jt, LEAF_BACK],
      [u0 + (top - jt), top, LEAF_BACK],
      [u0 + ch, top, LEAF_BACK],
      [u0 + ch, jt, LEAF_BACK]
    ]
  });
  pushPair(u0 + ch, u1 - ch, jt, top);
  out.push({
    role: 'leaf',
    kind: 'front',
    corners: [
      [u1 - ch, jt, LEAF_FRONT],
      [u1, jt, LEAF_FRONT],
      [u1 - (top - jt), top, LEAF_FRONT],
      [u1 - ch, top, LEAF_FRONT]
    ]
  });
  out.push({
    role: 'leaf',
    kind: 'back',
    corners: [
      [u1 - ch, jt, LEAF_BACK],
      [u1 - ch, top, LEAF_BACK],
      [u1 - (top - jt), top, LEAF_BACK],
      [u1, jt, LEAF_BACK]
    ]
  });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0, u0, 0, jt) });
  out.push({
    role: 'leaf',
    kind: 'soffit',
    corners: leafEdge(u0, u0 + (top - jt), jt, top)
  });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u0 + (top - jt), u1 - (top - jt), top, top) });
  out.push({
    role: 'leaf',
    kind: 'soffit',
    corners: leafEdge(u1 - (top - jt), u1, top, jt)
  });
  out.push({ role: 'leaf', kind: 'soffit', corners: leafEdge(u1, u1, jt, 0) });
  return out;
}

export function listLeafHeadRoles(style: DoorOpeningStyle): QuadRole[] {
  if (style === 'lintel') return ['leaf'];
  return ['leaf', 'leaf', 'leaf'];
}

type FaceNESW = 'N' | 'E' | 'S' | 'W';

function mapLocal(face: FaceNESW, tx: number, tz: number, a: number, u: number, d: number): [number, number, number] {
  const { ox, oz } = tileCorner(tx, tz, CELL, 'center');
  switch (face) {
    case 'N':
      return [ox + a, u, oz - ARCH_DEPTH + d];
    case 'S':
      return [ox + CELL - a, u, oz + CELL + ARCH_DEPTH - d];
    case 'W':
      return [ox - ARCH_DEPTH + d, u, oz + CELL - a];
    case 'E':
      return [ox + CELL + ARCH_DEPTH - d, u, oz + a];
  }
}

function woodUv(a: number, u: number): [number, number] {
  const tu = WOOD_UV.u0 + ((a - OPEN_U0) / OPEN_WIDTH) * (WOOD_UV.u1 - WOOD_UV.u0);
  const tv = WOOD_UV.v0 + (u / facetedTop()) * (WOOD_UV.v1 - WOOD_UV.v0);
  return [tu, tv];
}

function pushQuad(
  mesh: MeshArrays,
  corners: Array<[number, number, number]>,
  kind: QuadKind,
  face: FaceNESW,
  tx: number,
  tz: number,
  wood = false
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
    for (const c of corners) uv.push(woodUv(c[0], c[1]));
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

export function leafMeshes(style: DoorOpeningStyle, face: FaceNESW, tx: number, tz: number): MeshArrays {
  const mesh = emptyMesh();
  for (const q of listLeafQuads(style)) {
    pushQuad(mesh, q.corners, q.kind, face, tx, tz, true);
  }
  return mesh;
}

export function openingUsesWallTexels(): number {
  return WALL_TEXELS;
}
