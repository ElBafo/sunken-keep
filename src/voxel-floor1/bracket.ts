import * as THREE from 'three';
import {
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

/** A few iron / rust / brass cubes: backplate, arm, cup. Capped gets a lid. */
export function buildBracketOccupancy(capped: boolean): {
  volume: Uint8Array;
  dims: [number, number, number];
  voxelCount: number;
} {
  const dims = BRACKET_DIMS;
  const [W, H, D] = dims;
  const volume = new Uint8Array(W * H * D);
  // Backplate against the wall.
  fillBox(volume, dims, 1, 2, 0, 8, 17, 1, MAT_IRON);
  fillBox(volume, dims, 1, 4, 0, 2, 9, 1, MAT_RUST);
  // Arm sticking out.
  fillBox(volume, dims, 4, 9, 1, 5, 11, 6, MAT_IRON);
  fillBox(volume, dims, 4, 7, 1, 5, 9, 3, MAT_IRON);
  // Cup bowl.
  fillBox(volume, dims, 3, 9, 5, 6, 10, 8, MAT_IRON);
  fillBox(volume, dims, 3, 10, 5, 3, 13, 8, MAT_IRON);
  fillBox(volume, dims, 6, 10, 5, 6, 13, 8, MAT_IRON);
  fillBox(volume, dims, 3, 10, 5, 6, 13, 5, MAT_IRON);
  fillBox(volume, dims, 3, 10, 8, 6, 13, 8, MAT_IRON);
  fillBox(volume, dims, 3, 13, 5, 6, 13, 8, MAT_BRASS);
  if (capped) fillBox(volume, dims, 3, 13, 5, 6, 15, 8, MAT_IRON);
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
    mesh.name = `bracket-${id}`;
    group.add(mesh);
  }
  return group;
}

export function flameOnBracket(spec: SconceSpec): boolean {
  return sconceIsLit(spec);
}
