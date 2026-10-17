import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import type { FaceId } from '../voxel-lab/faces';
import { CEILING_VARIANTS, FLOOR_VARIANTS, WALL_VARIANTS } from './constants';
import { pickVariant } from './variants';

export type FloorTile = {
  wall?: boolean;
  door?: boolean;
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

/** Game New Game map. Closed doors and secret walls are solid (plain walls). */
export const floor1Map: FloorMap = {
  width: rawFloor1.width,
  height: rawFloor1.height,
  startX: rawFloor1.startX,
  startY: rawFloor1.startY,
  startDir: rawFloor1.startDir,
  tiles: rawFloor1.tiles as FloorTile[][]
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

/** Walls, closed doors, and secret walls block. Props/monsters do not (not in this step). */
export function isSolidTile(tile: FloorTile | undefined): boolean {
  if (!tile) return true;
  return !!tile.wall || !!tile.door || !!tile.secret;
}

export function isWalkableTile(tile: FloorTile | undefined): boolean {
  return !!tile && !isSolidTile(tile);
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

/**
 * Walkable cells emit floor, ceiling, and a wall face toward each solid neighbour.
 * Variant hash uses the wall cell + the game face id so painted stone matches Classic.
 */
export function enumerateFaces(map: FloorMap): FaceJob[] {
  const jobs: FaceJob[] = [];
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkableTile(map.tiles[z][x])) continue;
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
        if (!isSolidTile(tileAt(map, wx, wz))) continue;
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
