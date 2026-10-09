import type { GameState, MonsterDef } from './types';
import type { HeroId } from './constants';
import { MELEE_ITEMS } from './constants';
import { actionSystem } from './action-system';
import { sound } from './assets';
import { getLogMessage } from './log-messages';
import { gameLog } from './game-log';

function monsterName(id: string): string {
  return id.replace(/_/g, ' ');
}

export class CombatController {
  private monsterData: Record<string, MonsterDef> = {};
  private activeEncounter: {
    monster: string;
    monsterAc: number;
    monsterHp: number;
    monsterMaxHp: number;
    tile: { x: number; y: number };
  } | null = null;

  // Load monster data
  async loadMonsterData(baseUrl: string): Promise<void> {
    try {
      const response = await fetch(`${baseUrl}levels/monsters.json`);
      this.monsterData = await response.json();
      delete (this.monsterData as any)._note;
      console.log('Monster data loaded');
    } catch (error) {
      console.error('Failed to load monster data:', error);
    }
  }

  // Get monster stats
  getMonsterStats(monsterType: string): MonsterDef | null {
    return this.monsterData[monsterType] || null;
  }

  // Start combat with a monster
  startCombat(state: GameState, monster: string, x: number, y: number): void {
    if (this.activeEncounter) return;

    const stats = this.getMonsterStats(monster);
    if (!stats) {
      console.error(`Monster not found: ${monster}`);
      return;
    }

    const floor = state.floors.get(state.party.floor);
    const tile = floor?.tiles[y]?.[x];
    const hp = tile?.monsterHp ?? stats.hp;
    const maxHp = tile?.monsterMaxHp ?? stats.hp;

    this.activeEncounter = {
      monster,
      monsterAc: stats.ac,
      monsterHp: hp,
      monsterMaxHp: maxHp,
      tile: { x, y },
    };
    state.combat = {
      active: true,
      monster,
      monsterHp: hp,
      monsterMaxHp: maxHp,
      monsterAc: stats.ac,
      tile: tile ?? null,
      turn: 'player',
      startTime: Date.now(),
      lastActionTime: Date.now(),
    };
    console.log(`Combat started: ${monster} (AC ${stats.ac}, HP ${hp})`);
  }

  // End combat (monster defeated or fled)
  endCombat(state?: GameState): void {
    if (this.activeEncounter) {
      console.log(`Combat ended: ${this.activeEncounter.monster}`);
    }
    this.activeEncounter = null;
    if (state) {
      state.combat = null;
    }
  }

  // Check if in combat
  isInCombat(): boolean {
    return this.activeEncounter !== null;
  }

  // Get combat info
  getCombatInfo() {
    return this.activeEncounter;
  }

  private removeMonsterFromFloor(state: GameState, x: number, y: number): void {
    const floor = state.floors.get(state.party.floor);
    if (!floor) return;
    if (x < 0 || x >= floor.width || y < 0 || y >= floor.height) return;
    floor.tiles[y][x].monster = undefined;
    floor.tiles[y][x].monsterHp = undefined;
    floor.tiles[y][x].monsterMaxHp = undefined;
    floor.tiles[y][x].monsterState = undefined;
  }

  private syncTileHp(state: GameState): void {
    if (!this.activeEncounter) return;
    const floor = state.floors.get(state.party.floor);
    const { x, y } = this.activeEncounter.tile;
    if (!floor || !floor.tiles[y] || !floor.tiles[y][x]) return;
    floor.tiles[y][x].monsterHp = this.activeEncounter.monsterHp;
    if (state.combat) {
      state.combat.monsterHp = this.activeEncounter.monsterHp;
    }
  }

  // Handle hand button click
  handleHandButton(state: GameState, heroId: HeroId, hand: 'main' | 'off'): void {
    const hero = state.heroes[heroId];
    if (!hero) return;

    // Check if action is ready
    const now = Date.now();
    const recoveryEnd = hero.recovery[hand];
    if (recoveryEnd > now) {
      sound.play('sfx_ui_button_denied');
      return;
    }

    // Check if in combat
    if (!this.activeEncounter) {
      sound.play('sfx_ui_button_denied');
      return;
    }

    // Check mana cost
    if (!actionSystem.canUseAction(hero, hand, state)) {
      sound.play('sfx_ui_button_denied');
      return;
    }

    // Front-two melee rule: back row cannot use melee items
    const actionDef = actionSystem.getActionDefPublic(hero.id, hand);
    const item = hero.equipment[hand];
    const isRanged = !!(actionDef?.ranged || actionDef?.note?.includes('ranged') || item === 'wand' || item === 'scroll');
    if (!isRanged && hero.formation === 'back' && MELEE_ITEMS.includes(item)) {
      sound.play('sfx_ui_button_denied');
      return;
    }

    // Perform action
    const target = {
      monster: this.activeEncounter.monster,
      monsterAc: this.activeEncounter.monsterAc,
      monsterHp: this.activeEncounter.monsterHp,
    };

    const result = actionSystem.performAction(hero, hand, target, state);

    if (result.success) {
      if (result.miss) {
        sound.play('sfx_ui_button');
        gameLog.add(getLogMessage('miss', { hero: hero.name }));
        console.log(`${hero.name} missed!`);
      } else if (result.damage) {
        sound.play('sfx_hit');
        this.activeEncounter.monsterHp = Math.max(0, this.activeEncounter.monsterHp - result.damage);
        this.syncTileHp(state);
        gameLog.add(getLogMessage('hit', {
          hero: hero.name,
          monster: monsterName(this.activeEncounter.monster),
          n: result.damage,
        }));
        console.log(`${hero.name} hit for ${result.damage} damage!`);

        if (this.activeEncounter.monsterHp <= 0) {
          const deadName = this.activeEncounter.monster;
          const { x, y } = this.activeEncounter.tile;
          gameLog.add(getLogMessage('monster_dies', { monster: monsterName(deadName) }));
          console.log(`${deadName} defeated!`);
          this.removeMonsterFromFloor(state, x, y);
          this.endCombat(state);
        }
      } else if (result.healing) {
        sound.play('sfx_potion');
        gameLog.add(result.effect || `${hero.name} healed for ${result.healing}!`);
        console.log(`${hero.name} healed for ${result.healing}!`);
      } else {
        sound.play('sfx_ui_button');
        gameLog.add(result.effect || `${hero.name} used ${actionDef?.item || 'action'}!`);
        console.log(`${hero.name} used ${actionDef?.item || 'action'}!`);
      }
    }
  }

  // Mana regeneration: 1 per 10 steps
  regenerateMana(state: GameState, steps: number): void {
    if (steps >= 10) {
      const manaGain = Math.floor(steps / 10);
      Object.values(state.heroes).forEach(hero => {
        if (hero.maxMana > 0) {
          const oldMana = hero.mana;
          hero.mana = Math.min(hero.maxMana, hero.mana + manaGain);
          if (hero.mana > oldMana) {
            console.log(`${hero.name} regenerated ${hero.mana - oldMana} mana`);
          }
        }
      });
    }
  }
}

export const combatController = new CombatController();
