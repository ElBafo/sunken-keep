import type { GameState, MonsterDef } from './types';
import type { HeroId } from './constants';
import { actionSystem } from './action-system';
import { sound } from './assets';

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
  startCombat(_state: GameState, monster: string, x: number, y: number): void {
    const stats = this.getMonsterStats(monster);
    if (!stats) {
      console.error(`Monster not found: ${monster}`);
      return;
    }

    this.activeEncounter = {
      monster,
      monsterAc: stats.ac,
      monsterHp: stats.hp,
      monsterMaxHp: stats.hp,
      tile: { x, y },
    };
    console.log(`Combat started: ${monster} (AC ${stats.ac}, HP ${stats.hp})`);
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
    if (!actionSystem.canUseAction(hero, hand, state)) {
      sound.play('sfx_no_mana');
      return;
    }

    // Front-two melee rule: check if hero can melee
    const actionDef = actionSystem.getActionDefPublic(hero.id, hand);
    if (actionDef && !actionDef.ranged && hero.formation === 'back') {
      // Back row cannot melee (ranged is falsy/undefined for melee weapons)
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
