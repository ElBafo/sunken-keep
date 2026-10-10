import type {
  HabitId,
  HandRules,
  HeroId,
  HeroRules,
  MonsterBehavior,
  MonsterDef,
  RulesData
} from './types';
import { HERO_IDS } from './types';

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function pair(v: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(v) && v.length >= 2) return [num(v[0], fallback[0]), num(v[1], fallback[1])];
  return fallback;
}

function parseEvery(detail: string): number | undefined {
  const m = detail.match(/every\s+(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function parseSec(detail: string): number | undefined {
  const m = detail.match(/(\d+(?:\.\d+)?)s/);
  return m ? Number(m[1]) : undefined;
}

function parseRange(detail: string): [number, number] | undefined {
  const m = detail.match(/(\d+)\s*-\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

function parseChance(detail: string): number | undefined {
  const m = detail.match(/(\d+(?:\.\d+)?)%/);
  return m ? Number(m[1]) / 100 : undefined;
}

function parseDuration(detail: string): number | undefined {
  const m = detail.match(/for\s+(\d+(?:\.\d+)?)s/);
  return m ? Number(m[1]) : undefined;
}

function parseBehavior(kind: string, raw: Record<string, unknown>): MonsterBehavior {
  const b = asRecord(raw.behavior);
  const latch = asRecord(raw.latch);
  const habit = (typeof b.habit === 'string' ? b.habit : 'none') as HabitId;
  const detail = typeof b.detail === 'string' ? b.detail : '';
  const explicitSpecial =
    Array.isArray(b.specialDamage) && b.specialDamage.length >= 2
      ? (pair(b.specialDamage, [0, 0]) as [number, number])
      : undefined;
  const behavior: MonsterBehavior = {
    habit,
    detail,
    tell: typeof b.tell === 'string' ? b.tell : undefined,
    counter: typeof b.counter === 'string' ? b.counter : undefined
  };

  if (habit === 'latch') {
    behavior.chance = num(latch.chance, 0.25);
    behavior.latchDrain = num(latch.drainPerTurn, 1);
    behavior.latchTurns = num(latch.turns, 3);
  }
  if (habit === 'dart') {
    behavior.every = parseEvery(detail) ?? 3;
  }
  if (habit === 'wind_up') {
    behavior.every = parseEvery(detail) ?? 3;
    behavior.windup = parseSec(detail) ?? 1;
    behavior.specialDamage = explicitSpecial ?? parseRange(detail);
    behavior.block = /halve/i.test(String(b.counter ?? '')) ? 'halve' : 'negate';
  }
  if (habit === 'resist_blades') {
    behavior.halfDamage = ['axe', 'dagger', 'blade', 'pierce'];
    behavior.fullDamage = ['mace', 'blunt', 'frost'];
    const bonus = detail.match(/frost\s*\+(\d+)%/i);
    behavior.frostBonus = bonus ? Number(bonus[1]) / 100 : 0.25;
  }
  if (habit === 'web') {
    behavior.chance = parseChance(detail) ?? 0.25;
    behavior.duration = parseDuration(detail) ?? 3;
  }
  if (habit === 'boss_two_phase') {
    behavior.every = parseEvery(detail) ?? 3;
    behavior.windup = parseSec(detail) ?? 1.5;
    behavior.specialDamage = explicitSpecial ?? parseRange(detail);
    behavior.phaseHpFrac = /below\s+(\d+)%/i.test(detail)
      ? Number(detail.match(/below\s+(\d+)%/i)![1]) / 100
      : 0.5;
  }
  if (explicitSpecial) behavior.specialDamage = explicitSpecial;
  if (b.stationary === true) behavior.stationary = true;
  void kind;
  return behavior;
}

function handFrom(raw: unknown): HandRules {
  const o = asRecord(raw);
  const out: HandRules = {};
  if (typeof o.item === 'string') out.item = o.item;
  if (typeof o.toHit === 'number') out.toHit = o.toHit;
  if (Array.isArray(o.damage)) out.damage = pair(o.damage, [1, 1]);
  if (typeof o.recovery === 'number') out.recovery = o.recovery;
  if (typeof o.mana === 'number') out.mana = o.mana;
  if (typeof o.effect === 'string') out.effect = o.effect;
  if (typeof o.duration === 'number') out.duration = o.duration;
  if (typeof o.note === 'string') out.note = o.note;
  if (!out.damage && typeof o.effect === 'string') {
    const r = o.effect.match(/(\d+)\s*-\s*(\d+)/);
    if (r) out.damage = [Number(r[1]), Number(r[2])];
  }
  const attack = asRecord(o.attack);
  if (attack.toHit != null) out.toHit = num(attack.toHit, out.toHit ?? 0);
  if (attack.damage) out.damage = pair(attack.damage, out.damage ?? [1, 1]);
  if (attack.recovery != null) out.recovery = num(attack.recovery, out.recovery ?? 1);
  return out;
}

export function parseRules(actions: unknown, monsters: unknown): RulesData {
  const a = asRecord(actions);
  const m = asRecord(monsters);
  const heroes = {} as Record<HeroId, HeroRules>;
  for (const id of HERO_IDS) {
    const h = asRecord(a[id]);
    heroes[id] = {
      hp: num(h.hp, 20),
      ac: num(h.ac, 10),
      mana: typeof h.mana === 'number' ? h.mana : undefined,
      main: handFrom(h.main),
      off: handFrom(h.off)
    };
  }

  const formationRaw = asRecord(a.formation);
  const formation = {} as Record<HeroId, 'front' | 'back'>;
  for (const row of ['front', 'back'] as const) {
    const list = formationRaw[row];
    if (Array.isArray(list)) {
      for (const id of list) {
        if (HERO_IDS.includes(id as HeroId)) formation[id as HeroId] = row;
      }
    }
  }
  for (const id of HERO_IDS) if (!formation[id]) formation[id] = id === 'wren' || id === 'ilsevar' ? 'back' : 'front';

  const melee = Array.isArray(formationRaw.melee_items)
    ? (formationRaw.melee_items as string[])
    : ['axe', 'shield', 'mace', 'dagger', 'empty_hand'];

  const monsterAttack = asRecord(a.monster_attack);
  const toHit = num(monsterAttack.toHit, 4);

  const defs: Record<string, MonsterDef> = {};
  for (const [id, raw] of Object.entries(m)) {
    if (id.startsWith('_') || !raw || typeof raw !== 'object') continue;
    const o = asRecord(raw);
    if (typeof o.hp !== 'number') continue;
    defs[id] = {
      id,
      floor: typeof o.floor === 'number' ? o.floor : undefined,
      hp: num(o.hp, 1),
      damage: pair(o.damage, [1, 2]),
      ac: num(o.ac, 10),
      interval: num(o.interval, 2),
      toHit,
      boss: !!o.boss,
      behavior: parseBehavior(id, o)
    };
  }

  const prog = asRecord(a.progression);
  const per = asRecord(prog.per_level);
  const hpGain = asRecord(per.hp);
  const manaGain = asRecord(per.mana);
  const thresholdsRaw = asRecord(prog.level_thresholds);
  const thresholds: Record<number, number> = {};
  for (const [k, v] of Object.entries(thresholdsRaw)) {
    if (typeof v === 'number') thresholds[Number(k)] = v;
  }

  const potions = asRecord(a.potions);
  const items = asRecord(a.items);
  const itemHands: Record<string, HandRules> = {};
  for (const [id, raw] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    itemHands[id] = handFrom(raw);
  }

  return {
    heroes,
    emptyHand: handFrom(a.empty_hand),
    items: itemHands,
    meleeItems: melee,
    formation,
    monsterAttackToHit: toHit,
    monsters: defs,
    progression: {
      thresholds,
      hp: {
        brannoc: num(hpGain.brannoc, 6),
        mags: num(hpGain.mags, 5),
        wren: num(hpGain.wren, 5),
        ilsevar: num(hpGain.ilsevar, 4)
      },
      mana: {
        wren: num(manaGain.wren, 2),
        ilsevar: num(manaGain.ilsevar, 3)
      },
      perkLevels: [3, 5]
    },
    potions: {
      health: num(potions.health, 15),
      mana: num(potions.mana, 8),
      greenHeal: num(potions.greenHeal ?? potions.green, 5)
    }
  };
}

export function loadRulesFromJson(actionsJson: unknown, monstersJson: unknown): RulesData {
  return parseRules(actionsJson, monstersJson);
}
