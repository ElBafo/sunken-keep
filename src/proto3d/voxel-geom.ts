import * as THREE from 'three';
import { packPbrRgba, volumeFromImageData } from '../voxel-lab/classify';
import { FACE_INSET } from '../voxel-lab/constants';
import { greedyMesh, type MeshArrays } from '../voxel-lab/mesher';
import { CELL_SIZE, WALL_BOTTOM, WALL_TOP } from './constants';
import { flipUVsX, rotateUVs } from './texture-variants';

/** Game-local occupancy (lab DEPTH_LAYERS/LAYER_SIZE stay on the lab page). */
export const GAME_DEPTH_LAYERS = 3;
export const GAME_LAYER_SIZE = 0.01;
/** Cap greedy resolution so a wall is tens of thousands of tris, not hundreds of thousands. */
export const VOXEL_MAX_AXIS = 32;

/** Keep relief inside the solid: front of the volume sits this far behind the original plane. */
export const VOXEL_PLANE_INSET = 0.0006;
export const MAX_RELIEF = GAME_DEPTH_LAYERS * GAME_LAYER_SIZE + VOXEL_PLANE_INSET + FACE_INSET;

export type VoxelKind = 'wall' | 'floor' | 'ceiling';

/**
 * Local +Z of a game wall plane is not the same on every face (DoubleSide quads).
 * N/S: +Z goes into the wall cell. E/W: +Z goes into the walkable square.
 * Floors/ceilings: local +Z points into the room, so relief is −Z.
 */
export function voxelInwardSign(kind: VoxelKind, face?: string): number {
  if (kind !== 'wall') return -1;
  if (face === 'E' || face === 'W') return -1;
  return 1;
}

export function voxelLocalPos(
  u: number,
  v: number,
  d: number,
  W: number,
  H: number,
  width: number,
  height: number,
  inwardSign: number
): [number, number, number] {
  return [
    -width / 2 + u * (width / W),
    -height / 2 + v * (height / H),
    inwardSign * (d * GAME_LAYER_SIZE + VOXEL_PLANE_INSET)
  ];
}

/** True when every vertex stays on the solid side of the original plane, inside one cell. */
export function reliefStaysInSolid(
  positions: number[],
  inwardSign: number,
  cellSize = CELL_SIZE
): boolean {
  const cap = cellSize / 2 - 1e-4;
  const heightHalf = (WALL_TOP - WALL_BOTTOM) / 2;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (Math.abs(x) > cap + FACE_INSET + 1e-4) return false;
    if (Math.abs(y) > heightHalf + FACE_INSET + 1e-4) return false;
    if (inwardSign > 0) {
      if (z < -1e-5 || z > cap) return false;
    } else if (z > 1e-5 || z < -cap) {
      return false;
    }
  }
  return true;
}

function imageDataFromMap(map: THREE.Texture): ImageData | null {
  const img = map.image as { width?: number; height?: number } | undefined;
  if (!img || !img.width || !img.height) return null;
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

function geometryFrom(mesh: MeshArrays): THREE.BufferGeometry | null {
  if (mesh.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  g.setIndex(mesh.indices);
  g.computeBoundingSphere();
  return g;
}

function remapWallUvs(geo: THREE.BufferGeometry, midY: number): void {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setX(i, (x + CELL_SIZE / 2) / CELL_SIZE);
    const worldY = midY + y;
    uv.setY(i, Math.min(1, Math.max(0, worldY / CELL_SIZE)));
  }
  uv.needsUpdate = true;
}

export interface CachedVoxelGeom {
  geometry: THREE.BufferGeometry;
  triangles: number;
}

export function downsampleImageData(
  image: { width: number; height: number; data: ArrayLike<number> },
  maxAxis = VOXEL_MAX_AXIS
): { width: number; height: number; data: Uint8ClampedArray } {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxAxis));
  const w = Math.max(1, Math.ceil(image.width / scale));
  const h = Math.max(1, Math.ceil(image.height / scale));
  const data = new Uint8ClampedArray(w * h * 4);
  const ox = scale > 1 ? (scale - 1) >> 1 : 0;
  const oy = ox;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, x * scale + ox);
      const sy = Math.min(image.height - 1, y * scale + oy);
      const si = (sy * image.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = image.data[si];
      data[di + 1] = image.data[si + 1];
      data[di + 2] = image.data[si + 2];
      data[di + 3] = image.data[si + 3];
    }
  }
  return { width: w, height: h, data };
}

export function collapseDepth(
  volume: Uint8Array,
  dims: [number, number, number],
  newD: number
): { volume: Uint8Array; dims: [number, number, number] } {
  const [W, H, D] = dims;
  if (newD >= D) return { volume, dims };
  const out = new Uint8Array(W * H * newD);
  for (let d = 0; d < D; d++) {
    const nd = Math.min(newD - 1, Math.floor((d * newD) / D));
    for (let i = 0; i < W * H; i++) {
      if (volume[i + d * W * H]) out[i + nd * W * H] = 1;
    }
  }
  return { volume: out, dims: [W, H, newD] };
}

