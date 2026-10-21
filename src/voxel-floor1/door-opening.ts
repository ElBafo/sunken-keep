import * as THREE from 'three';
import { tileCorner } from '../voxel-lab/faces';
import type { MeshArrays } from '../voxel-lab/mesher';
import { ARCH_DEPTH, ARCH_FRONT, CELL, WALL_TEXELS } from './constants';
import { faceUOffset } from './wall-look';
import { projectArchOpeningUvs } from './uv-audit';

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

export const OPEN_WIDTH = 1.14;
export const OPEN_U0 = (CELL - OPEN_WIDTH) / 2;
export const OPEN_U1 = OPEN_U0 + OPEN_WIDTH;
export const JAMB_THICK = 0.2;
export const JAMB_JOINT = 0.022;
export const WALL_BITE = 0.05;
export const CHAMFER = 0.28;
export const KEYSTONE_H = 0.24;
export const LINTEL_H = 0.28;
export const LINTEL_BEAR = 0.1;
export const JAMB_TOP_FACETED = 1.28;
export const JAMB_TOP_LINTEL = 1.5;
export const SLAB_DEPTH = ARCH_DEPTH + ARCH_FRONT + WALL_BITE;
const DEPTH_CENTER = SLAB_DEPTH / 2 - WALL_BITE;

export type LocalSlab = {
  across: number;
  up: number;
  depth: number;
  sa: number;
  su: number;
  sd: number;
  rotD: number;
  role: 'jamb' | 'back' | 'chamfer' | 'keystone' | 'lintel' | 'chip';
};

export type OpeningHole = { u0: number; u1: number; v0: number; v1: number };

/** Rectangle punched from the room-side plate — covers every slab so rotated chamfers cannot poke through. */
export function openingPunchRect(style: DoorOpeningStyle): OpeningHole {
  let u0 = OPEN_U0 - JAMB_THICK - 0.08;
  let u1 = OPEN_U1 + JAMB_THICK + 0.08;
  let v1 =
    style === 'faceted'
      ? JAMB_TOP_FACETED + CHAMFER + KEYSTONE_H + 0.16
      : JAMB_TOP_LINTEL + LINTEL_H + 0.08;
  for (const slab of listOpeningSlabs(style)) {
    const reach = 0.5 * Math.hypot(slab.sa, slab.su) + 0.04;
    u0 = Math.min(u0, slab.across - reach);
    u1 = Math.max(u1, slab.across + reach);
    v1 = Math.max(v1, slab.up + reach);
  }
  return {
    u0: Math.max(0.02, u0),
    u1: Math.min(CELL - 0.02, u1),
    v0: 0,
    v1: Math.min(CELL - 0.08, v1)
  };
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

function stackJambs(side: 'L' | 'R', top: number, count: number): LocalSlab[] {
  const out: LocalSlab[] = [];
  const inner = side === 'L' ? OPEN_U0 : OPEN_U1;
  const sign = side === 'L' ? -1 : 1;
  const across = inner + sign * (JAMB_THICK / 2);
  const usable = top - JAMB_JOINT * (count - 1);
  const raw = Array.from({ length: count }, (_, i) => 0.26 + (i % 3) * 0.05);
  const rawSum = raw.reduce((a, b) => a + b, 0);
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const h = (raw[i] / rawSum) * usable;
    out.push({
      across,
      up: cursor + h / 2,
      depth: DEPTH_CENTER,
      sa: JAMB_THICK,
      su: h,
      sd: SLAB_DEPTH,
      rotD: 0,
      role: 'jamb'
    });
    cursor += h + JAMB_JOINT;
  }
  out.push({
    across: inner + sign * (JAMB_THICK * 0.72),
    up: top / 2,
    depth: DEPTH_CENTER,
    sa: JAMB_THICK * 0.7,
    su: top + 0.04,
    sd: SLAB_DEPTH,
    rotD: 0,
    role: 'back'
  });
  return out;
}

function chamferSlab(side: 'L' | 'R'): LocalSlab {
  const v0 = JAMB_TOP_FACETED;
  const ch = CHAMFER;
  const sa = JAMB_THICK;
  const su = ch * Math.SQRT2;
  const rotD = side === 'L' ? -Math.PI / 4 : Math.PI / 4;
  const midA = side === 'L' ? OPEN_U0 + ch / 2 : OPEN_U1 - ch / 2;
  const midU = v0 + ch / 2;
  const face = sa / (2 * Math.SQRT2);
  const across = side === 'L' ? midA - face : midA + face;
  const up = midU + face;
  return {
    across,
    up,
    depth: DEPTH_CENTER,
    sa,
    su,
    sd: SLAB_DEPTH,
    rotD,
    role: 'chamfer'
  };
}

