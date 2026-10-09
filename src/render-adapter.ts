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
    id: floor.id,
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

  // Act 1 fields
  if (newTile.stairs) tile.stairs = newTile.stairs;
  if (newTile.dialogue) tile.dialogue = newTile.dialogue;
  if (newTile.then) tile.then = newTile.then;
  if (newTile.bark) tile.bark = newTile.bark;
  if (newTile.npc) tile.npc = newTile.npc;
  if (newTile.prop) tile.prop = newTile.prop;
  if (newTile.glassWater) tile.glassWater = true;
  if (newTile.lever) tile.lever = newTile.lever;
  if (newTile.openedBy) tile.openedBy = newTile.openedBy;
  if (newTile.grate) tile.grate = newTile.grate;
  if (newTile.vent) tile.vent = newTile.vent;
  if (newTile.bars) tile.bars = newTile.bars;
  if (newTile.gateOpensOn) tile.gateOpensOn = newTile.gateOpensOn;
  if (newTile.patrol) tile.patrol = newTile.patrol;
  if (newTile.checkpoint) tile.checkpoint = true;
  if (newTile.daylight) tile.daylight = true;
  if (newTile.journalPage) tile.journalPage = newTile.journalPage;
  if (newTile.actEnd) tile.actEnd = newTile.actEnd;

  return tile;
}