/** Keep mortar 1-deep and stone 2–N deep so greedy meshing still has brick relief. */
export function remapColumnDepth(
  volume: Uint8Array,
  dims: [number, number, number],
  newD: number
): { volume: Uint8Array; dims: [number, number, number] } {
  const [W, H, D] = dims;
  if (newD === D) return { volume, dims };
  const out = new Uint8Array(W * H * newD);
  for (let i = 0; i < W * H; i++) {
    let steps = 0;
    for (let d = 0; d < D; d++) {
      if (volume[i + d * W * H]) steps += 1;
    }
    if (steps === 0) continue;
    const keep = steps <= 1 ? 1 : Math.min(newD, Math.max(2, Math.round((steps * newD) / D)));
    for (let d = 0; d < keep; d++) out[i + d * W * H] = 1;
  }
  return { volume: out, dims: [W, H, newD] };
}

const geomCache = new Map<string, CachedVoxelGeom>();
const pbrCache = new Map<string, THREE.DataTexture>();

export function pbrTextureForRoughness(roughness: Uint8Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(packPbrRgba(roughness), w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function buildVolumeForKind(
  src: ReturnType<typeof volumeFromImageData>,
  kind: VoxelKind
): { volume: Uint8Array; dims: [number, number, number] } {
  const [W, H, D] = src.dims;
  if (kind !== 'wall') return { volume: src.volume, dims: src.dims };
  const height = WALL_TOP - WALL_BOTTOM;
  const Hvol = Math.max(H, Math.round((H * height) / CELL_SIZE));
  if (Hvol === H) return { volume: src.volume, dims: src.dims };
  const volume = new Uint8Array(W * Hvol * D);
  for (let v = 0; v < Hvol; v++) {
    const worldY = WALL_BOTTOM + ((v + 0.5) * height) / Hvol;
    const texV = Math.min(0.999, Math.max(0, worldY / CELL_SIZE));
    const srcV = Math.min(H - 1, Math.floor(texV * H));
    for (let u = 0; u < W; u++) {
      for (let d = 0; d < D; d++) {
        volume[u + v * W + d * W * Hvol] = src.volume[u + srcV * W + d * W * H];
      }
    }
  }
  return { volume, dims: [W, Hvol, D] };
}

export function voxelGeomKey(
  map: THREE.Texture,
  kind: VoxelKind,
  turns = 0,
  flip = false,
  inward = 1
): string {
  return `${map.uuid}:${kind}:${turns}:${flip ? 1 : 0}:${inward}`;
}

export function getPbrForTexture(map: THREE.Texture | null | undefined): THREE.DataTexture | null {
  if (!map) return null;
  const hit = pbrCache.get(map.uuid);
  if (hit) return hit;
  const image = imageDataFromMap(map);
  if (!image) return null;
  const src = volumeFromImageData(image);
  const pbr = pbrTextureForRoughness(src.roughness, src.dims[0], src.dims[1]);
  pbrCache.set(map.uuid, pbr);
  return pbr;
}

export function getVoxelGeometry(
  map: THREE.Texture,
  kind: VoxelKind,
  opts?: { turns?: number; flip?: boolean; face?: string }
): CachedVoxelGeom | null {
  const turns = opts?.turns ?? 0;
  const flip = opts?.flip ?? false;
  const inward = voxelInwardSign(kind, opts?.face);
  const key = voxelGeomKey(map, kind, turns, flip, inward);
  const hit = geomCache.get(key);
  if (hit) return hit;

  const image = imageDataFromMap(map);
  if (!image) return null;
  const src = volumeFromImageData(downsampleImageData(image));
  const remapped = remapColumnDepth(src.volume, src.dims, GAME_DEPTH_LAYERS);
  const built = buildVolumeForKind(
    { volume: remapped.volume, dims: remapped.dims, voxelCount: 0, roughness: src.roughness },
    kind
  );
  const [W, H] = built.dims;
  const width = CELL_SIZE;
  const height = kind === 'wall' ? WALL_TOP - WALL_BOTTOM : CELL_SIZE;
  const toWorld = (u: number, v: number, d: number) =>
    voxelLocalPos(u, v, d, W, H, width, height, inward);
  const meshed = greedyMesh(built.volume, built.dims, toWorld, {
    cullNeg: [true, true, false],
    cullPos: [true, true, true]
  });
  const geometry = geometryFrom(meshed.mesh);
  if (!geometry) return null;
  if (kind === 'wall') remapWallUvs(geometry, (WALL_TOP + WALL_BOTTOM) / 2);
  if (flip) flipUVsX(geometry);
  if (turns) rotateUVs(geometry, turns);

  const cached = { geometry, triangles: meshed.triangles };
  geomCache.set(key, cached);
  return cached;
}

export function disposeVoxelGeomCache(): void {
  for (const g of geomCache.values()) {
    g.geometry.dispose();
  }
  geomCache.clear();
  for (const t of pbrCache.values()) t.dispose();
  pbrCache.clear();
}

export function emptyRaycast(): void {
  // Visual-only: picking stays on the original wall plane.
}
