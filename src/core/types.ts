export type HeroId = 'brannoc' | 'wren' | 'ilsevar' | 'mags';
export type HandSlot = 'main' | 'off';
export type FormationRow = 'front' | 'back';
export type DamageType = 'blade' | 'pierce' | 'blunt' | 'frost' | 'fire' | 'magic' | 'none';
export type MonsterAnim = 'idle' | 'attack' | 'hurt' | 'death' | 'windup';
export type HabitId =
  | 'latch'
  | 'dart'
  | 'wind_up'
  | 'resist_blades'
  | 'web'
  | 'boss_two_phase'
  | 'none';

export interface HeroRules {
  hp: number;
  ac: number;
  mana?: number;
  main: HandRules;
  off: HandRules;
}

export interface HandRules {
  item?: string;
  toHit?: number;
  damage?: [number, number];
  recovery?: number;
  mana?: number;
  effect?: string;
  duration?: number;
  note?: string;
}

export interface MonsterBehavior {
  habit: HabitId;
  detail?: string;
  tell?: string;
  counter?: string;
  every?: number;
  windup?: number;
  specialDamage?: [number, number];
  chance?: number;
  duration?: number;
  latchTurns?: number;
  latchDrain?: number;
  halfDamage?: string[];
  fullDamage?: string[];
  frostBonus?: number;
  phaseHpFrac?: number;
  block?: 'halve' | 'negate';
}

export interface MonsterDef {
  id: string;
  floor?: number;
  hp: number;
  damage: [number, number];
  ac: number;
  interval: number;
  toHit: number;
  boss?: boolean;
  behavior: MonsterBehavior;
}

export interface Progression {
  thresholds: Record<number, number>;
  hp: Record<HeroId, number>;
  mana: Record<string, number>;
  perkLevels: number[];
}

export interface PotionRules {
  health: number;
  mana: number;
  greenHeal: number;
}

export interface RulesData {
  heroes: Record<HeroId, HeroRules>;
  emptyHand: HandRules;
  items: Record<string, HandRules>;
  meleeItems: string[];
  formation: Record<HeroId, FormationRow>;
  monsterAttackToHit: number;
  monsters: Record<string, MonsterDef>;
  progression: Progression;
  potions: PotionRules;
}

export interface HeroState {
  id: HeroId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  ac: number;
  level: number;
  xp: number;
  formation: FormationRow;
  equipment: { main: string; off: string };
  recovery: { main: number; off: number };
  downed: boolean;
  webbedUntil: number;
  latched: boolean;
  latchTurnsLeft: number;
}

export interface MonsterState {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  noticed: boolean;
  attackCount: number;
  nextAttackAt: number;
  windup: null | { until: number; kind: 'pinch' | 'slam' | 'cleave'; sound: string };
  missNext: boolean;
  alive: boolean;
  deadAt: number;
}

export interface FightState {
  monsterId: string;
  startedAt: number;
}

export type CombatEvent =
  | { type: 'log'; key: string; vars?: Record<string, string | number> }
  | { type: 'sfx'; name: string; x?: number; y?: number; volume?: number; combat?: boolean; id?: string }
  | { type: 'sfx_stop'; name: string; id?: string }
  | { type: 'monster_anim'; id: string; anim: MonsterAnim }
  | { type: 'monster_move'; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: 'monster_dead'; id: string; x: number; y: number; kind: string }
  | { type: 'hero'; hero: HeroId }
  | { type: 'hero_hurt'; hero: HeroId; n: number }
  | { type: 'hero_down'; hero: HeroId }
  | { type: 'perk_pending'; hero: HeroId; level: number }
  | { type: 'hero_revive'; hero: HeroId }
  | { type: 'level_up'; hero: HeroId; level: number }
  | { type: 'perk_hook'; hero: HeroId; level: number }
  | { type: 'fight_start'; monsterId: string; kind: string }
  | { type: 'fight_end' }
  | { type: 'game_over' }
  | { type: 'hand_used'; hero: HeroId; hand: HandSlot; item: string }
  | { type: 'out_of_reach'; hero: HeroId; hand: HandSlot }
  | { type: 'denied'; hero: HeroId; reason: 'not_ready' | 'downed' | 'no_mana' | 'webbed' | 'heal_none' }
  | { type: 'shield_up'; hero: HeroId; until: number }
  | { type: 'leech_latch'; hero: HeroId }
  | { type: 'leech_off'; hero: HeroId }
  | { type: 'web'; hero: HeroId; until: number };

export interface Occupancy {
  walkable(x: number, y: number): boolean;
  blocked(x: number, y: number): boolean;
  inBounds(x: number, y: number): boolean;
  los(x0: number, y0: number, x1: number, y1: number): boolean;
  water?(x: number, y: number): boolean;
}

/** Shared hand-item → combat SFX map. Burnt torch swings like a torch; the hammer like an axe. */
export const ITEM_ACT_SFX: Record<string, string> = {
  axe: 'act_axe',
  shield: 'act_shield',
  iron_shield: 'act_shield',
  mace: 'act_mace',
  prayer_lantern: 'act_prayer',
  prayer_lantern_ember: 'act_prayer',
  wand: 'act_wand',
  scroll: 'act_scroll',
  dagger: 'act_dagger',
  tricks_pouch: 'act_tricks',
  empty_hand: 'act_punch',
  fist: 'act_punch',
  torch_lit: 'act_torch',
  torch_burnt: 'act_torch',
  ashmantle_hammer: 'act_axe'
};

export function itemActSfx(item: string): string {
  return ITEM_ACT_SFX[item] ?? 'act_punch';
}

export const HERO_IDS: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];

export const DAMAGE_TYPE: Record<string, DamageType> = {
  axe: 'blade',
  dagger: 'pierce',
  mace: 'blunt',
  empty_hand: 'blunt',
  fist: 'blunt',
  ashmantle_hammer: 'blunt',
  scroll: 'frost',
  wand: 'magic',
  torch_lit: 'fire',
  torch: 'fire',
  shield: 'none',
  iron_shield: 'none',
  prayer_lantern: 'none',
  prayer_lantern_ember: 'none',
  tricks_pouch: 'none'
};

/** Sound-file lengths used so the hit lands when the wind-up cue ends. */
export const WINDUP_SOUND_SEC: Record<string, number> = {
  rust_crab: 1.0,
  drowned_dwarf: 1.0,
  captain_dural: 1.3
};

export const WINDUP_SOUND: Record<string, string> = {
  rust_crab: 'rust_crab_windup',
  drowned_dwarf: 'drowned_dwarf_windup',
  captain_dural: 'dural_windup'
};

export const FIRST_SWING_SEC = 0.5;
export const NOTICE_RANGE = 5;
export const CHASE_STEP_SEC = 0.45;
export const MANA_STEPS = 10;
