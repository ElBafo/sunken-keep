import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import type { SavedFloor, SavedMonster, SavedSconce, SavedTile } from '../proto3d/saves';
import { floor1Sconces } from './fixtures';
import { doorEdgeAt, resetFloor1Doors, resetFloor1Loot, type FloorMap, type FloorTile } from './layout';

export {
  SAVE_VERSION,
  SLOT_COUNT,
  formatPlayTime,
  floorState,
  hasAnySave,
  listAutosaves,
  listSlots,
  loadFloorSnapshot,
  loadSlot,
  newestAutosave,
  newestSlot,
  parseSave,
  persistStorage,
  snapshotHero,
  snapshotMonster,
  writeAutosave,
  writeFloorSnapshot,
  writeSlot,
  type SaveKind,
  type SavePayload,
  type SavedBagEntry,
  type SavedFloor,
  type SavedHero,
  type SavedMonster,
  type SavedSconce,
  type SavedTile,
  type SlotSummary
} from '../proto3d/saves';

export const FLOOR_NUMBER = 1;

/** Same cells Classic writes: doors, secrets, chests, leftover floor items. */
export function snapshotFloorTiles(map: FloorMap): SavedTile[] {
  const tiles: SavedTile[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      const src = rawFloor1.tiles[y][x] as FloorTile;
      const door = !!doorEdgeAt(x, y) || !!tile.door;
      if (!door && !tile.secret && !tile.chest && !tile.item && !src.item && !src.chest && !src.secret) continue;
      tiles.push({
        x,
        y,
        doorOpen: tile.doorOpen,
        doorLocked: tile.doorLocked,
        secretOpen: tile.secretOpen,
        chestOpen: tile.chestOpen,
        chestItems: tile.chestItems ? [...tile.chestItems] : tile.chestItems,
        item: tile.item ?? null
      });
    }
  }
  return tiles;
}

export function applyFloorTiles(map: FloorMap, tiles: SavedTile[] | undefined): void {
  resetFloor1Loot(map);
  resetFloor1Doors(map);
  for (const t of tiles ?? []) {
    const tile = map.tiles[t.y]?.[t.x];
    if (!tile) continue;
    if (t.item === null) tile.item = undefined;
    else if (t.item !== undefined) tile.item = t.item;
    if (t.chestOpen !== undefined) tile.chestOpen = t.chestOpen;
    if (t.chestItems !== undefined) tile.chestItems = [...t.chestItems];
    if (t.doorOpen !== undefined) tile.doorOpen = t.doorOpen;
    if (t.doorLocked !== undefined) tile.doorLocked = t.doorLocked;
    if (t.secretOpen !== undefined) tile.secretOpen = t.secretOpen;
  }
}

export function snapshotSconces(): SavedSconce[] {
  return floor1Sconces.map((s) => ({
    x: s.x,
    y: s.y,
    face: s.face,
    lit: !!s.lit,
    empty: !!s.empty,
    capped: !!s.capped
  }));
}

export function applySconces(list: SavedSconce[] | undefined): void {
  for (const s of list ?? []) {
    const live = floor1Sconces.find((c) => c.x === s.x && c.y === s.y && c.face === s.face);
    if (!live || live.capped) continue;
    live.lit = !!s.lit;
    live.empty = !!s.empty;
  }
}

export function snapshotCurrentFloor(map: FloorMap, monsters: SavedMonster[]): SavedFloor {
  return {
    tiles: snapshotFloorTiles(map),
    sconces: snapshotSconces(),
    monsters: monsters.map((m) => ({ ...m }))
  };
}
