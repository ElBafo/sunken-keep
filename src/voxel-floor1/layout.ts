import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import floor1FloorCeilJson from '../../levels/floor1_floorceil.json';
import type { FaceId } from '../voxel-lab/faces';
import { CEILING_VARIANTS, FLOOR_VARIANTS, RUBBLE_UV_SCALE } from './constants';
import { KNOT_FACE_NEIGHBORS, knotBatchKey, knotWallFile } from './knot-walls';
import { pickVariant } from './variants';
import { faceUOffset, lookForWall, lookForZoneBase, type WallLook } from './wall-look';

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
  /** Classic walk-onto bark id (`public/levels/floor1.ts`). */
  bark?: string;
  /** Classic floor loot — same cell as `public/levels/floor1.ts`. */
  item?: string;
  journalPage?: number;
  chest?: boolean;
  chestItems?: string[];
  chestOpen?: boolean;
  /** Classic stairs tile. Floor 1 only has `down` at the coming-soon square. */
  stairs?: 'up' | 'down';
  /** Classic `ui_text` path shown every time the party steps onto the tile. */
  stepUi?: string;
};

export type FloorMap = {
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: FloorTile[][];
};

/**
 * Voxel-only: Classic still stores a door *cell*. Floor 1 has no door cell —
 * each door is one wall edge between two adjacent room cells. The former door
 * tile becomes a floor cell of the host room; the opening sits on that edge.
 *
 * Host picks keep both rooms' shapes:
 * - (4,2) antechamber, W edge toward water_hall (3,2)
 * - (14,2) guard_hall, E edge toward slime_trail (15,2)
 * - (6,8) cellar, N edge toward pantry (6,7)
 * - (19,5) lair, N edge toward the lair neck (19,4)
 */
export type DoorEdge = {
  x: number;
  y: number;
  face: 'N' | 'E' | 'S' | 'W';
  otherX: number;
  otherY: number;
  otherFace: 'N' | 'E' | 'S' | 'W';
  locked: boolean;
  hostZone: string;
  otherZone: string;
};

export const FLOOR1_DOOR_EDGES: readonly DoorEdge[] = [
  { x: 4, y: 2, face: 'W', otherX: 3, otherY: 2, otherFace: 'E', locked: true, hostZone: 'antechamber', otherZone: 'water_hall' },
  { x: 14, y: 2, face: 'E', otherX: 15, otherY: 2, otherFace: 'W', locked: false, hostZone: 'guard_hall', otherZone: 'slime_trail' },
  { x: 6, y: 8, face: 'N', otherX: 6, otherY: 7, otherFace: 'S', locked: false, hostZone: 'cellar', otherZone: 'pantry' },
  { x: 19, y: 5, face: 'N', otherX: 19, otherY: 4, otherFace: 'S', locked: false, hostZone: 'lair', otherZone: 'lair' }
];

const DOOR_EDGE_BY_HOST = new Map(FLOOR1_DOOR_EDGES.map((e) => [`${e.x},${e.y}`, e]));

