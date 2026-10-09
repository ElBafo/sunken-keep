import type { GameState, Hero, FloorData, SaveSlot } from './types';
import type { HeroId } from './constants';
import {
  DEFAULT_EQUIPMENT,
  DEFAULT_FORMATION,
  STARTING_FLAGS,
} from './constants';
import { SaveSystem } from './save-system';
import { actionSystem } from './action-system';

// Initialize new game state
export function createNewGameState(): GameState {
  const heroes: Record<HeroId, Hero> = {
    brannoc: {
      id: 'brannoc',
      name: 'Brannoc',
      hp: 45,
      maxHp: 45,
      mana: 0,
      maxMana: 0,
      ac: 15,
      equipment: {
        main: DEFAULT_EQUIPMENT.brannoc.main,
        off: DEFAULT_EQUIPMENT.brannoc.off,
        armour: null,
        trinket: null,
      },
      recovery: { main: 0, off: 0 },
      formation: DEFAULT_FORMATION.brannoc,
    },
    wren: {
      id: 'wren',
      name: 'Sister Wren',
      hp: 32,
      maxHp: 32,
      mana: 12,
      maxMana: 12,
      ac: 13,
      equipment: {
        main: DEFAULT_EQUIPMENT.wren.main,
        off: DEFAULT_EQUIPMENT.wren.off,
        armour: null,
        trinket: null,
      },
      recovery: { main: 0, off: 0 },
      formation: DEFAULT_FORMATION.wren,
    },
    ilsevar: {
      id: 'ilsevar',
      name: 'Ilsevar',
      hp: 24,
      maxHp: 24,
      mana: 16,
      maxMana: 16,
      ac: 11,
      equipment: {
        main: DEFAULT_EQUIPMENT.ilsevar.main,
        off: DEFAULT_EQUIPMENT.ilsevar.off,
        armour: null,
        trinket: null,
      },
      recovery: { main: 0, off: 0 },
      formation: DEFAULT_FORMATION.ilsevar,
    },
    mags: {
      id: 'mags',
      name: 'Mags',
      hp: 28,
      maxHp: 28,
      mana: 0,
      maxMana: 0,
      ac: 14,
      equipment: {
        main: DEFAULT_EQUIPMENT.mags.main,
        off: DEFAULT_EQUIPMENT.mags.off,
        armour: null,
        trinket: null,
      },
      recovery: { main: 0, off: 0 },
      formation: DEFAULT_FORMATION.mags,
    },
  };

  return {
    screen: 'title',
    heroes,
    party: {
      floor: 1,
      x: 1,
      y: 7,
      dir: 0,
      stepCount: 0,
    },
    floors: new Map(),
    inventory: {
      bag: [],
      potions: {
        health: 0,
        mana: 0,
      },
      keys: [],
    },
    flags: new Set(STARTING_FLAGS),
    lantern: 'bright',
    combat: null,
    dialogue: null,
    reading: null,
    escapeRunActive: false,
    escapeCheckpoints: new Set(),
    brightness: 1.0,
    settings: {
      musicVolume: 1.0,
      sfxVolume: 1.0,
    },
  };
}

// Load game state from save
export function loadGameState(save: SaveSlot): GameState {
  const state = createNewGameState();
  SaveSystem.restoreState(save, state);
  state.screen = 'playing';
  return state;
}

// Change floor
export function changeFloor(state: GameState, newFloor: number, entrance: { x: number; y: number; dir: number }): void {
  state.party.floor = newFloor;
  state.party.x = entrance.x;
  state.party.y = entrance.y;
  state.party.dir = entrance.dir;

  // Auto-save at stairs (unless in escape run)
  if (!state.escapeRunActive) {
    SaveSystem.autoSave(state);
  }
}

// Handle checkpoint
export function handleCheckpoint(state: GameState, checkpointId: string): void {
  if (state.escapeRunActive) {
    state.escapeCheckpoints.add(checkpointId);
    SaveSystem.checkpointSave(state, checkpointId);
  }
}

// Start escape run (floor 4 finale)
export function startEscapeRun(state: GameState): void {
  state.escapeRunActive = true;
  state.escapeCheckpoints.clear();
  console.log('Escape run started!');
}

// Complete Act 1
export function completeAct1(state: GameState): void {
  state.screen = 'act_complete';
  state.escapeRunActive = false;
  
  // Final save
  SaveSystem.autoSave(state);
  console.log('Act 1 complete!');
}

