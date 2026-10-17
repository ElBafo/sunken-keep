import { isWaterTile } from '../constants';
import type { FloorData, Tile } from '../types';

export type WallFaceId = 'N' | 'E' | 'S' | 'W';
export type LabFaceId = WallFaceId | 'floor' | 'ceiling';

export type LabSurfaceKind =
  | 'wall'
  | 'secret'
  | 'secret-open'
  | 'floor'
  | 'ceiling'
  | 'water-shallow'
  | 'water-deep'
  | 'rubble';

const FACE_DELTA: Record<WallFaceId, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 }
};

/** True for cells that hide a neighbouring wall face. Doors and water are not solid. */
export function occludesWallFace(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return !!tile.wall || (!!tile.secret && !tile.secretOpen);
}

export function faceKey(cellX: number, cellY: number, face: LabFaceId): string {
  return `${cellX},${cellY},${face}`;
}

export interface LabMapFace {
  key: string;
  cellX: number;
  cellY: number;
  lightX: number;
  lightY: number;
  face: LabFaceId;
  kind: LabSurfaceKind;
  /** Voxel relief only for closed stone. Doors, open secrets, rubble, water stay painted. */
  voxelOk: boolean;
}

export interface OccupancyOpts {
  /** Cave-in rubble cells keep painted (no voxel relief). */
  rubble?: ReadonlySet<string>;
}

function cellToken(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Same face rules as SceneBuilder.buildWalls / buildFloorAndCeiling:
 * secret and door cells still get a floor/ceiling; doors themselves are omitted
 * (DoorSystem keeps the painted panels — height relief swaps those meshes in
 * LabWorld); carvings and open secrets stay painted (no voxel extrusion).
 */
export function enumerateLabFaces(floor: FloorData, opts: OccupancyOpts = {}): LabMapFace[] {
  const out: LabMapFace[] = [];
  const { tiles, width, height } = floor;
  const rubble = opts.rubble ?? new Set<string>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile.wall) {
        const water = isWaterTile(tile);
        const floorKind: LabSurfaceKind = water
          ? tile.deepWater
            ? 'water-deep'
            : 'water-shallow'
          : 'floor';
        out.push({
          key: faceKey(x, y, 'floor'),
          cellX: x,
          cellY: y,
          lightX: x,
          lightY: y,
          face: 'floor',
          kind: floorKind,
          voxelOk: !water
        });
        out.push({
          key: faceKey(x, y, 'ceiling'),
          cellX: x,
          cellY: y,
          lightX: x,
          lightY: y,
          face: 'ceiling',
          kind: 'ceiling',
          voxelOk: true
        });
      }

      if (!tile.wall && !tile.door && !tile.secret) continue;
      if (tile.door) continue;

      const isRubble = rubble.has(cellToken(x, y));
      for (const face of ['N', 'E', 'S', 'W'] as const) {
        const { dx, dz } = FACE_DELTA[face];
        const nx = x + dx;
        const nz = y + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const neighbor = tiles[nz][nx];
        if (occludesWallFace(neighbor)) continue;

        let kind: LabSurfaceKind = 'wall';
        if (isRubble) kind = 'rubble';
        else if (tile.secret) kind = tile.secretOpen ? 'secret-open' : 'secret';

        out.push({
          key: faceKey(x, y, face),
          cellX: x,
          cellY: y,
          lightX: nx,
          lightY: nz,
          face,
          kind,
          voxelOk: (kind === 'wall' || kind === 'secret') && !tile.carving
        });
      }
    }
  }
  return out;
}

export function labFaceKeys(faces: readonly LabMapFace[]): string[] {
  return faces.map((f) => f.key).sort();
}