function copyTiles(): FloorTile[][] {
  const tiles = rawFloor1.tiles.map((row) => row.map((tile) => ({ ...(tile as FloorTile) })));
  for (const edge of FLOOR1_DOOR_EDGES) {
    const tile = tiles[edge.y][edge.x];
    const locked = !!tile.doorLocked || edge.locked;
    delete tile.door;
    tile.doorOpen = false;
    tile.doorLocked = locked;
  }
  return tiles;
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

/** Shallow or deep pool — the painted floor_water bed sits on these cells. */
export function isWaterTile(tile: FloorTile | undefined): boolean {
  return !!(tile?.shallowWater || tile?.deepWater);
}

export function isWaterCell(map: FloorMap, x: number, y: number): boolean {
  return isWaterTile(tileAt(map, x, y));
}

/** True stone — door/secret openings are overlays, not baked wall faces. */
export function isTrueWall(tile: FloorTile | undefined): boolean {
  return !tile || !!tile.wall;
}

export function isSolidTile(tile: FloorTile | undefined): boolean {
  if (!tile) return true;
  if (tile.wall) return true;
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

/** Cave-in rubble: the trigger cell becomes a blocking wall after the crash. */
export function setRubbleWall(map: FloorMap, x: number, y: number, on: boolean): void {
  const tile = tileAt(map, x, y);
  if (!tile) return;
  tile.wall = on;
}

export function rubbleBlocking(map: FloorMap, x: number, y: number): boolean {
  return !!tileAt(map, x, y)?.wall;
}

export function doorEdgeAt(x: number, y: number): DoorEdge | undefined {
  return DOOR_EDGE_BY_HOST.get(`${x},${y}`);
}

export function doorBetween(x0: number, y0: number, x1: number, y1: number): DoorEdge | undefined {
  for (const edge of FLOOR1_DOOR_EDGES) {
    const hostToOther = edge.x === x0 && edge.y === y0 && edge.otherX === x1 && edge.otherY === y1;
    const otherToHost = edge.x === x1 && edge.y === y1 && edge.otherX === x0 && edge.otherY === y0;
    if (hostToOther || otherToHost) return edge;
  }
  return undefined;
}

export function cellHasDoorEdge(x: number, y: number): boolean {
  return FLOOR1_DOOR_EDGES.some(
    (edge) => (edge.x === x && edge.y === y) || (edge.otherX === x && edge.otherY === y)
  );
}

export function doorIsOpen(map: FloorMap, edge: DoorEdge): boolean {
  return !!tileAt(map, edge.x, edge.y)?.doorOpen;
}

/** Closed door on the shared edge blocks crossing. Cells themselves stay walkable. */
export function canCross(map: FloorMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const edge = doorBetween(x0, y0, x1, y1);
  if (edge && !doorIsOpen(map, edge)) return false;
  return canStep(map, x1, y1);
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

export type DoorSpec = DoorEdge;
export type SecretSpec = { x: number; y: number };

export function listDoors(map: FloorMap = floor1Map): DoorSpec[] {
  return FLOOR1_DOOR_EDGES.map((edge) => ({
    ...edge,
    locked: !!tileAt(map, edge.x, edge.y)?.doorLocked
  }));
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

export type OpeningView = {
  tx: number;
  tz: number;
  face: FaceId;
  wallX: number;
  wallY: number;
  wallFace: 'N' | 'E' | 'S' | 'W';
};

/** Both room faces of a door edge. Each side uses its own room stone. */
export function doorOpeningViews(edge: DoorEdge): OpeningView[] {
  return [
    {
      tx: edge.x,
      tz: edge.y,
      face: edge.face,
      wallX: edge.otherX,
      wallY: edge.otherY,
      wallFace: edge.otherFace
    },
    {
      tx: edge.otherX,
      tz: edge.otherY,
      face: edge.otherFace,
      wallX: edge.x,
      wallY: edge.y,
      wallFace: edge.face
    }
  ];
}

/** Neighbours that look into a secret cell, or both sides of a door edge. */
export function openingViews(map: FloorMap, x: number, y: number): OpeningView[] {
  const edge = doorEdgeAt(x, y);
  if (edge) return doorOpeningViews(edge);
  const views: OpeningView[] = [];
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
  for (const edge of FLOOR1_DOOR_EDGES) {
    const tile = tileAt(map, edge.x, edge.y);
    if (!tile) continue;
    tile.doorOpen = false;
    tile.doorLocked = edge.locked;
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].secret) map.tiles[y][x].secretOpen = false;
    }
  }
}

/** Restore Classic floor-1 items and chests after a test mutates the shared map. */
export function resetFloor1Loot(map: FloorMap = floor1Map): void {
  for (let y = 0; y < rawFloor1.height; y++) {
    for (let x = 0; x < rawFloor1.width; x++) {
      const src = rawFloor1.tiles[y][x] as FloorTile;
      const tile = map.tiles[y][x];
      tile.item = src.item;
      tile.journalPage = src.journalPage;
      tile.chest = src.chest;
      tile.chestItems = src.chestItems ? [...src.chestItems] : undefined;
      tile.chestOpen = src.chestOpen;
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
      if (!map.tiles[z][x].stairs) {
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
      }
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
        const look = lookForWall(wx, wz, spec.wallFace) ?? lookForZoneBase(x, z);
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
