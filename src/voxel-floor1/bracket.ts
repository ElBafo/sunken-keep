import * as THREE from 'three';
import {
  BRACKET_CUP_D,
  BRACKET_CUP_U,
  BRACKET_CUP_V,
  BRACKET_DIMS,
  BRACKET_VOX,
  BRACKET_WALL_GAP,
  BRASS_COLOR,
  CELL,
  IRON_COLOR,
  RUST_COLOR
} from './constants';
import { FACE_INTO_ROOM, sconceIsLit, type SconceSpec } from './fixtures';
import { geometryFrom } from '../voxel-lab/materials';
import { greedyMesh } from '../voxel-lab/mesher';

export const MAT_IRON = 1;
export const MAT_RUST = 2;
export const MAT_BRASS = 3;

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
 * Slim iron sconce at wall-texel size: 1-texel flush plate, arm, open cup.
 * No slab / backboard that reads as a ledge from the side.
 */
export function buildBracketOccupancy(capped: boolean): {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
} {
  const dims = BRACKET_DIMS;
  const volume = new Uint8Array(dims[0] * dims[1] * dims[2]);
  // Flush plate — one texel thick, small, against the stone.
  fillBox(volume, dims, 6, 10, 0, 9, 21, 0, MAT_IRON);
  fillBox(volume, dims, 6, 12, 0, 6, 18, 0, MAT_RUST);
  // Arm.
  fillBox(volume, dims, 7, 15, 1, 8, 16, 13, MAT_IRON);
  fillBox(volume, dims, 7, 13, 1, 8, 14, 6, MAT_IRON);
  // Cup: open top, low front lip so the painted flame reads.
  fillBox(volume, dims, 5, 14, 12, 10, 14, 17, MAT_IRON);
  fillBox(volume, dims, 5, 14, 12, 5, 19, 17, MAT_IRON);
  fillBox(volume, dims, 10, 14, 12, 10, 19, 17, MAT_IRON);
  fillBox(volume, dims, 6, 14, 12, 9, 19, 12, MAT_IRON);
  fillBox(volume, dims, 6, 14, 17, 9, 16, 17, MAT_IRON);
  fillBox(volume, dims, 5, 19, 12, 10, 19, 17, MAT_BRASS);
  if (capped) fillBox(volume, dims, 5, 20, 12, 10, 21, 17, MAT_IRON);
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

function ironMat(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0,
    emissive: 0x000000,
    flatShading: false
  });
}

const MATS: Record<number, THREE.MeshStandardMaterial> = {
  [MAT_IRON]: ironMat(IRON_COLOR, 0.12, 0.9),
  [MAT_RUST]: ironMat(RUST_COLOR, 0.04, 0.92),
  [MAT_BRASS]: ironMat(BRASS_COLOR, 0.22, 0.62)
};

export function meshBracket(spec: SconceSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = `bracket:${spec.x},${spec.y},${spec.face}`;
  const { volume, dims } = buildBracketOccupancy(!!spec.capped);
  const toWorld = bracketToWorld(spec);
  for (const id of [MAT_IRON, MAT_RUST, MAT_BRASS]) {
    const occ = extract(volume, id);
    const meshed = greedyMesh(occ, dims, toWorld);
    const geo = geometryFrom(meshed.mesh);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, MATS[id]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