export function listOpeningSlabs(style: DoorOpeningStyle): LocalSlab[] {
  const slabs: LocalSlab[] = [];
  if (style === 'faceted') {
    slabs.push(...stackJambs('L', JAMB_TOP_FACETED, 3));
    slabs.push(...stackJambs('R', JAMB_TOP_FACETED, 3));
    slabs.push(chamferSlab('L'), chamferSlab('R'));
    const keyU0 = OPEN_U0 + CHAMFER;
    const keyU1 = OPEN_U1 - CHAMFER;
    slabs.push({
      across: (keyU0 + keyU1) / 2,
      up: JAMB_TOP_FACETED + CHAMFER + KEYSTONE_H / 2,
      depth: DEPTH_CENTER,
      sa: keyU1 - keyU0 + 0.06,
      su: KEYSTONE_H,
      sd: SLAB_DEPTH,
      rotD: 0,
      role: 'keystone'
    });
    return slabs;
  }
  slabs.push(...stackJambs('L', JAMB_TOP_LINTEL, 4));
  slabs.push(...stackJambs('R', JAMB_TOP_LINTEL, 4));
  const lintelA0 = OPEN_U0 - LINTEL_BEAR;
  const lintelA1 = OPEN_U1 + LINTEL_BEAR;
  const lintelV0 = JAMB_TOP_LINTEL;
  const chipW = 0.08;
  const notch = 0.09;
  const proud = 0.035;
  slabs.push({
    across: (lintelA0 + lintelA1) / 2,
    up: lintelV0 + notch + (LINTEL_H - notch) / 2,
    depth: DEPTH_CENTER + proud / 2,
    sa: lintelA1 - lintelA0,
    su: LINTEL_H - notch,
    sd: SLAB_DEPTH + proud,
    rotD: 0,
    role: 'lintel'
  });
  slabs.push({
    across: (lintelA0 + lintelA1) / 2,
    up: lintelV0 + notch / 2,
    depth: DEPTH_CENTER + proud / 2,
    sa: lintelA1 - lintelA0 - chipW * 2,
    su: notch,
    sd: SLAB_DEPTH + proud,
    rotD: 0,
    role: 'chip'
  });
  return slabs;
}

export function jambCount(slabs: LocalSlab[], side: 'L' | 'R'): number {
  const inner = side === 'L' ? OPEN_U0 : OPEN_U1;
  return slabs.filter((s) => s.role === 'jamb' && Math.abs(s.across - inner) < JAMB_THICK).length;
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

function mapLocalN(face: FaceNESW, na: number, nu: number, nd: number): [number, number, number] {
  switch (face) {
    case 'N':
      return [na, nu, nd];
    case 'S':
      return [-na, nu, -nd];
    case 'W':
      return [nd, nu, -na];
    case 'E':
      return [-nd, nu, na];
  }
}

export function slabToMesh(slab: LocalSlab, face: FaceNESW, tx: number, tz: number): MeshArrays {
  const geo = new THREE.BoxGeometry(slab.sa, slab.su, slab.sd);
  if (slab.rotD) geo.rotateZ(slab.rotD);
  geo.translate(slab.across, slab.up, slab.depth);
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const idx = geo.getIndex();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = mapLocal(face, tx, tz, pos.getX(i), pos.getY(i), pos.getZ(i));
    const [nx, ny, nz] = mapLocalN(face, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(uv.getX(i), uv.getY(i));
  }
  if (idx) {
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i));
  } else {
    for (let i = 0; i < pos.count; i++) indices.push(i);
  }
  projectArchOpeningUvs(positions, normals, uvs, face, CELL, faceUOffset(face, tx, tz));
  geo.dispose();
  return { positions, normals, uvs, indices };
}

export function openingSlabMeshes(style: DoorOpeningStyle, face: FaceNESW, tx: number, tz: number): MeshArrays[] {
  return listOpeningSlabs(style).map((slab) => slabToMesh(slab, face, tx, tz));
}

export function metresToTexelRect(
  hole: OpeningHole,
  W: number,
  H: number,
  cell = CELL
): { u0: number; u1: number; v0: number; v1: number } {
  return {
    u0: Math.floor((hole.u0 / cell) * W),
    u1: Math.ceil((hole.u1 / cell) * W),
    v0: Math.floor((hole.v0 / cell) * H),
    v1: Math.ceil((hole.v1 / cell) * H)
  };
}

export function openingUsesWallTexels(): number {
  return WALL_TEXELS;
}
