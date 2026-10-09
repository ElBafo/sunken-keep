import { SCONCE_RADIUS_TILES, wallPropRoom } from './constants';
import { FloorData, Sconce, Tile } from './types';

const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export type LightReach = Map<string, number>;

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function isSolidWall(tile: Tile | undefined): boolean {
  if (!tile) return true;
  if (tile.wall) return true;
  if (tile.secret && !tile.secretOpen) return true;
  return false;
}

/** Open floors, water, items, monsters, and open doors. Closed doors block. */
export function isLightPassable(tile: Tile | undefined): boolean {
  if (!tile || isSolidWall(tile)) return false;
  if (tile.door && !tile.doorOpen) return false;
  return true;
}

export function floodLight(
  floor: FloorData,
  originX: number,
  originY: number,
  radius: number
): LightReach {
  const reach: LightReach = new Map();
  const { tiles, width, height } = floor;
  if (originX < 0 || originY < 0 || originX >= width || originY >= height) return reach;

  const queue: Array<[number, number]> = [[originX, originY]];
  reach.set(tileKey(originX, originY), 0);

  if (!isLightPassable(tiles[originY][originX])) return reach;

  let q = 0;
  while (q < queue.length) {
    const [x, y] = queue[q++];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = tileKey(nx, ny);
      if (reach.has(key)) continue;
      if (!isLightPassable(tiles[ny][nx])) continue;
      const dist = Math.hypot(nx - originX, ny - originY);
      if (dist > radius) continue;
      reach.set(key, dist);
      queue.push([nx, ny]);
    }
  }
  return reach;
}

export function sconceOrigin(sconce: Sconce): { x: number; y: number } {
  return wallPropRoom(sconce.x, sconce.y, sconce.face);
}

export function partyReach(floor: FloorData, x: number, y: number, radius: number): LightReach {
  return floodLight(floor, x, y, radius);
}

export function sconceReach(floor: FloorData, sconce: Sconce): LightReach {
  const { x, y } = sconceOrigin(sconce);
  return floodLight(floor, x, y, SCONCE_RADIUS_TILES);
}

export function reachAt(reach: LightReach, x: number, y: number): number | undefined {
  return reach.get(tileKey(x, y));
}
