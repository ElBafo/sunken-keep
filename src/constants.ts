// Canvas dimensions for 270×585 layout
export const CANVAS_WIDTH = 270;
export const CANVAS_HEIGHT = 585;

// View dimensions (top portion for 3D/2D dungeon view)
export const VIEW_WIDTH = 270;
export const VIEW_HEIGHT = 380;
export const HORIZON_Y = 190;

// Panel starts below the view
export const PANEL_Y = VIEW_HEIGHT; // 380

// Hero IDs
export type HeroId = 'brannoc' | 'wren' | 'ilsevar' | 'mags';

// Item types
export type ItemType = 
  | 'axe' | 'shield' | 'mace' | 'prayer_lantern' 
  | 'wand' | 'scroll' | 'dagger' | 'tricks_pouch'
  | 'empty_hand';

// Equipment slots
export type EquipSlot = 'main' | 'off' | 'armour' | 'trinket';

// Game screens
export type GameScreen = 
  | 'title'           // Title screen with New/Continue/Load
  | 'intro'           // Intro cutscene (only on New Game)
  | 'playing'         // Main dungeon exploration
  | 'combat'          // Combat encounter
  | 'inventory'       // Inventory/bag screen
  | 'character_sheet' // Character sheet for a hero
  | 'dialogue'        // Story dialogue
  | 'reading'         // Reading scrolls/carvings
  | 'act_complete';   // End of Act screen

// Lantern states
export type LanternState = 'bright' | 'guttering' | 'out';

// Formation positions
export type FormationRow = 'front' | 'back';

export const LAYOUT = {
  canvas: [CANVAS_WIDTH, CANVAS_HEIGHT] as [number, number],
  view: [0, 0, VIEW_WIDTH, VIEW_HEIGHT] as [number, number, number, number],
  panelTop: PANEL_Y,
  horizon: HORIZON_Y,
} as const;

// Hero layout from layout585.json
export const HERO_LAYOUT = {
  brannoc: {
    portrait: [13, 386, 44, 44] as [number, number, number, number],
    handMain: [3, 442, 31, 28] as [number, number, number, number],
    handOff: [36, 442, 31, 28] as [number, number, number, number],
    hpBar: [3, 432, 64, 3] as [number, number, number, number],
    manaBar: null,
  },
  wren: {
    portrait: [80, 386, 44, 44] as [number, number, number, number],
    handMain: [70, 442, 31, 28] as [number, number, number, number],
    handOff: [103, 442, 31, 28] as [number, number, number, number],
    hpBar: [70, 432, 64, 3] as [number, number, number, number],
    manaBar: [70, 437, 64, 3] as [number, number, number, number],
  },
  ilsevar: {
    portrait: [147, 386, 44, 44] as [number, number, number, number],
    handMain: [137, 442, 31, 28] as [number, number, number, number],
    handOff: [170, 442, 31, 28] as [number, number, number, number],
    hpBar: [137, 432, 64, 3] as [number, number, number, number],
    manaBar: [137, 437, 64, 3] as [number, number, number, number],
  },
  mags: {
    portrait: [214, 386, 44, 44] as [number, number, number, number],
    handMain: [204, 442, 31, 28] as [number, number, number, number],
    handOff: [237, 442, 31, 28] as [number, number, number, number],
    hpBar: [204, 432, 64, 3] as [number, number, number, number],
    manaBar: null,
  },
} as const;

// UI controls layout
export const CONTROLS_LAYOUT = {
  log: [4, 474, 262, 28] as [number, number, number, number],
  pad: {
    turn_left: [6, 508, 28, 28] as [number, number, number, number],
    forward: [36, 508, 28, 28] as [number, number, number, number],
    turn_right: [66, 508, 28, 28] as [number, number, number, number],
    strafe_left: [6, 538, 28, 28] as [number, number, number, number],
    back: [36, 538, 28, 28] as [number, number, number, number],
    strafe_right: [66, 538, 28, 28] as [number, number, number, number],
  },
  compass: [114, 516, 42, 42] as [number, number, number, number],
  potion_health: [172, 508, 28, 28] as [number, number, number, number],
  potion_mana: [204, 508, 28, 28] as [number, number, number, number],
  inventory: [172, 540, 60, 28] as [number, number, number, number],
  menu: [236, 508, 28, 28] as [number, number, number, number],
  save: [236, 540, 28, 28] as [number, number, number, number],
} as const;

// Default equipment from hands.json
export const DEFAULT_EQUIPMENT: Record<HeroId, { main: ItemType; off: ItemType }> = {
  brannoc: { main: 'axe', off: 'shield' },
  wren: { main: 'mace', off: 'prayer_lantern' },
  ilsevar: { main: 'wand', off: 'scroll' },
  mags: { main: 'dagger', off: 'tricks_pouch' },
};

// Formation - front two can melee
export const DEFAULT_FORMATION: Record<HeroId, FormationRow> = {
  brannoc: 'front',
  mags: 'front',
  wren: 'back',
  ilsevar: 'back',
};

// Melee items that require front row
export const MELEE_ITEMS: ItemType[] = [
  'axe', 'shield', 'mace', 'dagger', 'empty_hand'
];

// Starting flags for new game
export const STARTING_FLAGS: Set<string> = new Set();

// Stone strip tile for filling extra height
export const STONE_STRIP_TILE = 'stone_strip_tile.png';
