/**
 * EOB camera sits on the back wall of the current cell (backOffsetTiles = 0.5).
 * That puts a DoubleSide wall quad on the near plane, so backing or turning
 * onto that face flashes a close brick slab for the last ~50ms of the tween.
 * Nudge the eye into the room by near+margin for every posed camera sample.
 */
import { CAMERA_NEAR, CELL_SIZE, cameraOffsetXZ } from './constants';
import { FloorData, Tile } from './types';

/** Keep the eye this far from any wall plane so the near clip cannot eat the quad. */
export const WALL_EYE_MARGIN = CAMERA_NEAR + 0.05;
/** Push a hair past the margin so float error cannot sit inside the clip test. */
const WALL_EYE_SNAP = 1e-4;

export interface WallPlane {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

function occludesWallFace(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return !!tile.wall || (!!tile.secret && !tile.secretOpen);
}

/** Same faces scene-builder emits, as one-cell slabs with a room-facing normal. */
export function emitWallPlanes(floor: FloorData): WallPlane[] {
  const planes: WallPlane[] = [];
  const { tiles, width, height } = floor;
  const faces = [
    { dx: 0, dz: -1, nx: 0, nz: -1 },
    { dx: 1, dz: 0, nx: 1, nz: 0 },
    { dx: 0, dz: 1, nx: 0, nz: 1 },
    { dx: -1, dz: 0, nx: -1, nz: 0 }
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile.wall && !tile.door && !tile.secret) continue;
      for (const f of faces) {
        const nx = x + f.dx;
        const nz = y + f.dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const neighbor = tiles[nz][nx];
        if (occludesWallFace(neighbor) && !tile.door) continue;
        if (tile.door && (neighbor.wall || neighbor.door || neighbor.secret)) continue;
        planes.push({
          x: x * CELL_SIZE + f.dx * (CELL_SIZE / 2),
          z: y * CELL_SIZE + f.dz * (CELL_SIZE / 2),
          nx: f.nx,
          nz: f.nz
        });
      }
    }
  }
  return planes;
}

function coversCell(px: number, pz: number, plane: WallPlane): boolean {
  const alongX = Math.abs(plane.nx) < 0.5;
  const pad = CELL_SIZE / 2 + 0.04;
  if (alongX) return Math.abs(px - plane.x) <= pad;
  return Math.abs(pz - plane.z) <= pad;
}

/** Signed distance along the room-facing normal (positive = in the room). */
export function wallPlaneDistance(px: number, pz: number, plane: WallPlane): number {
  return (px - plane.x) * plane.nx + (pz - plane.z) * plane.nz;
}

export function minWallClearance(px: number, pz: number, planes: WallPlane[]): number {
  let min = Infinity;
  for (const plane of planes) {
    if (!coversCell(px, pz, plane)) continue;
    const d = wallPlaneDistance(px, pz, plane);
    if (d < -0.05) continue;
    if (d < min) min = d;
  }
  return min;
}

/** True when a wall quad sits in the near-clip band in front of the eye. */
export function isNearWallClip(
  px: number,
  pz: number,
  planes: WallPlane[],
  margin = WALL_EYE_MARGIN
): boolean {
  for (const plane of planes) {
    if (!coversCell(px, pz, plane)) continue;
    const d = wallPlaneDistance(px, pz, plane);
    if (d > -0.02 && d < margin - WALL_EYE_SNAP * 0.5) return true;
  }
  return false;
}

/** Push the eye into the room so it never sits closer than margin to a wall face. */
export function clearCameraFromWalls(
  px: number,
  pz: number,
  planes: WallPlane[],
  margin = WALL_EYE_MARGIN
): { x: number; z: number } {
  let x = px;
  let z = pz;
  for (let pass = 0; pass < 6; pass++) {
    let pushed = false;
    for (const plane of planes) {
      if (!coversCell(x, z, plane)) continue;
      const dist = wallPlaneDistance(x, z, plane);
      // Only the room side of this face. Large negative dist is some other corridor.
      if (dist > -0.02 && dist < margin) {
        const extra = margin + WALL_EYE_SNAP - dist;
        x += plane.nx * extra;
        z += plane.nz * extra;
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return { x, z };
}

export function cameraWorldXZ(
  gridX: number,
  gridY: number,
  rotY: number,
  planes: WallPlane[],
  margin = WALL_EYE_MARGIN
): { x: number; z: number } {
  const [ox, oz] = cameraOffsetXZ(rotY);
  return clearCameraFromWalls(gridX * CELL_SIZE + ox, gridY * CELL_SIZE + oz, planes, margin);
}
