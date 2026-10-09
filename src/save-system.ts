import type { GameState, SaveSlot, Hero } from './types';
import type { HeroId } from './constants';

const SAVE_KEY_PREFIX = 'sunken_keep_save_';
const SETTINGS_KEY = 'sunken_keep_settings';

export class SaveSystem {
  // Save game to slot (1, 2, or 3)
  static save(state: GameState, slot: number, isAuto: boolean = false): boolean {
    try {
      const saveData: SaveSlot = {
        slot,
        timestamp: Date.now(),
        floor: state.party.floor,
        heroes: Object.values(state.heroes),
        party: state.party,
        inventory: state.inventory,
        flags: Array.from(state.flags),
        lantern: state.lantern,
        escapeRunActive: state.escapeRunActive,
      };

      localStorage.setItem(
        `${SAVE_KEY_PREFIX}${slot}`,
        JSON.stringify(saveData)
      );

      console.log(`Game saved to slot ${slot}${isAuto ? ' (auto)' : ''}`);
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  // Load game from slot
  static load(slot: number): SaveSlot | null {
    try {
      const data = localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`);
      if (!data) return null;

      const save: SaveSlot = JSON.parse(data);
      // console.log(`Game loaded from slot ${slot}`); // Too noisy, called every frame
      return save;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }

  // Get all save slots
  static getAllSlots(): Array<SaveSlot | null> {
    return [1, 2, 3].map(slot => this.load(slot));
  }

  // Check if slot has data
  static hasData(slot: number): boolean {
    return localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`) !== null;
  }

  // Delete save slot
  static deleteSave(slot: number): void {
    localStorage.removeItem(`${SAVE_KEY_PREFIX}${slot}`);
    console.log(`Save slot ${slot} deleted`);
  }

  // Get most recent save slot
  static getMostRecentSlot(): number | null {
    const slots = this.getAllSlots();
    let mostRecent: { slot: number; time: number } | null = null;

    for (let i = 0; i < slots.length; i++) {
      const save = slots[i];
      if (save && (!mostRecent || save.timestamp > mostRecent.time)) {
        mostRecent = { slot: i + 1, time: save.timestamp };
      }
    }

    return mostRecent ? mostRecent.slot : null;
  }

  // Auto-save to last used slot or slot 1
  static autoSave(state: GameState): boolean {
    // Don't auto-save during escape run
    if (state.escapeRunActive) {
      return false;
    }

    const lastSlot = this.getMostRecentSlot() || 1;
    return this.save(state, lastSlot, true);
  }

  // Save settings
  static saveSettings(settings: { musicVolume: number; sfxVolume: number; brightness: number }): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // Load settings
  static loadSettings(): { musicVolume: number; sfxVolume: number; brightness: number } {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }

    // Defaults
    return {
      musicVolume: 1.0,
      sfxVolume: 1.0,
      brightness: 1.0,
    };
  }

  // Create checkpoint save during escape run
  static checkpointSave(state: GameState, checkpointId: string): boolean {
    if (!state.escapeRunActive) return false;

    // Save to special checkpoint slot
    try {
      const saveData = {
        checkpoint: checkpointId,
        timestamp: Date.now(),
        floor: state.party.floor,
        heroes: Object.values(state.heroes),
        party: state.party,
        inventory: state.inventory,
        flags: Array.from(state.flags),
        lantern: state.lantern,
        escapeRunActive: true,
        escapeCheckpoints: Array.from(state.escapeCheckpoints),
      };

      localStorage.setItem(
        `${SAVE_KEY_PREFIX}checkpoint`,
        JSON.stringify(saveData)
      );

      console.log(`Checkpoint saved: ${checkpointId}`);
      return true;
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
      return false;
    }
  }

  // Restore game state from save slot
  static restoreState(save: SaveSlot, currentState: GameState): void {
    // Restore heroes
    save.heroes.forEach((heroData: Hero) => {
      const hero = currentState.heroes[heroData.id as HeroId];
      if (hero) {
        Object.assign(hero, heroData);
      }
    });

    // Restore party
    Object.assign(currentState.party, save.party);

    // Restore inventory
    Object.assign(currentState.inventory, save.inventory);

    // Restore flags
    currentState.flags = new Set(save.flags);

    // Restore lantern
    currentState.lantern = save.lantern;

    // Restore escape run state
    currentState.escapeRunActive = save.escapeRunActive;
  }

  // Check if combat state should be rolled back before save
  static shouldRollbackCombat(state: GameState): boolean {
    // If in combat, save should restore to just before combat started
    return state.combat !== null && state.combat.active;
  }

  // Handle page visibility change (auto-save when leaving)
  static setupAutoSaveOnLeave(getState: () => GameState): void {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const state = getState();
        if (!state.escapeRunActive) {
          this.autoSave(state);
        }
      }
    };

    const handlePageHide = () => {
      const state = getState();
      if (!state.escapeRunActive) {
        this.autoSave(state);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
  }
}
