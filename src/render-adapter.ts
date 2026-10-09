// Adapter to convert new GameState to old renderer's Party/FloorData format

import type { GameState } from './types';
import { Party } from './party';
import type { FloorData, Tile, Direction } from './party';

export function createPartyAdapter(state: GameState): Party {
  const floor = state.floors.get(state.party.floor);
  if (!floor) {
    throw new Error(`Floor ${state.party.floor} not found`);
  }

  // Convert new FloorData to old FloorData format
  const oldFloorData: FloorData = {
    width: floor.width,
    height: floor.height,
    startX: floor.startX,
    startY: floor.startY,
    startDir: floor.startDir as Direction,
    tiles: floor.tiles.map(row => 
      row.map(tile => convertTile(tile))
    ),
    sconces: floor.sconces,
  };

  // Create old Party structure
  const party = new Party(
    state.party.x,
    state.party.y,
    state.party.dir as Direction
  );

  // Manually set the floor data
  (party as any).floor = oldFloorData;

  return party;
}

function convertTile(newTile: any): Tile {
  const tile: Tile = {};

  // Copy common fields
  if (newTile.wall) tile.wall = true;
  if (newTile.door) tile.door = true;
  if (newTile.doorLocked) tile.doorLocked = true;
  if (newTile.doorOpen) tile.doorOpen = true;
  if (newTile.secret) tile.secret = true;
  if (newTile.secretOpen) tile.secretOpen = true;
  if (newTile.shallowWater) tile.shallowWater = true;
  if (newTile.deepWater) tile.deepWater = true;
  if (newTile.item) tile.item = newTile.item;
  if (newTile.chest) tile.chest = true;
  if (newTile.chestOpen) tile.chestOpen = true;
  if (newTile.carving) tile.carving = newTile.carving;

  // Monster fields
  if (newTile.monster) {
    tile.monster = newTile.monster;
    tile.monsterHp = newTile.monsterHp;
    tile.monsterMaxHp = newTile.monsterMaxHp;
    tile.monsterState = newTile.monsterState || 'idle';
    tile.monsterAnimTime = newTile.monsterAnimTime || 0;
  }

  return tile;
}
