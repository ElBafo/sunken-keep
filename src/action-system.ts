import type { GameState, Hero, ActionDef, MonsterDef } from './types';
import type { HeroId, ItemType } from './constants';
import { MELEE_ITEMS, DEFAULT_FORMATION } from './constants';

// D20 roll
function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

// Roll damage within range
function rollDamage(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class ActionSystem {
  private actionData: Record<HeroId, { main: ActionDef; off: ActionDef }> = {} as any;
  private monsterData: Record<string, MonsterDef> = {};
  private monstersAC: Record<string, number> = {};

  async loadData(baseUrl: string): Promise<void> {
    try {
      // Load actions.json
      const actionsResponse = await fetch(`${baseUrl}/levels/actions.json`);
      const actionsData = await actionsResponse.json();
      
      // Extract hero actions
      this.actionData = {
        brannoc: actionsData.brannoc,
        wren: actionsData.wren,
        ilsevar: actionsData.ilsevar,
        mags: actionsData.mags,
      };

      // Extract monster ACs
      this.monstersAC = actionsData.monsters_floor1_ac || {};

      // Load monsters.json
      const monstersResponse = await fetch(`${baseUrl}/levels/monsters.json`);
      this.monsterData = await monstersResponse.json();

      console.log('Action system loaded');
    } catch (error) {
      console.error('Failed to load action data:', error);
    }
  }

  // Check if hero can use an action
  canUseAction(hero: Hero, hand: 'main' | 'off', state: GameState): boolean {
    // Check recovery time
    const now = Date.now();
    if (hero.recovery[hand] > now) {
      return false;
    }

    const item = hero.equipment[hand];
    const actionDef = this.getActionDef(hero.id, hand);

    if (!actionDef) return false;

    // Check mana cost
    if (actionDef.mana && hero.mana < actionDef.mana) {
      return false;
    }

    // Check front row requirement for melee
    if (MELEE_ITEMS.includes(item) && !actionDef.ranged) {
      if (hero.formation === 'back') {
        return false;
      }
    }

    return true;
  }

  // Perform hero action
  performAction(
    hero: Hero,
    hand: 'main' | 'off',
    target: { monster?: string; monsterAc?: number; monsterHp?: number } | Hero,
    state: GameState
  ): {
    success: boolean;
    damage?: number;
    effect?: string;
    healing?: number;
    miss?: boolean;
  } {
    const actionDef = this.getActionDef(hero.id, hand);
    if (!actionDef) {
      return { success: false };
    }

    // Apply mana cost
    if (actionDef.mana) {
      hero.mana = Math.max(0, hero.mana - actionDef.mana);
    }

    // Set recovery time
    const now = Date.now();
    hero.recovery[hand] = now + (actionDef.recovery * 1000);

    // Handle different action types
    if (actionDef.effect) {
      return this.handleEffect(hero, actionDef, target, state);
    }

    // Standard attack
    if ('monster' in target && target.monster) {
      return this.performAttack(hero, actionDef, target.monsterAc || 10);
    }

    return { success: true };
  }

  // Perform attack roll
  private performAttack(
    hero: Hero,
    actionDef: ActionDef,
    targetAc: number
  ): { success: boolean; damage?: number; miss?: boolean } {
    const roll = rollD20();
    const toHit = actionDef.toHit || 0;
    const total = roll + toHit;

    // Critical hit on natural 20
    if (roll === 20) {
      const [min, max] = actionDef.damage || [1, 2];
      const damage = rollDamage(min, max) * 2; // Double damage
      return { success: true, damage };
    }

    // Critical miss on natural 1
    if (roll === 1) {
      return { success: true, damage: 0, miss: true };
    }

    // Check if hit
    if (total >= targetAc) {
      const [min, max] = actionDef.damage || [1, 2];
      const damage = rollDamage(min, max);
      return { success: true, damage };
    }

    // Miss
    return { success: true, damage: 0, miss: true };
  }

  // Handle special effects (healing, buffs, etc.)
  private handleEffect(
    hero: Hero,
    actionDef: ActionDef,
    target: any,
    state: GameState
  ): { success: boolean; effect?: string; healing?: number; damage?: number } {
    const effect = actionDef.effect || '';

    // Healing
    if (effect.includes('heal')) {
      const match = effect.match(/(\d+)-(\d+)/);
      if (match) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        const healing = rollDamage(min, max);

        // Find most hurt hero
        const heroes = Object.values(state.heroes);
        const mostHurt = heroes.reduce((prev, curr) => {
          const prevPercent = prev.hp / prev.maxHp;
          const currPercent = curr.hp / curr.maxHp;
          return currPercent < prevPercent ? curr : prev;
        });

        mostHurt.hp = Math.min(mostHurt.maxHp, mostHurt.hp + healing);
        return { success: true, effect: `Healed ${mostHurt.name} for ${healing}`, healing };
      }
    }

    // Frost bolt (ignores armour)
    if (effect.includes('frost bolt')) {
      const match = effect.match(/(\d+)-(\d+)/);
      if (match && 'monster' in target) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        const damage = rollDamage(min, max);
        return { success: true, damage, effect: 'Frost bolt ignores armour' };
      }
    }

    // Block (defensive buff)
    if (effect.includes('block')) {
      return { success: true, effect: '+4 AC, next hit halved' };
    }

    // Pocket sand (monster misses)
    if (effect.includes('pocket sand')) {
      return { success: true, effect: 'Monster will miss next attack' };
    }

    return { success: true, effect };
  }

  // Get action definition for hero
  private getActionDef(heroId: HeroId, hand: 'main' | 'off'): ActionDef | null {
    const heroActions = this.actionData[heroId];
    if (!heroActions) return null;
    return heroActions[hand];
  }

  // Get monster definition
  getMonsterDef(monsterType: string): MonsterDef | null {
    return this.monsterData[monsterType] || null;
  }

  // Get monster AC
  getMonsterAC(monsterType: string): number {
    return this.monstersAC[monsterType] || 10;
  }

  // Regenerate mana while walking
  regenerateMana(state: GameState): void {
    const stepsPerMana = 10;
    const manaToRegen = Math.floor(state.party.stepCount / stepsPerMana);
    
    if (manaToRegen > 0) {
      Object.values(state.heroes).forEach(hero => {
        if (hero.maxMana > 0) {
          hero.mana = Math.min(hero.maxMana, hero.mana + manaToRegen);
        }
      });
      state.party.stepCount = state.party.stepCount % stepsPerMana;
    }
  }

  // Check if action requires front row
  isActionMelee(heroId: HeroId, hand: 'main' | 'off'): boolean {
    const actionDef = this.getActionDef(heroId, hand);
    if (!actionDef) return false;
    
    return MELEE_ITEMS.includes(actionDef.item) && !actionDef.ranged;
  }

  // Get recovery remaining (in seconds)
  getRecoveryRemaining(hero: Hero, hand: 'main' | 'off'): number {
    const now = Date.now();
    const remaining = Math.max(0, hero.recovery[hand] - now);
    return remaining / 1000;
  }

  // Check if hero is recovering
  isRecovering(hero: Hero, hand: 'main' | 'off'): boolean {
    return this.getRecoveryRemaining(hero, hand) > 0;
  }
}

// Singleton instance
export const actionSystem = new ActionSystem();
