import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import { doorEdgeAt, tileAt, type FloorMap, type FloorTile } from './layout';

/** Voxel locked-door line — Classic log still says a red rune; the keyhole plate does not. */
export const DOOR_LOCKED_MESSAGE = 'The door is locked. It needs a key.';

export type FloorLoot = {
  x: number;
  y: number;
  item?: string;
  journalPage?: number;
  chest?: boolean;
  chestItems?: string[];
};

/**
 * Classic floor-1 loot at the same voxel cell.
 * Door *cells* in Classic are wall edges here and never hold loot.
 */
export function mapClassicLootCell(x: number, y: number): { x: number; y: number } | null {
  if (doorEdgeAt(x, y) && (rawFloor1.tiles[y][x] as FloorTile).door) return null;
  return { x, y };
}

export function classicFloor1Loot(): FloorLoot[] {
  const out: FloorLoot[] = [];
  for (let y = 0; y < rawFloor1.height; y++) {
    for (let x = 0; x < rawFloor1.width; x++) {
      const mapped = mapClassicLootCell(x, y);
      if (!mapped) continue;
      const tile = rawFloor1.tiles[y][x] as FloorTile;
      if (!tile.item && !tile.chest) continue;
      out.push({
        x: mapped.x,
        y: mapped.y,
        item: tile.item,
        journalPage: tile.journalPage,
        chest: tile.chest,
        chestItems: tile.chestItems ? [...tile.chestItems] : undefined
      });
    }
  }
  return out;
}

/** Journal in the south secret alcove stays hidden until that wall opens. */
export function lootRevealed(map: FloorMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  if (!tile) return false;
  if (tile.secret && !tile.secretOpen) return false;
  if (x === 4 && y === 13) return !!tileAt(map, 5, 13)?.secretOpen;
  return true;
}

export function tileHasLoot(tile: FloorTile | undefined): boolean {
  if (!tile) return false;
  if (tile.item) return true;
  return !!tile.chest && !tile.chestOpen;
}