// Handle hero damage
export function damageHero(hero: Hero, damage: number): void {
  hero.hp = Math.max(0, hero.hp - damage);
  console.log(`${hero.name} takes ${damage} damage (${hero.hp}/${hero.maxHp} HP)`);
}

// Handle hero healing
export function healHero(hero: Hero, healing: number): void {
  const actualHealing = Math.min(healing, hero.maxHp - hero.hp);
  hero.hp = Math.min(hero.maxHp, hero.hp + healing);
  console.log(`${hero.name} healed ${actualHealing} HP (${hero.hp}/${hero.maxHp})`);
}

// Use health potion
export function useHealthPotion(state: GameState): boolean {
  if (state.inventory.potions.health <= 0) return false;

  // Find most hurt hero
  const heroes = Object.values(state.heroes);
  const mostHurt = heroes.reduce((prev, curr) => {
    const prevPercent = prev.hp / prev.maxHp;
    const currPercent = curr.hp / curr.maxHp;
    return currPercent < prevPercent ? curr : prev;
  });

  healHero(mostHurt, 15);
  state.inventory.potions.health--;
  return true;
}

// Use mana potion
export function useManaPotion(state: GameState): boolean {
  if (state.inventory.potions.mana <= 0) return false;

  // Find hero with mana who needs it most
  const heroes = Object.values(state.heroes).filter(h => h.maxMana > 0);
  if (heroes.length === 0) return false;

  const needsMana = heroes.reduce((prev, curr) => {
    const prevPercent = prev.mana / prev.maxMana;
    const currPercent = curr.mana / curr.maxMana;
    return currPercent < prevPercent ? curr : prev;
  });

  needsMana.mana = Math.min(needsMana.maxMana, needsMana.mana + 8);
  state.inventory.potions.mana--;
  console.log(`${needsMana.name} restored 8 mana (${needsMana.mana}/${needsMana.maxMana})`);
  return true;
}

// Swap hero positions
export function swapHeroPositions(state: GameState, hero1Id: HeroId, hero2Id: HeroId): void {
  const hero1 = state.heroes[hero1Id];
  const hero2 = state.heroes[hero2Id];

  const temp = hero1.formation;
  hero1.formation = hero2.formation;
  hero2.formation = temp;

  console.log(`Swapped ${hero1.name} and ${hero2.name}`);
}

// Update lantern state
export function updateLantern(state: GameState, newState: 'bright' | 'guttering' | 'out'): void {
  state.lantern = newState;
  console.log(`Lantern: ${newState}`);
}

// Check if party is dead
export function isPartyDead(state: GameState): boolean {
  return Object.values(state.heroes).every(h => h.hp <= 0);
}

// Get current floor data
export function getCurrentFloor(state: GameState): FloorData | null {
  return state.floors.get(state.party.floor) || null;
}

// Get tile at position
export function getTileAt(floor: FloorData | null, x: number, y: number): any {
  if (!floor) return null;
  if (x < 0 || x >= floor.width || y < 0 || y >= floor.height) return null;
  return floor.tiles[y][x];
}

// Check if position is walkable
export function isWalkable(floor: FloorData | null, x: number, y: number, state: GameState): boolean {
  const tile = getTileAt(floor, x, y);
  if (!tile) return false;

  if (tile.wall) return false;
  if (tile.door && tile.doorLocked && !tile.doorOpen) return false;
  if (tile.secret && !tile.secretOpen) return false;
  if (tile.grate && !tile.grateOpen) return false;
  if (tile.bars && !tile.barsOpen) {
    // Check if gate opens on a flag
    if (tile.gateOpensOn && state.flags.has(tile.gateOpensOn)) {
      tile.barsOpen = true;
      return true;
    }
    return false;
  }

  return true;
}

// Move party forward
export function movePartyForward(state: GameState): boolean {
  const floor = getCurrentFloor(state);
  if (!floor) return false;

  const { x, y, dir } = state.party;
  const dx = [0, 1, 0, -1][dir];
  const dy = [-1, 0, 1, 0][dir];
  const newX = x + dx;
  const newY = y + dy;

  if (isWalkable(floor, newX, newY, state)) {
    state.party.x = newX;
    state.party.y = newY;
    state.party.stepCount++;
    
    // Regenerate mana
    actionSystem.regenerateMana(state);
    
    return true;
  }

  return false;
}

// Get flag status
export function hasFlag(state: GameState, flag: string): boolean {
  return state.flags.has(flag);
}

// Set flag
export function setFlag(state: GameState, flag: string): void {
  state.flags.add(flag);
  console.log(`Flag set: ${flag}`);
}
