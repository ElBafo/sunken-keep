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

/**
 * ~50 cm wall torch at wall-texel size: flush iron plate, wooden stave
 * in a dark iron ring/cup. No slab backboard, no pale rim.
 */
export function buildBracketOccupancy(capped: boolean): {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
} {
  const dims = BRACKET_DIMS;
  const volume = new Uint8Array(dims[0] * dims[1] * dims[2]);
  // Flush plate — one texel thick.
  fillBox(volume, dims, 8, 16, 0, 11, 34, 0, MAT_IRON);
  fillBox(volume, dims, 8, 20, 0, 8, 28, 0, MAT_RUST);
  // Iron arm out to the ring.
  fillBox(volume, dims, 9, 24, 1, 10, 28, 24, MAT_IRON);
  // Dark iron cup / ring (hollow, open top, low front lip).
  fillBox(volume, dims, 6, 32, 24, 13, 33, 31, MAT_IRON);
  fillBox(volume, dims, 6, 32, 24, 6, 39, 31, MAT_IRON);
  fillBox(volume, dims, 13, 32, 24, 13, 39, 31, MAT_IRON);
  fillBox(volume, dims, 7, 32, 24, 12, 39, 24, MAT_IRON);
  fillBox(volume, dims, 7, 32, 31, 12, 35, 31, MAT_IRON);
  // Wooden handle standing in the cup, hanging below.
  fillBox(volume, dims, 9, 10, 26, 11, 36, 28, MAT_WOOD);
  if (capped) fillBox(volume, dims, 6, 40, 24, 13, 41, 31, MAT_IRON);
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

function matteMat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: 0x000000
  });
}

const MATS: Record<number, THREE.MeshLambertMaterial> = {
  [MAT_IRON]: matteMat(IRON_COLOR),
  [MAT_RUST]: matteMat(RUST_COLOR),
  [MAT_WOOD]: matteMat(WOOD_COLOR)
};

export function meshBracket(spec: SconceSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = `bracket:${spec.x},${spec.y},${spec.face}`;
  const { volume, dims } = buildBracketOccupancy(!!spec.capped);
  const toWorld = bracketToWorld(spec);
  for (const id of [MAT_IRON, MAT_RUST, MAT_WOOD]) {
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
