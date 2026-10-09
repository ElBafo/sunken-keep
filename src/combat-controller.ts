import type { GameState } from './types';
import { HERO_LAYOUT, CONTROLS_LAYOUT } from './constants';
import type { HeroId } from './constants';
import { actionSystem } from './action-system';
import { sound } from './assets';

export class CombatController {
  private activeEncounter: {
    monster: string;
    monsterAc: number;
    monsterHp: number;
    monsterMaxHp: number;
    tile: { x: number; y: number };
  } | null = null;

  // Start combat with a monster
  startCombat(state: GameState, monster: string, monsterAc: number, monsterHp: number, x: number, y: number): void {
    this.activeEncounter = {
      monster,
      monsterAc,
      monsterHp,
      monsterMaxHp: monsterHp,
      tile: { x, y },
    };
    console.log(`Combat started: ${monster} (AC ${monsterAc}, HP ${monsterHp})`);
  }

  // End combat (monster defeated or fled)
  endCombat(): void {
    if (this.activeEncounter) {
      console.log(`Combat ended: ${this.activeEncounter.monster}`);
    }
    this.activeEncounter = null;
  }

  // Check if in combat
  isInCombat(): boolean {
    return this.activeEncounter !== null;
  }

  // Get combat info
  getCombatInfo() {
    return this.activeEncounter;
  }

  // Handle hand button click
  handleHandButton(state: GameState, heroId: HeroId, hand: 'main' | 'off'): void {
    const hero = state.heroes[heroId];
    if (!hero) return;

    // Check if action is ready
    const now = Date.now();
    const recoveryEnd = hero.recovery[hand];
    if (recoveryEnd > now) {
      sound.play('sfx_no');
      return;
    }

    // Check if in combat
    if (!this.activeEncounter) {
      sound.play('sfx_no');
      return;
    }

    // Check mana cost
    if (!actionSystem.canUseAction(hero, hand)) {
      sound.play('sfx_no_mana');
      return;
    }

    // Front-two melee rule: check if hero can melee
    const actionDef = actionSystem.getActionDefPublic(hero.id, hand);
    if (actionDef && actionDef.range === 'melee' && hero.formation === 'back') {
      // Back row cannot melee
      sound.play('sfx_no');
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
      // Play action ready sound (recovery started)
      sound.play('sfx_act_ready');

      if (result.miss) {
        // Miss
        sound.play('sfx_attack_miss');
        console.log(`${hero.name} missed!`);
      } else if (result.damage) {
        // Hit
        sound.play('sfx_attack_hit');
        this.activeEncounter.monsterHp = Math.max(0, this.activeEncounter.monsterHp - result.damage);
        console.log(`${hero.name} hit for ${result.damage} damage!`);

        // Check if monster defeated
        if (this.activeEncounter.monsterHp <= 0) {
          console.log(`${this.activeEncounter.monster} defeated!`);
          this.endCombat();

          // Remove monster from floor
          const floor = state.floors.get(state.party.floor);
          if (floor && this.activeEncounter) {
            const { x, y } = this.activeEncounter.tile;
            if (x >= 0 && x < floor.width && y >= 0 && y < floor.height) {
              floor.tiles[y][x].monster = undefined;
              floor.tiles[y][x].monsterHp = undefined;
              floor.tiles[y][x].monsterMaxHp = undefined;
            }
          }
        }
      } else if (result.healing) {
        // Healing
        sound.play('sfx_spell_cast');
        console.log(`${hero.name} healed for ${result.healing}!`);
      } else {
        // Other effect
        sound.play('sfx_spell_cast');
        console.log(`${hero.name} used ${actionDef?.name || 'action'}!`);
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
