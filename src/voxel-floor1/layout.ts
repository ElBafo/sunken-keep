import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import floor1FloorCeilJson from '../../levels/floor1_floorceil.json';
import type { FaceId } from '../voxel-lab/faces';
import { CEILING_VARIANTS, FLOOR_VARIANTS, RUBBLE_UV_SCALE } from './constants';
import { KNOT_FACE_NEIGHBORS, knotBatchKey, knotWallFile } from './knot-walls';
import { pickVariant } from './variants';
import { faceUOffset, familyBaseLook, lookForWall, lookForZoneBase, type WallLook } from './wall-look';

type FloorCeilSquare = { x: number; y: number; floor: string; ceiling: string; ceilingRot?: number };

function texName(stem: string): string {
  return stem.endsWith('.png') ? stem : `${stem}.png`;
}

const FLOOR_CEIL = new Map<string, { floor: string; ceiling: string; ceilingRot: 0 | 90 }>();
for (const sq of (floor1FloorCeilJson as { squares: FloorCeilSquare[] }).squares) {
  FLOOR_CEIL.set(`${sq.x},${sq.y}`, {
    floor: texName(sq.floor),
    ceiling: texName(sq.ceiling),
    ceilingRot: sq.ceilingRot === 90 ? 90 : 0
  });
}

export function mappedFloorFile(x: number, y: number): string | undefined {
  return FLOOR_CEIL.get(`${x},${y}`)?.floor;
}

export function mappedCeilingFile(x: number, y: number): string | undefined {
  return FLOOR_CEIL.get(`${x},${y}`)?.ceiling;
}

/** Zone-wide 90° turn when plank boards must cross east–west beams. */
export function mappedCeilingUvRot(x: number, y: number): 0 | 90 {
  return FLOOR_CEIL.get(`${x},${y}`)?.ceilingRot ?? 0;
}

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
  face: 'N' | 'E' | 'S' | 'W';
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
  /** Material batch key — derived wall looks share one mesh. */
  batch: string;
  kind: 'wall' | 'floor' | 'ceiling';
  wallX: number;
  wallY: number;
  wallFace: string;
  bulge: number;
  look?: WallLook;
  /** Carved knot stamped on this face; surround is the room look. */
  knot?: boolean;
  /** World-tile U run so neighbouring wall faces continue. */
  uOffset: number;
  /** Ceiling only: 90 would turn plank boards onto Z. Unused while beams run N–S. */
  uvRot: 0 | 90;
  /** Repeats per cell. Rubble is 2 so the cobbles read half-size. */
  uvScale: number;
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
): Array<{
  tx: number;
  tz: number;
  face: FaceId;
  wallX: number;
  wallY: number;
  wallFace: 'N' | 'E' | 'S' | 'W';
}> {
  const views: Array<{
    tx: number;
    tz: number;
    face: FaceId;
    wallX: number;
    wallY: number;
    wallFace: 'N' | 'E' | 'S' | 'W';
  }> = [];
  for (const spec of OPEN_TO_WALL) {
    const tx = x + spec.dx;
    const tz = y + spec.dz;
    const neighbor = tileAt(map, tx, tz);
    if (!neighbor || neighbor.wall) continue;
    views.push({
      tx,
      tz,
      face: spec.wallFace,
      wallX: x,
      wallY: y,
      wallFace: spec.face
    });
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
      const floorFile = mappedFloorFile(x, z) ?? pickVariant(FLOOR_VARIANTS, x, z, 'F');
      jobs.push({
        face: 'floor',
        tx: x,
        tz: z,
        file: floorFile,
        batch: floorFile,
        kind: 'floor',
        wallX: x,
        wallY: z,
        wallFace: 'F',
        bulge: 0,
        uOffset: 0,
        uvRot: 0,
        uvScale: 1
      });
      const ceilFile = mappedCeilingFile(x, z) ?? pickVariant(CEILING_VARIANTS, x, z, 'C');
      jobs.push({
        face: 'ceiling',
        tx: x,
        tz: z,
        file: ceilFile,
        batch: ceilFile,
        kind: 'ceiling',
        wallX: x,
        wallY: z,
        wallFace: 'C',
        bulge: 0,
        uOffset: 0,
        uvRot: mappedCeilingUvRot(x, z),
        uvScale: ceilFile.startsWith('ceiling_rubble_') ? RUBBLE_UV_SCALE : 1
      });
      for (const spec of OPEN_TO_WALL) {
        const wx = x + spec.dx;
        const wz = z + spec.dz;
        if (!isTrueWall(tileAt(map, wx, wz))) continue;
        const knot = !!knotWallFile(wx, wz, spec.wallFace);
        const tile = map.tiles[z][x];
        let look = lookForWall(wx, wz, spec.wallFace) ?? lookForZoneBase(x, z);
        if (!knot && tile.door && look) {
          look = familyBaseLook(look.kind, look.zone, look.seepage);
        }
        const file = look?.file ?? lookForZoneBase(x, z).file;
        jobs.push({
          face: spec.face,
          tx: x,
          tz: z,
          file,
          batch: knot ? knotBatchKey(look, wx, wz, spec.wallFace) : look?.key ?? file,
          kind: 'wall',
          wallX: wx,
          wallY: wz,
          wallFace: spec.wallFace,
          bulge: look?.bulge ?? 0,
          look,
          knot,
          // Unique knot composites are a full 0–1 face. A running U plus
          // ClampToEdge smears one texel column into horizontal streaks.
          uOffset: knot ? 0 : faceUOffset(spec.face, x, z),
          uvRot: 0,
          uvScale: 1
        });
      }
    }
  }
  return jobs;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function knotBesideSecret(map: FloorMap, x: number, y: number): boolean {
  if (tileAt(map, x, y)?.secret) return true;
  for (const [dx, dy] of KNOT_FACE_NEIGHBORS) {
    if (tileAt(map, x + dx, y + dy)?.secret) return true;
  }
  return false;
}
