import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import type { FaceId } from '../voxel-lab/faces';
import { CEILING_VARIANTS, FLOOR_VARIANTS, WALL_VARIANTS } from './constants';
import { pickVariant } from './variants';

export type FloorTile = {
  wall?: boolean;
  door?: boolean;
  doorOpen?: boolean;
  doorLocked?: boolean;
  secret?: boolean;
  secretOpen?: boolean;
  shallowWater?: boolean;
  deepWater?: boolean;
};

export type FloorMap = {
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: FloorTile[][];
};

function copyTiles(): FloorTile[][] {
  return rawFloor1.tiles.map((row) => row.map((tile) => ({ ...(tile as FloorTile) })));
}

/** Game New Game map. Closed doors and secret walls block stepping. */
export const floor1Map: FloorMap = {
  width: rawFloor1.width,
  height: rawFloor1.height,
  startX: rawFloor1.startX,
  startY: rawFloor1.startY,
  startDir: rawFloor1.startDir,
  tiles: copyTiles()
};

const OPEN_TO_WALL: ReadonlyArray<{
  dx: number;
  dz: number;
  face: FaceId;
  wallFace: 'N' | 'E' | 'S' | 'W';
}> = [
  { dx: 0, dz: -1, face: 'N', wallFace: 'S' },
  { dx: 1, dz: 0, face: 'E', wallFace: 'W' },
  { dx: 0, dz: 1, face: 'S', wallFace: 'N' },
  { dx: -1, dz: 0, face: 'W', wallFace: 'E' }
];

export function tileAt(map: FloorMap, x: number, y: number): FloorTile | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.tiles[y][x];
}

/** True stone — door/secret openings are overlays, not baked wall faces. */
export function isTrueWall(tile: FloorTile | undefined): boolean {
  return !tile || !!tile.wall;
}

export function isSolidTile(tile: FloorTile | undefined): boolean {
  if (!tile) return true;
  if (tile.wall) return true;
  if (tile.door && !tile.doorOpen) return true;
  if (tile.secret && !tile.secretOpen) return true;
  return false;
}

export function isWalkableTile(tile: FloorTile | undefined): boolean {
  return !!tile && !isSolidTile(tile);
}

/** Floor/ceiling shells: walkable cells plus door and secret tiles. */
export function isShellTile(tile: FloorTile | undefined): boolean {
  return !!tile && !tile.wall;
}

export function canStep(map: FloorMap, x: number, y: number): boolean {
  return isWalkableTile(tileAt(map, x, y));
}

export type FaceJob = {
  face: FaceId;
  tx: number;
  tz: number;
  file: string;
  kind: 'wall' | 'floor' | 'ceiling';
  wallX: number;
  wallY: number;
  wallFace: string;
};

export type DoorSpec = { x: number; y: number; locked: boolean };
export type SecretSpec = { x: number; y: number };

export function listDoors(map: FloorMap = floor1Map): DoorSpec[] {
  const out: DoorSpec[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      if (tile.door) out.push({ x, y, locked: !!tile.doorLocked });
    }
  }
  return out;
}

export function listSecrets(map: FloorMap = floor1Map): SecretSpec[] {
  const out: SecretSpec[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].secret) out.push({ x, y });
    }
  }
  return out;
}

/** Neighbours that look into a door/secret cell (the overlay faces). */
export function openingViews(
  map: FloorMap,
  x: number,
  y: number
): Array<{ tx: number; tz: number; face: FaceId }> {
  const views: Array<{ tx: number; tz: number; face: FaceId }> = [];
  for (const spec of OPEN_TO_WALL) {
    const tx = x + spec.dx;
    const tz = y + spec.dz;
    const neighbor = tileAt(map, tx, tz);
    if (!neighbor || neighbor.wall) continue;
    views.push({ tx, tz, face: spec.wallFace });
  }
  return views;
}

export function resetFloor1Doors(map: FloorMap = floor1Map): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      const src = rawFloor1.tiles[y][x] as FloorTile;
      if (tile.door) {
        tile.doorOpen = false;
        tile.doorLocked = !!src.doorLocked;
      }
      if (tile.secret) tile.secretOpen = false;
    }
  }
}

/**
 * Walkable cells, doors, and secrets emit floor/ceiling. Stone walls still
 * come from true-wall neighbours only — door/secret faces are overlays so
 * opening them does not remesh the near-ring cache.
 */
export function enumerateFaces(map: FloorMap): FaceJob[] {
  const jobs: FaceJob[] = [];
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!isShellTile(map.tiles[z][x])) continue;
      jobs.push({
        face: 'floor',
        tx: x,
        tz: z,
        file: pickVariant(FLOOR_VARIANTS, x, z, 'F'),
        kind: 'floor',
        wallX: x,
        wallY: z,
        wallFace: 'F'
      });
      jobs.push({
        face: 'ceiling',
        tx: x,
        tz: z,
        file: pickVariant(CEILING_VARIANTS, x, z, 'C'),
        kind: 'ceiling',
        wallX: x,
        wallY: z,
        wallFace: 'C'
      });
      for (const spec of OPEN_TO_WALL) {
        const wx = x + spec.dx;
        const wz = z + spec.dz;
        if (!isTrueWall(tileAt(map, wx, wz))) continue;
        jobs.push({
          face: spec.face,
          tx: x,
          tz: z,
          file: pickVariant(WALL_VARIANTS, wx, wz, spec.wallFace),
          kind: 'wall',
          wallX: wx,
          wallY: wz,
          wallFace: spec.wallFace
        });
      }
    }
  }
  return jobs;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
