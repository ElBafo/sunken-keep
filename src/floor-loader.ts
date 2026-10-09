import type { FloorData, TileState } from './types';

// Floor loader that converts level data to FloorData format
// Handles stairs: stairsDown -> stairs: 'down', stairsUp -> stairs: 'up'

interface RawTile {
  wall?: boolean;
  door?: boolean;
  doorLocked?: boolean;
  doorOpen?: boolean;
  secret?: boolean;
  secretOpen?: boolean;
  stairsDown?: boolean;
  stairsUp?: boolean;
  deepWater?: boolean;
  shallowWater?: boolean;
  monster?: string;
  monsterHp?: number;
  monsterMaxHp?: number;
  monsterState?: 'idle' | 'alert' | 'attack' | 'hurt' | 'death';
  monsterAnimTime?: number;
  item?: string;
  chest?: boolean;
  chestOpen?: boolean;
  carving?: string;
  dialogue?: string;
  checkpoint?: string;
  grate?: boolean;
  grateOpen?: boolean;
  lever?: boolean;
  leverPulled?: boolean;
  vent?: boolean;
  bars?: boolean;
  barsOpen?: boolean;
  gateOpensOn?: string;
  prop?: string;
  propState?: string;
}

interface RawFloorData {
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: RawTile[][];
}

interface Sconce {
  x: number;
  y: number;
  face: 'N' | 'S' | 'E' | 'W';
  lit: boolean;
}

// Convert raw tile to TileState
function convertTile(raw: RawTile): TileState {
  const tile: TileState = {};
  
  // Copy all fields
  Object.assign(tile, raw);
  
  // Convert stairs fields
  if (raw.stairsDown) {
    tile.stairs = 'down';
    delete (tile as any).stairsDown;
  }
  if (raw.stairsUp) {
    tile.stairs = 'up';
    delete (tile as any).stairsUp;
  }
  
  return tile;
}

// Load all floors
export async function loadAllFloors(): Promise<Map<number, FloorData>> {
  const floors = new Map<number, FloorData>();
  
  try {
    // Create floors manually based on floor data files
    // For now, using hardcoded data; will load from files later
    
    // Floor 1: 9x9
    const floor1 = createFloor1();
    floors.set(1, floor1);
    
    // Floor 2: 12x12  
    const floor2 = createFloor2();
    floors.set(2, floor2);
    
    // Floor 3: 14x14
    const floor3 = createFloor3();
    floors.set(3, floor3);
    
    // Floor 4: 14x16
    const floor4 = createFloor4();
    floors.set(4, floor4);
    
    console.log('Loaded floors 1-4');
    return floors;
    
  } catch (error) {
    console.error('Failed to load floors:', error);
    return floors;
  }
}

// Create Floor 1 data
function createFloor1(): FloorData {
  const m = (monster: string, hp: number): TileState => ({
    monster,
    monsterState: 'idle',
    monsterAnimTime: 0,
    monsterHp: hp,
    monsterMaxHp: hp,
  });
  
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
      // Row 1
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, { stairs: 'down' }, { wall: true } ],
      // Row 2
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { ...m('bog_leeches', 12), shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime', 40), { wall: true } ],
      // Row 3
      [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, m('rust_crab', 24), { item: 'potion_red' }, {}, { wall: true } ],
      // Row 4
      [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
      // Row 5
      [ { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, m('keep_rat', 14), { wall: true } ],
      // Row 6
      [ { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true }, {}, {}, {}, { wall: true } ],
      // Row 7
      [ { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true } ],
      // Row 8
      [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
    ]
  };
}

// Placeholder for Floor 2 (12x12)
function createFloor2(): FloorData {
  const tiles: TileState[][] = [];
  for (let y = 0; y < 12; y++) {
    const row: TileState[] = [];
    for (let x = 0; x < 12; x++) {
      // Walls around perimeter
      if (x === 0 || x === 11 || y === 0 || y === 11) {
        row.push({ wall: true });
      } else if (x === 10 && y === 10) {
        // Stairs down at (10, 10)
        row.push({ stairs: 'down' });
      } else {
        row.push({});
      }
    }
    tiles.push(row);
  }
  
  // Stairs up at start position (7, 1)
  tiles[1][7] = { stairs: 'up' };
  
  return {
    id: 2,
    width: 12,
    height: 12,
    startX: 7,
    startY: 1,
    startDir: 0,
    tiles,
    sconces: [],
  };
}

// Placeholder for Floor 3 (14x14)
function createFloor3(): FloorData {
  const tiles: TileState[][] = [];
  for (let y = 0; y < 14; y++) {
    const row: TileState[] = [];
    for (let x = 0; x < 14; x++) {
      if (x === 0 || x === 13 || y === 0 || y === 13) {
        row.push({ wall: true });
      } else if (x === 3 && y === 11) {
        row.push({ stairs: 'down' });
      } else {
        row.push({});
      }
    }
    tiles.push(row);
  }
  
  // Stairs up at (10, 10)
  tiles[10][10] = { stairs: 'up' };
  
  return {
    id: 3,
    width: 14,
    height: 14,
    startX: 10,
    startY: 10,
    startDir: 0,
    tiles,
    sconces: [],
  };
}

// Placeholder for Floor 4 (14x16)
function createFloor4(): FloorData {
  const tiles: TileState[][] = [];
  for (let y = 0; y < 14; y++) {
    const row: TileState[] = [];
    for (let x = 0; x < 16; x++) {
      if (x === 0 || x === 15 || y === 0 || y === 13) {
        row.push({ wall: true });
      } else if (x === 5 && y === 9) {
        // Escape stairs
        row.push({ stairs: 'up' });
      } else {
        row.push({});
      }
    }
    tiles.push(row);
  }
  
  // Stairs up at (3, 11)
  tiles[11][3] = { stairs: 'up' };
  
  return {
    id: 4,
    width: 16,
    height: 14,
    startX: 3,
    startY: 11,
    startDir: 0,
    tiles,
    sconces: [],
  };
}

// Get starting position for a floor
export function getFloorStart(floorId: number, floors: Map<number, FloorData>): { x: number; y: number; dir: number } {
  const floor = floors.get(floorId);
  if (!floor) {
    return { x: 1, y: 7, dir: 0 }; // Default fallback
  }
  return { x: floor.startX, y: floor.startY, dir: floor.startDir };
}
