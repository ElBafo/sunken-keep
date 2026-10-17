import * as THREE from 'three';
import {
  BRACKET_CUP_D,
  BRACKET_CUP_U,
  BRACKET_CUP_V,
  BRACKET_DIMS,
  BRACKET_HANDLE_TILT,
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
const HANDLE_V0 = 10;
const HANDLE_D0 = 1;
const TILT = Math.tan(BRACKET_HANDLE_TILT);

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
  if (i < 10) return 2;
  return 3;
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
  // 1-texel plate ~2× handle width: front ~1 texel proud of the stone, just
  // enough to stay visible. Full-width dark iron with a 1-texel lighter rim.
  fillBox(volume, dims, 3, 5, 0, 12, 40, 0, MAT_IRON);
  fillBox(volume, dims, 3, 5, 0, 3, 40, 0, MAT_RUST);
  fillBox(volume, dims, 12, 5, 0, 12, 40, 0, MAT_RUST);
  fillBox(volume, dims, 4, 5, 0, 11, 5, 0, MAT_RUST);
  fillBox(volume, dims, 4, 40, 0, 11, 40, 0, MAT_RUST);
  // Short arm from the plate's middle out to the collar.
  fillBox(volume, dims, 7, 21, 1, 9, 25, 5, MAT_IRON);
  // Collar: same mid-grey iron, darker edge (not a pale band).
  fillBox(volume, dims, 6, 21, 5, 10, 21, 9, MAT_RUST);
  fillBox(volume, dims, 6, 25, 5, 10, 25, 9, MAT_RUST);
  fillBox(volume, dims, 6, 22, 5, 6, 24, 9, MAT_RUST);
  fillBox(volume, dims, 10, 22, 5, 10, 24, 9, MAT_RUST);
  fillBox(volume, dims, 7, 22, 5, 9, 24, 5, MAT_IRON);
  fillBox(volume, dims, 7, 22, 9, 9, 24, 9, MAT_RUST);
  fillBox(volume, dims, 7, 22, 6, 9, 24, 8, MAT_IRON);
  // Tapered wood: narrow bottom, wider top, 18° out from the wall.
  for (let i = 0; i < HANDLE_LEN; i++) {
    const s = handleSlice(i);
    fillBox(volume, dims, s.u0, s.v, s.d0, s.u1, s.v, s.d1, MAT_WOOD);
  }
  // Gold wrap: ~1/6 of the handle, a short band right under the flame.
  if (!capped) {
    fillBox(volume, dims, 6, 38, 9, 10, 41, 13, MAT_GOLD);
  } else {
    // Iron sleeve from below the wrap to a dome, covering the cup on every
    // side so no gold reads from front, side, or 45°.
    fillBox(volume, dims, 3, 37, 7, 13, 44, 17, MAT_IRON);
    fillBox(volume, dims, 3, 37, 17, 13, 44, 17, MAT_RUST);
    fillBox(volume, dims, 3, 37, 7, 3, 44, 17, MAT_RUST);
    fillBox(volume, dims, 13, 37, 7, 13, 44, 17, MAT_RUST);
    fillBox(volume, dims, 4, 44, 8, 12, 46, 16, MAT_IRON);
    fillBox(volume, dims, 4, 44, 16, 12, 46, 16, MAT_RUST);
    fillBox(volume, dims, 5, 46, 9, 11, 47, 15, MAT_IRON);
    fillBox(volume, dims, 5, 46, 15, 11, 47, 15, MAT_RUST);
    // Hasp: strap on the cap front, padlock hanging through it.
    fillBox(volume, dims, 6, 42, 17, 10, 44, 19, MAT_IRON);
    fillBox(volume, dims, 7, 38, 17, 9, 42, 19, MAT_IRON);
    fillBox(volume, dims, 6, 36, 18, 10, 40, 21, MAT_IRON);
    fillBox(volume, dims, 6, 36, 18, 6, 40, 21, MAT_RUST);
    fillBox(volume, dims, 10, 36, 18, 10, 40, 21, MAT_RUST);
    fillBox(volume, dims, 6, 36, 21, 10, 36, 21, MAT_RUST);
    fillBox(volume, dims, 6, 40, 19, 6, 44, 21, MAT_IRON);
    fillBox(volume, dims, 10, 40, 19, 10, 44, 21, MAT_IRON);
    fillBox(volume, dims, 6, 44, 19, 10, 44, 21, MAT_IRON);
    fillBox(volume, dims, 8, 37, 21, 8, 39, 21, MAT_GOLD);
  }
  let voxelCount = 0;
  for (let i = 0; i < volume.length; i++) if (volume[i]) voxelCount += 1;
  return { volume, dims, voxelCount };
}

export function bracketToWorld(spec: SconceSpec): (u: number, v: number, d: number) => [number, number, number] {
  const { nx, nz } = FACE_INTO_ROOM[spec.face];
  // Even permutation so greedy-mesh +d faces point into the room (FrontSide).
  const px = nz;
  const pz = -nx;
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
    const meshed = greedyMesh(occ, dims, toWorld, { cullNeg: [false, false, false] });
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
