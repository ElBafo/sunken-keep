import * as THREE from 'three';
import {
  BRACKET_CUP_D,
  BRACKET_CUP_U,
  BRACKET_CUP_V,
  BRACKET_DIMS,
  BRACKET_LAYER,
  BRACKET_VOX,
  BRACKET_WALL_GAP,
  CELL,
  GOLD_COLOR,
  IRON_COLOR,
  RUST_COLOR,
  WOOD_COLOR
} from './constants';
import { FACE_INTO_ROOM, sconceIsLit, type SconceSpec } from './fixtures';
import { geometryFrom } from '../voxel-lab/materials';
import { greedyMesh } from '../voxel-lab/mesher';

export const MAT_IRON = 1;
export const MAT_RUST = 2;
export const MAT_WOOD = 3;
export const MAT_GOLD = 4;

const HANDLE_LEN = 28;
const HANDLE_V0 = 8;
const HANDLE_D0 = 4;
const TILT = Math.tan((18 * Math.PI) / 180);

function fillBox(
  volume: Uint8Array,
  dims: [number, number, number],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number
): void {
  const [W, H, D] = dims;
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(W - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(H - 1, Math.max(y0, y1));
  const za = Math.max(0, Math.min(z0, z1));
  const zb = Math.min(D - 1, Math.max(z0, z1));
  for (let z = za; z <= zb; z++) {
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        volume[x + y * W + z * W * H] = id;
      }
    }
  }
}

function handleWidth(i: number): number {
  if (i < 7) return 2;
  if (i < 17) return 3;
  return 4;
}

function handleSlice(i: number): { u0: number; u1: number; v: number; d0: number; d1: number } {
  const w = handleWidth(i);
  const v = HANDLE_V0 + i;
  const d = HANDLE_D0 + Math.round(i * TILT);
  const u0 = 8 - Math.floor(w / 2);
  const d0 = d - Math.floor(w / 2);
  return { u0, u1: u0 + w - 1, v, d0, d1: d0 + w - 1 };
}

/**
 * Minecraft-style wall torch at wall-texel size: tall narrow mid-grey plate,
 * short iron collar, tapered wood handle tilted ~18° off the wall, gold cup.
 */
export function buildBracketOccupancy(capped: boolean): {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
} {
  const dims = BRACKET_DIMS;
  const volume = new Uint8Array(dims[0] * dims[1] * dims[2]);
  // Dark bevelled frame — 8×22×3 (12.5 × 34.4 × 4.7 cm), wide enough to read around the stick.
  fillBox(volume, dims, 4, 14, 0, 11, 35, 2, MAT_RUST);
  // Raised mid-grey inner plate, a few cm thick.
  fillBox(volume, dims, 5, 15, 0, 10, 34, 3, MAT_IRON);
  // Short arm from the plate's middle out to the collar.
  fillBox(volume, dims, 7, 22, 3, 9, 26, 7, MAT_IRON);
  // Iron ring wrapping the handle (2-texel front band).
  fillBox(volume, dims, 6, 22, 8, 10, 22, 12, MAT_IRON);
  fillBox(volume, dims, 6, 26, 8, 10, 26, 12, MAT_IRON);
  fillBox(volume, dims, 6, 23, 8, 6, 25, 12, MAT_IRON);
  fillBox(volume, dims, 10, 23, 8, 10, 25, 12, MAT_IRON);
  fillBox(volume, dims, 7, 23, 8, 9, 25, 8, MAT_IRON);
  fillBox(volume, dims, 7, 23, 11, 9, 25, 12, MAT_IRON);
  // Tapered wood: narrow bottom, wider top, 18° out from the wall.
  for (let i = 0; i < HANDLE_LEN; i++) {
    const s = handleSlice(i);
    fillBox(volume, dims, s.u0, s.v, s.d0, s.u1, s.v, s.d1, MAT_WOOD);
  }
  // Yellow-gold cup / wrap, slightly wider than the handle top.
  fillBox(volume, dims, 5, 36, 11, 10, 40, 16, MAT_GOLD);
  if (capped) fillBox(volume, dims, 5, 41, 11, 10, 42, 16, MAT_IRON);
  let voxelCount = 0;
  for (let i = 0; i < volume.length; i++) if (volume[i]) voxelCount += 1;
  return { volume, dims, voxelCount };
}

export function bracketToWorld(spec: SconceSpec): (u: number, v: number, d: number) => [number, number, number] {
  const { nx, nz } = FACE_INTO_ROOM[spec.face];
  const px = -nz;
  const pz = nx;
  const wallX = spec.x * CELL + nx * (CELL / 2);
  const wallZ = spec.y * CELL + nz * (CELL / 2);
  const midY = CELL / 2 + 0.04;
  const [W, H] = BRACKET_DIMS;
  return (u, v, d) => {
    const across = (u - W / 2) * BRACKET_VOX;
    const up = (v - H / 2) * BRACKET_VOX;
    const out = d * BRACKET_VOX + BRACKET_WALL_GAP;
    return [wallX + nx * out + px * across, midY + up, wallZ + nz * out + pz * across];
  };
}

function extract(volume: Uint8Array, id: number): Uint8Array {
  const out = new Uint8Array(volume.length);
  for (let i = 0; i < volume.length; i++) out[i] = volume[i] === id ? 1 : 0;
  return out;
}

function matteMat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    fog: true
  });
}

const MATS: Record<number, THREE.MeshBasicMaterial> = {
  // Unlit authored colours — torch point light would blow the cup and hide the plate.
  [MAT_IRON]: matteMat(IRON_COLOR),
  [MAT_RUST]: matteMat(RUST_COLOR),
  [MAT_WOOD]: matteMat(WOOD_COLOR),
  [MAT_GOLD]: matteMat(GOLD_COLOR)
};

export function meshBracket(spec: SconceSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = `bracket:${spec.x},${spec.y},${spec.face}`;
  const { volume, dims } = buildBracketOccupancy(!!spec.capped);
  const toWorld = bracketToWorld(spec);
  for (const id of [MAT_IRON, MAT_RUST, MAT_WOOD, MAT_GOLD]) {
    const occ = extract(volume, id);
    const meshed = greedyMesh(occ, dims, toWorld);
    const geo = geometryFrom(meshed.mesh);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, MATS[id]);
    mesh.layers.set(BRACKET_LAYER);
    mesh.userData.noShadow = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = `bracket-${id}`;
    group.add(mesh);
  }
  return group;
}

export function flameOnBracket(spec: SconceSpec): boolean {
  return sconceIsLit(spec);
}

export function cupWorldPos(spec: SconceSpec): { x: number; y: number; z: number } {
  const [x, y, z] = bracketToWorld(spec)(BRACKET_CUP_U, BRACKET_CUP_V, BRACKET_CUP_D);
  return { x, y, z };
}
