import type { FloorData, Tile } from './party';
import type { FloorData as FloorDataTypes } from './types';
import { floor2 } from './floor2';
import { floor3 } from './floor3';
import { floor4 } from './floor4';

// Monster stats from public/data/monsters.json
const monsterStats: Record<string, { hp: number }> = {
  bog_leeches: { hp: 12 },
  keep_rat: { hp: 14 },
  rust_crab: { hp: 24 },
  slime: { hp: 40 },
  cellar_spider: { hp: 20 },
  drowned_dwarf: { hp: 35 },
  captain_dural: { hp: 60 },
};

// Load all floors
export async function loadAllFloors(): Promise<Map<number, FloorDataTypes>> {
  const floors = new Map<number, FloorDataTypes>();
  
  try {
    // Floor 1: 9x9 (keep original, but load monster stats from monsters.json)
    const floor1 = createFloor1();
    floors.set(1, floor1 as any);
    
    // Floor 2-4: use real floor data
    floors.set(2, floor2 as any);
    floors.set(3, floor3 as any);
    floors.set(4, floor4 as any);
    
    console.log('Loaded floors 1-4');
    return floors;
    
  } catch (error) {
    console.error('Failed to load floors:', error);
    return floors;
  }
}

// Create Floor 1 data with monster stats from monsters.json
function createFloor1(): FloorData {
  const m = (monster: string): Tile => {
    const stats = monsterStats[monster] || { hp: 10 };
    return {
      monster,
      monsterState: 'idle',
      monsterAnimTime: 0,
      monsterHp: stats.hp,
      monsterMaxHp: stats.hp,
    };
  };
  
  return {
    id: 1,
    width: 9,
    height: 9,
    startX: 1,
    startY: 7,
    startDir: 0,
    sconces: [
      { x: 0, y: 6, face: 'E', lit: true },
      { x: 4, y: 1, face: 'W', lit: true },
      { x: 0, y: 3, face: 'E', lit: false },
      { x: 4, y: 6, face: 'W', lit: false },
      { x: 8, y: 6, face: 'W', lit: false },
      { x: 8, y: 1, face: 'W', lit: false },
    ],
    tiles: [
      // Row 0
      [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
      // Row 1: stairs down at (7,1)
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, { stairs: 'down' }, { wall: true } ],
      // Row 2: leeches 12 HP, slime 40 HP (from monsters.json)
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { ...m('bog_leeches'), shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime'), { wall: true } ],
      // Row 3: rust crab 24 HP (from monsters.json)
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, m('rust_crab'), { item: 'potion_red' }, {}, { wall: true } ],
      // Row 4
      [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
      // Row 5: keep rat 14 HP (from monsters.json)
      [ { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, m('keep_rat'), { wall: true } ],
      // Row 6
      [ { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true }, {}, {}, {}, { wall: true } ],
      // Row 7
      [ { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true } ],
      // Row 8
      [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
    ]
  };
}

// Get starting position for a floor
export function getFloorStart(floorId: number, floors: Map<number, FloorDataTypes>): { x: number; y: number; dir: number} {
  const floor = floors.get(floorId);
  if (!floor) {
    return { x: 1, y: 7, dir: 0 }; // Default fallback
  }
  return { x: floor.startX, y: floor.startY, dir: floor.startDir };
}
