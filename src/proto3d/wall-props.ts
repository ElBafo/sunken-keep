import {
  CAMERA_NEAR,
  CELL_SIZE,
  DIR_DELTA,
  FACE_INTO_ROOM,
  SCONCE_WALL_OFFSET_TILES
} from './constants';
import type { Tile } from './types';

export type PropWall = 'N' | 'E' | 'S' | 'W';

export const PROP_WALL_DIR: Record<PropWall, number> = { N: 0, E: 1, S: 2, W: 3 };

export const OPPOSITE_WALL: Record<PropWall, PropWall> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** Sprite-sized wall hangings; never a full-wall quad (that reads as a giant mid-air sprite). */
export const WALL_PROP_WORLD_HEIGHT = 0.24 * CELL_SIZE;

export function isWallFace(value: unknown): value is PropWall {
  return value === 'N' || value === 'E' || value === 'S' || value === 'W';
}

/** Wall-mounted: hangs on propWall, does not fill the square. */
export function isWallProp(tile: Tile | undefined): boolean {
  return !!tile?.prop && tile.propPlacement === 'wall';
}

/** Floor furniture still occupies the square. Missing placement counts as floor. */
export function isBlockingProp(tile: Tile | undefined): boolean {
  return !!tile?.prop && tile.propPlacement !== 'wall';
}

export function tileBlocksPath(tile: Tile | undefined): boolean {
  if (!tile || tile.wall) return true;
  if (tile.secret && !tile.secretOpen) return true;
  if (tile.door && !tile.doorOpen) return true;
  return isBlockingProp(tile);
}

export function canInteractProp(
  playerX: number,
  playerY: number,
  dir: number,
  propX: number,
  propY: number,
  tile: Tile
): boolean {
  if (!tile.prop) return false;
  const facing = DIR_DELTA[dir & 3];
  if (playerX + facing[0] === propX && playerY + facing[1] === propY) return true;
  if (!isWallProp(tile) || !isWallFace(tile.propWall)) return false;
  return playerX === propX && playerY === propY && (dir & 3) === PROP_WALL_DIR[tile.propWall];
}

export function interactPropAt(
  tiles: Tile[][],
  width: number,
  height: number,
  playerX: number,
  playerY: number,
  dir: number
): { x: number; y: number; tile: Tile } | null {
  const here = inBounds(playerX, playerY, width, height) ? tiles[playerY][playerX] : undefined;
  if (here && isWallProp(here) && canInteractProp(playerX, playerY, dir, playerX, playerY, here)) {
    return { x: playerX, y: playerY, tile: here };
  }
  const [dx, dy] = DIR_DELTA[dir & 3];
  const fx = playerX + dx;
  const fy = playerY + dy;
  const facing = inBounds(fx, fy, width, height) ? tiles[fy][fx] : undefined;
  if (facing && canInteractProp(playerX, playerY, dir, fx, fy, facing)) {
    return { x: fx, y: fy, tile: facing };
  }
  if (here && canInteractProp(playerX, playerY, dir, playerX, playerY, here)) {
    return { x: playerX, y: playerY, tile: here };
  }
  return null;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** True when the party stands on the prop square and faces its wall. */
export function wallPropShowsFlat(
  playerX: number,
  playerY: number,
  dir: number,
  propX: number,
  propY: number,
  face: PropWall
): boolean {
  return playerX === propX && playerY === propY && (dir & 3) === PROP_WALL_DIR[face];
}

/**
 * Hide wall props in the party's own square unless they are on the facing wall.
 * Adjacent squares keep the hanging so it stays on its wall face at normal size.
 */
export function wallPropVisible(
  playerX: number,
  playerY: number,
  dir: number,
  propX: number,
  propY: number,
  face: PropWall
): boolean {
  if (playerX !== propX || playerY !== propY) return true;
  return wallPropShowsFlat(playerX, playerY, dir, propX, propY, face);
}

/** Keep the mesh in front of the camera near plane when the eye sits on this square. */
export function wallPropInset(): number {
  return Math.max(SCONCE_WALL_OFFSET_TILES * CELL_SIZE, CAMERA_NEAR);
}

/**
 * Flat on the named wall of that floor square, sprite-sized, hung at mid-wall.
 * Inset by at least the camera near plane so a pulled-back eye never sits inside it.
 */
export function wallPropPlanePose(
  gridX: number,
  gridY: number,
  face: PropWall,
  texW: number,
  texH: number,
  worldHeight = WALL_PROP_WORLD_HEIGHT
): { x: number; y: number; z: number; rotY: number; scaleX: number; scaleY: number } {
  const outward = FACE_INTO_ROOM[face];
  const inward = FACE_INTO_ROOM[OPPOSITE_WALL[face]];
  const inset = wallPropInset();
  const scaleY = worldHeight;
  const aspect = texW > 0 && texH > 0 ? texW / texH : 1;
  const scaleX = scaleY * aspect;
  return {
    x: gridX * CELL_SIZE + outward.nx * (CELL_SIZE / 2 - inset),
    y: CELL_SIZE / 2,
    z: gridY * CELL_SIZE + outward.nz * (CELL_SIZE / 2 - inset),
    rotY: inward.rotY,
    scaleX,
    scaleY
  };
}
