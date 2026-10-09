import type { HeroId, ItemType, GameScreen, LanternState, FormationRow } from './constants';

// Hero state
export interface Hero {
  id: HeroId;
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  ac: number;
  equipment: {
    main: ItemType;
    off: ItemType;
    armour: ItemType | null;
    trinket: ItemType | null;
  };
  recovery: {
    main: number;  // timestamp when ready
    off: number;
  };
  formation: FormationRow;
}

// Party position and state
export interface PartyState {
  floor: number;
  x: number;
  y: number;
  dir: number; // 0=N, 1=E, 2=S, 3=W
  stepCount: number; // for mana regen (1 per 10 steps)
}

// Floor tile state
export interface TileState {
  wall?: boolean;
  door?: boolean;
  doorLocked?: boolean;
  doorOpen?: boolean;
  secret?: boolean;
  secretOpen?: boolean;
  stairs?: 'up' | 'down';
  deepWater?: boolean;
  shallowWater?: boolean;
  
  // Act 1 extensions
  grate?: boolean;
  grateOpen?: boolean;
  lever?: boolean;
  leverPulled?: boolean;
  vent?: boolean;
  bars?: boolean;
  barsOpen?: boolean;
  gateOpensOn?: string; // flag name
  
  // Content
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
  
  // Props
  prop?: 'table' | 'bunk' | 'weapon_rack' | 'statue' | 'vent' | 'grate' | 'bars' | 'glassWater';
  propState?: string;
}

// Floor definition
export interface FloorData {
  id: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: TileState[][];
  sconces?: Array<{
    x: number;
    y: number;
    face: 'N' | 'S' | 'E' | 'W';
    lit: boolean;
  }>;
  patrol?: Array<{
    monster: string;
    path: Array<[number, number]>;
    speed: number;
  }>;
}

// Inventory
export interface InventoryState {
  bag: Array<{
    item: string;
    count: number;
    slot?: number;
  }>;
  potions: {
    health: number;
    mana: number;
  };
  keys: string[]; // key IDs
}

// Dialogue state
export interface DialogueState {
  id: string;
  currentNode: number;
  speaker: string;
  npcPortrait?: string;
}

// Combat state
export interface CombatState {
  active: boolean;
  monster: string;
  monsterHp: number;
  monsterMaxHp: number;
  monsterAc: number;
  tile: TileState | null;
  turn: 'player' | 'monster';
  startTime: number;
  lastActionTime: number;
}

// Save slot
export interface SaveSlot {
  slot: number;
  timestamp: number;
  floor: number;
  heroes: Hero[];
  party: PartyState;
  inventory: InventoryState;
  flags: string[];
  lantern: LanternState;
  escapeRunActive: boolean;
}

// Full game state
export interface GameState {
  screen: GameScreen;
  heroes: Record<HeroId, Hero>;
  party: PartyState;
  floors: Map<number, FloorData>;
  inventory: InventoryState;
  flags: Set<string>;
  lantern: LanternState;
  combat: CombatState | null;
  dialogue: DialogueState | null;
  reading: {
    text: string[];
    index: number;
  } | null;
  escapeRunActive: boolean;
  escapeCheckpoints: Set<string>;
  brightness: number; // 0.0 - 1.0
  settings: {
    musicVolume: number;
    sfxVolume: number;
  };
}

// Action definitions from actions.json
export interface ActionDef {
  item: ItemType;
  toHit?: number;
  damage?: [number, number];
  recovery: number;
  mana?: number;
  effect?: string;
  note?: string;
  ranged?: boolean;
}

export interface HeroDef {
  hp: number;
  maxHp: number;
  ac: number;
  mana?: number;
  maxMana?: number;
  main: ActionDef;
  off: ActionDef;
}

// Monster definitions from monsters.json
export interface MonsterDef {
  floor: number;
  hp: number;
  damage: [number, number];
  ac: number;
  interval?: number;
  latch?: {
    chance: number;
    drainPerTurn: number;
    turns: number;
    sound: string;
  };
}

// Dialogue node
export interface DialogueNode {
  text: string;
  speaker?: string;
  choices?: Array<{
    text: string;
    next: number;
    flag?: string;
    cost?: string;
  }>;
  flag?: string;
  next?: number;
}

export interface DialogueDef {
  id: string;
  nodes: DialogueNode[];
}
