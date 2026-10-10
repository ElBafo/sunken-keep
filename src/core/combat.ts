import { Rng } from './rng';
import type {
  CombatEvent,
  DamageType,
  FightState,
  HandSlot,
  HeroId,
  HeroState,
  HitKind,
  MonsterDef,
  MonsterState,
  Occupancy,
  RulesData
} from './types';
import {
  DAMAGE_TYPE,
  FIRST_SWING_SEC,
  HERO_IDS,
  itemActSfx,
  MANA_STEPS,
  NOTICE_RANGE,
  WINDUP_SOUND,
  WINDUP_SOUND_SEC
} from './types';

const DIRS: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

function damageType(item: string): DamageType {
  return DAMAGE_TYPE[item] ?? 'none';
}

function isRanged(item: string, note?: string): boolean {
  if (item === 'wand' || item === 'scroll') return true;
  return !!note && /ranged|back row/i.test(note);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export class CombatEngine {
  readonly data: RulesData;
  readonly rng: Rng;
  heroes: Record<HeroId, HeroState>;
  monsters: MonsterState[] = [];
  fight: FightState | null = null;
  gameOver = false;
  chaseEnabled = true;
  partyX = 0;
  partyY = 0;
  partyDir = 0;
  stepsWalked = 0;
  shieldUntil = 0;
  shieldHero: HeroId | null = null;
  halfNextUntil = 0;
  nextId = 1;
  private events: CombatEvent[] = [];
  private lastTick = 0;
  private chaseReadyAt = 0;
  private openMap: Occupancy | null = null;
  pendingPerks: Array<{ hero: HeroId; level: number }> = [];
  private notReadyAt: Partial<Record<HeroId, number>> = {};

  constructor(data: RulesData, rng: Rng) {
    this.data = data;
    this.rng = rng;
    this.heroes = this.makeParty();
  }

  private makeParty(): Record<HeroId, HeroState> {
    const out = {} as Record<HeroId, HeroState>;
    for (const id of HERO_IDS) {
      const src = this.data.heroes[id];
      out[id] = {
        id,
        hp: src.hp,
        maxHp: src.hp,
        mana: src.mana ?? 0,
        maxMana: src.mana ?? 0,
        ac: src.ac,
        level: 1,
        xp: 0,
        formation: this.data.formation[id],
        equipment: {
          main: src.main.item ?? 'empty_hand',
          off: src.off.item ?? 'empty_hand'
        },
        recovery: { main: 0, off: 0 },
        downed: false,
        webbedUntil: 0,
        latched: false,
        latchTurnsLeft: 0,
        pendingPerk: null
      };
    }
    return out;
  }

  resetParty() {
    this.heroes = this.makeParty();
    this.fight = null;
    this.gameOver = false;
    this.pendingPerks = [];
    this.shieldUntil = 0;
    this.shieldHero = null;
    this.halfNextUntil = 0;
    this.stepsWalked = 0;
  }

  setOccupancy(map: Occupancy) {
    this.openMap = map;
  }

  setChaseEnabled(on: boolean) {
    this.chaseEnabled = on;
  }

  setEquipment(id: HeroId, hand: HandSlot, item: string) {
    this.heroes[id].equipment[hand] = item;
  }

  setPartyPos(x: number, y: number, dir: number) {
    this.partyX = x;
    this.partyY = y;
    this.partyDir = dir;
  }

  noteStep(now: number) {
    if (this.fight) return;
    this.stepsWalked += 1;
    if (this.stepsWalked % MANA_STEPS === 0) {
      for (const id of HERO_IDS) {
        const h = this.heroes[id];
        if (h.maxMana > 0 && !h.downed) h.mana = Math.min(h.maxMana, h.mana + 1);
      }
    }
    void now;
  }

  spawnMonster(kind: string, x: number, y: number, hp?: number): MonsterState {
    const def = this.data.monsters[kind];
    const max = hp ?? def?.hp ?? 1;
    const m: MonsterState = {
      id: `${kind}-${this.nextId++}`,
      kind,
      x,
      y,
      hp: max,
      maxHp: max,
      noticed: false,
      attackCount: 0,
      nextAttackAt: 0,
      windup: null,
      missNext: false,
      alive: true,
      deadAt: 0
    };
    this.monsters.push(m);
    return m;
  }

  clearMonsters() {
    this.monsters = [];
    this.fight = null;
  }

  monsterAt(x: number, y: number): MonsterState | undefined {
    return this.monsters.find((m) => m.alive && m.x === x && m.y === y);
  }

  livingMonsters(): MonsterState[] {
    return this.monsters.filter((m) => m.alive);
  }

  def(kind: string): MonsterDef | undefined {
    return this.data.monsters[kind];
  }

  inCombat(): boolean {
    return !!this.fight;
  }

  facingPos(): { x: number; y: number } {
    const [dx, dy] = DIRS[this.partyDir & 3];
    return { x: this.partyX + dx, y: this.partyY + dy };
  }

  facingMonster(): MonsterState | undefined {
    const face = this.facingPos();
    return this.monsterAt(face.x, face.y);
  }

  adjacentMonster(): MonsterState | undefined {
    const faced = this.facingMonster();
    if (faced) return faced;
    for (const [dx, dy] of DIRS) {
      const m = this.monsterAt(this.partyX + dx, this.partyY + dy);
      if (m) return m;
    }
    return undefined;
  }

  /** Relative side of an adjacent monster. Front-only targeting uses `facingMonster`. */
  monsterSide(m: MonsterState): 'front' | 'left' | 'right' | 'behind' | null {
    const dx = m.x - this.partyX;
    const dy = m.y - this.partyY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    let monsterDir = 0;
    if (dx === 1) monsterDir = 1;
    else if (dx === -1) monsterDir = 3;
    else if (dy === 1) monsterDir = 2;
    const rel = (monsterDir - (this.partyDir & 3) + 4) & 3;
    return rel === 0 ? 'front' : rel === 1 ? 'right' : rel === 2 ? 'behind' : 'left';
  }

  partyState() {
    return {
      pendingPerks: this.pendingPerks.slice(),
      heroes: HERO_IDS.map((id) => {
        const h = this.heroes[id];
        return {
          id,
          hp: h.hp,
          maxHp: h.maxHp,
          mana: h.mana,
          maxMana: h.maxMana,
          level: h.level,
          xp: h.xp,
          pendingPerk: h.pendingPerk
        };
      })
    };
  }

  beginFight(monster: MonsterState, now: number): CombatEvent[] {
    this.events = [];
    if (this.gameOver) return [];
    if (this.fight?.monsterId === monster.id) return [];
    if (this.fight) this.endFight(now);
    this.fight = { monsterId: monster.id, startedAt: now };
    monster.noticed = true;
    monster.nextAttackAt = now + FIRST_SWING_SEC;
    monster.windup = null;
    this.emit({ type: 'fight_start', monsterId: monster.id, kind: monster.kind });
    this.emit({ type: 'sfx', name: `${monster.kind}_alert`, x: monster.x, y: monster.y, combat: true });
    return this.flush();
  }

  tryEngage(now: number): CombatEvent[] {
    const m = this.adjacentMonster();
    if (!m || this.gameOver) return [];
    if (this.fight?.monsterId === m.id) return [];
    return this.beginFight(m, now);
  }

  bump(x: number, y: number, now: number): CombatEvent[] {
    const m = this.monsterAt(x, y);
    if (!m) return [];
    return this.beginFight(m, now);
  }

  private emit(e: CombatEvent) {
    this.events.push(e);
  }

  private flush(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private living(row?: 'front' | 'back'): HeroState[] {
    return HERO_IDS.map((id) => this.heroes[id]).filter((h) => {
      if (h.downed || h.hp <= 0) return false;
      if (row && h.formation !== row) return false;
      return true;
    });
  }

  private pickHeroTarget(preferBack = false): HeroState | null {
    return this.pickStandingHero(preferBack);
  }

  private pickStandingHero(preferBack = false): HeroState | null {
    const back = this.living('back');
    const front = this.living('front');
    if (preferBack && back.length) return this.rng.pick(back);
    if (front.length) return this.rng.pick(front);
    if (back.length) return this.rng.pick(back);
    return null;
  }

  private isStationary(m: MonsterState): boolean {
    return !!this.def(m.kind)?.behavior.stationary;
  }

  private heroAc(h: HeroState, now: number): number {
    let ac = h.ac;
    if (this.shieldHero === h.id && now < this.shieldUntil) ac += 4;
    return ac;
  }

  private toHitBonus(level: number): number {
    return Math.floor((level - 1) / 2);
  }

  private damageScale(level: number): number {
    return 1 + 0.1 * (level - 1);
  }

  private handRules(hero: HeroState, hand: HandSlot, item: string) {
    const src = this.data.heroes[hero.id][hand];
    if (item === 'empty_hand' || item === 'fist') return this.data.emptyHand;
    if (item === 'torch_lit' || item === 'torch') return this.data.items.torch ?? { toHit: 2, damage: [1, 3] as [number, number], recovery: 2 };
    if (item === 'ashmantle_hammer') return this.data.items.ashmantle_hammer ?? src;
    return src;
  }

  private isMelee(item: string): boolean {
    const key = item === 'fist' ? 'empty_hand' : item === 'torch_lit' ? 'empty_hand' : item;
    if (item === 'torch_lit' || item === 'torch_burnt') return true;
    return this.data.meleeItems.includes(key) || this.data.meleeItems.includes(item);
  }

  private resistMul(kind: string, item: string): number {
    const b = this.def(kind)?.behavior;
    if (!b || b.habit !== 'resist_blades') return 1;
    const dtype = damageType(item);
    if (dtype === 'frost' || item === 'scroll' || item === 'wand') return 1 + (b.frostBonus ?? 0.25);
    if (dtype === 'blade' || dtype === 'pierce' || b.halfDamage?.includes(item)) return 0.5;
    return 1;
  }

  private hitKind(crit: boolean, mul: number): HitKind {
    if (crit) return 'crit';
    if (mul < 1) return 'resist';
    if (mul > 1) return 'weak';
    return 'hit';
  }

  private hitSfx(kind: HitKind): string {
    if (kind === 'crit') return 'hit_crit';
    if (kind === 'resist') return 'hit_resist';
    if (kind === 'weak') return 'hit_weak';
    return 'hit';
  }

  private applyDamageToHero(h: HeroState, raw: number, now: number, opts?: { ignoreHalf?: boolean }): number {
    if (h.downed || h.hp <= 0) return 0;
    let n = Math.max(0, Math.floor(raw));
    if (!opts?.ignoreHalf && now < this.halfNextUntil && n > 0) {
      n = Math.max(1, Math.floor(n / 2));
      this.halfNextUntil = 0;
      this.emit({ type: 'log', key: 'block_hit', vars: { n } });
    }
    h.hp = Math.max(0, h.hp - n);
    this.emit({ type: 'hero', hero: h.id });
    if (n > 0 && h.hp > 0) this.emit({ type: 'hero_hurt', hero: h.id, n });
    if (h.hp <= 0 && !h.downed) {
      h.downed = true;
      h.hp = 0;
      this.emit({ type: 'hero_down', hero: h.id });
      this.emit({ type: 'log', key: 'hero_down', vars: { hero: h.id } });
      this.emit({ type: 'sfx', name: 'hero_down', combat: true });
      this.checkWipe();
    }
    return n;
  }

  private checkWipe() {
    if (HERO_IDS.every((id) => this.heroes[id].downed || this.heroes[id].hp <= 0)) {
      this.gameOver = true;
      this.fight = null;
      this.emit({ type: 'game_over' });
      this.emit({ type: 'log', key: 'party_dead' });
    }
  }

  private grantXp(amount: number, now: number) {
    this.emit({ type: 'log', key: 'xp_gain', vars: { n: amount } });
    for (const id of HERO_IDS) {
      const h = this.heroes[id];
      h.xp += amount;
      this.tryLevel(h, now);
    }
  }

  private tryLevel(h: HeroState, now: number) {
    const th = this.data.progression.thresholds;
    while (true) {
      const next = h.level + 1;
      const need = th[next];
      if (need == null || h.xp < need) break;
      h.level = next;
      const addHp = this.data.progression.hp[h.id] ?? 0;
      h.maxHp += addHp;
      h.hp += addHp;
      const addMana = this.data.progression.mana[h.id] ?? 0;
      if (addMana) {
        h.maxMana += addMana;
        h.mana += addMana;
      }
      this.emit({ type: 'level_up', hero: h.id, level: h.level });
      this.emit({ type: 'log', key: 'level_up', vars: { hero: h.id, n: h.level } });
      this.emit({ type: 'sfx', name: 'level_up', combat: true });
      if (this.data.progression.perkLevels.includes(h.level)) {
        this.pendingPerks.push({ hero: h.id, level: h.level });
        h.pendingPerk = h.level;
        this.emit({ type: 'perk_pending', hero: h.id, level: h.level });
      }
    }
    void now;
  }

  private killMonster(m: MonsterState, now: number) {
    m.alive = false;
    m.hp = 0;
    m.deadAt = now;
    if (m.windup) {
      this.emit({ type: 'sfx_stop', name: m.windup.sound, id: m.id });
      m.windup = null;
    }
    this.emit({ type: 'monster_anim', id: m.id, anim: 'death' });
    this.emit({ type: 'monster_dead', id: m.id, x: m.x, y: m.y, kind: m.kind });
    this.emit({ type: 'sfx', name: `${m.kind}_death`, x: m.x, y: m.y, combat: true, id: m.id });
    const inWater = !!this.openMap?.water?.(m.x, m.y);
    this.emit({ type: 'log', key: inWater ? 'monster_dies' : 'monster_dies_dry', vars: { monster: m.kind } });
    for (const id of HERO_IDS) {
      const h = this.heroes[id];
      if (h.latched && m.kind === 'bog_leeches') this.clearLatch(h);
    }
    this.grantXp(m.maxHp, now);
    if (this.fight?.monsterId === m.id) this.endFight(now);
  }

  debugLatch(id: HeroId, turns = 3) {
    const h = this.heroes[id];
    h.latched = true;
    h.latchTurnsLeft = turns;
  }

  debugAddXp(amount: number, now = 0) {
    this.events = [];
    this.grantXp(amount, now);
    return this.flush();
  }

  private clearLatch(h: HeroState) {
    if (!h.latched) return;
    h.latched = false;
    h.latchTurnsLeft = 0;
    this.emit({ type: 'leech_off', hero: h.id });
    this.emit({ type: 'log', key: 'leech_off', vars: { hero: h.id } });
  }

  endFight(now: number) {
    if (!this.fight) return;
    this.fight = null;
    this.emit({ type: 'fight_end' });
    if (this.pendingPerks.length) {
      for (const p of this.pendingPerks) this.emit({ type: 'perk_hook', hero: p.hero, level: p.level });
    }
    for (const id of HERO_IDS) {
      const h = this.heroes[id];
      if (h.downed || h.hp <= 0) {
        h.downed = false;
        h.hp = 1;
        this.emit({ type: 'hero_revive', hero: h.id });
        this.emit({ type: 'log', key: 'get_up_after_fight', vars: { hero: h.id } });
        this.emit({ type: 'sfx', name: 'hero_revive', combat: true });
      }
    }
    void now;
  }

  finishFight(now: number): CombatEvent[] {
    this.events = [];
    this.endFight(now);
    return this.flush();
  }

  useHand(heroId: HeroId, hand: HandSlot, now: number, itemOverride?: string): CombatEvent[] {
    this.events = [];
    const hero = this.heroes[heroId];
    if (!hero) return [];
    if (this.gameOver) return this.flush();
    if (hero.downed || hero.hp <= 0) {
      this.emit({ type: 'denied', hero: heroId, reason: 'downed' });
      return this.flush();
    }
    if (now < hero.webbedUntil) {
      this.emit({ type: 'denied', hero: heroId, reason: 'webbed' });
      this.emit({ type: 'log', key: 'webbed', vars: { hero: heroId } });
      return this.flush();
    }
    if (now < hero.recovery[hand]) {
      this.emit({ type: 'denied', hero: heroId, reason: 'not_ready' });
      if (this.fight) {
        const last = this.notReadyAt[heroId] ?? -99;
        if (now - last >= 1.5) {
          this.notReadyAt[heroId] = now;
          this.emit({ type: 'log', key: 'not_ready', vars: { hero: heroId } });
        }
      }
      return this.flush();
    }

    const item = itemOverride ?? hero.equipment[hand];
    const rules = this.handRules(hero, hand, item);
    const melee = this.isMelee(item) && !isRanged(item, rules.note);
    if (melee && hero.formation === 'back') {
      this.emit({ type: 'out_of_reach', hero: heroId, hand });
      this.emit({ type: 'log', key: 'out_of_reach', vars: { hero: heroId } });
      return this.flush();
    }

    if (item === 'shield' || item === 'iron_shield') {
      hero.recovery[hand] = now + (rules.recovery ?? 6);
      this.shieldUntil = now + (rules.duration ?? 4);
      this.shieldHero = heroId;
      this.halfNextUntil = this.shieldUntil;
      this.emit({ type: 'hand_used', hero: heroId, hand, item });
      this.emit({ type: 'shield_up', hero: heroId, until: this.shieldUntil });
      this.emit({ type: 'log', key: 'block_raise', vars: { hero: heroId } });
      this.emit({ type: 'sfx', name: 'act_shield', combat: true });
      return this.flush();
    }

    if (item === 'prayer_lantern' || item === 'prayer_lantern_ember') {
      const cost = rules.mana ?? 4;
      const hurt = HERO_IDS.map((id) => this.heroes[id])
        .filter((h) => h.hp < h.maxHp || h.downed)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      if (!hurt.length) {
        this.emit({ type: 'denied', hero: heroId, reason: 'heal_none' });
        this.emit({ type: 'log', key: 'heal_none' });
        return this.flush();
      }
      if (hero.mana < cost) {
        this.emit({ type: 'denied', hero: heroId, reason: 'no_mana' });
        this.emit({ type: 'log', key: 'no_mana', vars: { hero: heroId } });
        this.emit({ type: 'sfx', name: 'mana_empty' });
        return this.flush();
      }
      hero.mana -= cost;
      hero.recovery[hand] = now + (rules.recovery ?? 5);
      const [lo, hi] = rules.damage ?? [6, 10];
      const heal = this.rng.int(lo, hi);
      const t = hurt[0];
      const wasDown = t.downed || t.hp <= 0;
      t.hp = clamp(t.hp + heal, 0, t.maxHp);
      if (t.hp > 0) t.downed = false;
      this.emit({ type: 'hand_used', hero: heroId, hand, item });
      this.emit({ type: 'log', key: 'heal', vars: { target: t.id, n: heal } });
      this.emit({ type: 'sfx', name: 'act_prayer', combat: true });
      if (wasDown) {
        this.emit({ type: 'hero_revive', hero: t.id });
        this.emit({ type: 'log', key: 'revive', vars: { hero: t.id } });
        this.emit({ type: 'sfx', name: 'hero_revive', combat: true });
      }
      return this.flush();
    }

    if (item === 'tricks_pouch') {
      hero.recovery[hand] = now + (rules.recovery ?? 8);
      const foe = this.fightMonster();
      this.emit({ type: 'hand_used', hero: heroId, hand, item });
      this.emit({ type: 'sfx', name: 'act_tricks', combat: true });
      if (foe) {
        foe.missNext = true;
        if (foe.windup) {
          this.emit({ type: 'sfx_stop', name: foe.windup.sound, id: foe.id });
          foe.windup = null;
          foe.nextAttackAt = now + (this.def(foe.kind)?.interval ?? 2);
        }
        this.emit({ type: 'log', key: 'pocket_sand' });
      }
      return this.flush();
    }

    const target = this.facingMonster();
    const actSfx = itemActSfx(item);
    const isPunch = item === 'empty_hand' || item === 'fist';

    if (!target) {
      hero.recovery[hand] = now + (rules.recovery ?? 1.5);
      this.emit({ type: 'hand_used', hero: heroId, hand, item });
      if (isPunch) {
        this.emit({ type: 'sfx', name: actSfx, combat: true });
        this.emit({ type: 'log', key: 'punch_air', vars: { hero: heroId } });
      } else {
        this.emit({ type: 'sfx', name: actSfx, combat: true });
        this.emit({ type: 'sfx', name: 'act_miss', combat: true });
        this.emit({ type: 'log', key: 'miss', vars: { hero: heroId } });
      }
      return this.flush();
    }

    if ((item === 'scroll' || item === 'wand') && (rules.mana ?? 0) > 0) {
      const cost = rules.mana ?? 0;
      if (hero.mana < cost) {
        this.emit({ type: 'denied', hero: heroId, reason: 'no_mana' });
        this.emit({ type: 'log', key: 'no_mana', vars: { hero: heroId } });
        this.emit({ type: 'sfx', name: 'mana_empty' });
        return this.flush();
      }
      if (item === 'scroll') hero.mana -= cost;
    }

    this.emit({ type: 'sfx', name: actSfx, combat: true });

    const toHit = (rules.toHit ?? 2) + this.toHitBonus(hero.level);
    const [dlo, dhi] = rules.damage ?? [1, 2];
    const ignoreAc = item === 'scroll';
    const roll = this.rng.d20();
    const crit = roll === 20;
    const fumble = roll === 1;
    const hit = crit || (!fumble && (ignoreAc || roll + toHit >= (this.def(target.kind)?.ac ?? 10)));
    hero.recovery[hand] = now + (rules.recovery ?? 2);

    this.emit({ type: 'hand_used', hero: heroId, hand, item });

    if (!hit) {
      this.emit({ type: 'log', key: 'miss', vars: { hero: heroId } });
      this.emit({ type: 'sfx', name: 'act_miss', combat: true });
      return this.flush();
    }

    let dmg = Math.max(1, Math.round(this.rng.int(dlo, dhi) * this.damageScale(hero.level)));
    if (crit) dmg *= 2;
    const mul = this.resistMul(target.kind, item);
    dmg = Math.max(1, Math.floor(dmg * mul));
    target.hp -= dmg;
    const kind = this.hitKind(crit, mul);
    if (kind !== 'resist') this.emit({ type: 'monster_anim', id: target.id, anim: 'hurt' });
    this.emit({ type: 'sfx', name: `${target.kind}_hurt`, x: target.x, y: target.y, combat: true });
    this.emit({
      type: 'hit_type',
      kind,
      id: target.id,
      x: target.x,
      y: target.y,
      monster: target.kind
    });
    if (item === 'scroll') {
      this.emit({ type: 'log', key: 'frost_bolt', vars: { n: dmg } });
    } else if (item === 'torch_lit') {
      this.emit({ type: 'log', key: 'torch_hit', vars: { hero: heroId, monster: target.kind, n: dmg } });
    } else if (crit) {
      this.emit({ type: 'log', key: 'crit', vars: { hero: heroId, n: dmg } });
    } else {
      this.emit({ type: 'log', key: 'hit', vars: { hero: heroId, monster: target.kind, n: dmg } });
    }
    this.emit({ type: 'sfx', name: this.hitSfx(kind), x: target.x, y: target.y, combat: true });

    if (damageType(item) === 'fire') {
      for (const id of HERO_IDS) {
        if (this.heroes[id].latched) {
          this.clearLatch(this.heroes[id]);
          this.emit({ type: 'log', key: 'leech_burned' });
        }
      }
    }

    if (target.hp <= 0) this.killMonster(target, now);
    return this.flush();
  }

  usePotion(heroId: HeroId, kind: 'red' | 'blue' | 'green', now: number): CombatEvent[] {
    this.events = [];
    const h = this.heroes[heroId];
    if (!h || this.gameOver) return [];
    if (kind === 'red') {
      const wasDown = h.downed || h.hp <= 0;
      if (h.hp >= h.maxHp && !wasDown) {
        this.emit({ type: 'log', key: 'full_health', vars: { hero: heroId } });
        return this.flush();
      }
      const n = this.data.potions.health;
      h.hp = clamp(h.hp + n, 0, h.maxHp);
      if (h.hp > 0) h.downed = false;
      this.emit({ type: 'log', key: 'drink_potion', vars: { hero: heroId, n } });
      this.emit({ type: 'sfx', name: 'potion', combat: true });
      if (wasDown) {
        this.emit({ type: 'hero_revive', hero: heroId });
        this.emit({ type: 'log', key: 'revive', vars: { hero: heroId } });
        this.emit({ type: 'sfx', name: 'hero_revive', combat: true });
      }
    } else if (kind === 'blue') {
      if (h.maxMana <= 0) {
        this.emit({ type: 'log', key: 'no_mana_pool', vars: { hero: heroId } });
        return this.flush();
      }
      const n = this.data.potions.mana;
      h.mana = clamp(h.mana + n, 0, h.maxMana);
      this.emit({ type: 'log', key: 'drink_mana', vars: { hero: heroId, n } });
      this.emit({ type: 'sfx', name: 'potion', combat: true });
    } else {
      const n = this.data.potions.greenHeal;
      h.hp = clamp(h.hp + n, 0, h.maxHp);
      if (h.latched) this.clearLatch(h);
      this.emit({ type: 'log', key: 'drink_green', vars: { hero: heroId, n } });
      this.emit({ type: 'sfx', name: 'potion', combat: true });
      this.emit({ type: 'sfx', name: 'bog_leeches_hurt', combat: true });
    }
    void now;
    return this.flush();
  }

  fightMonster(): MonsterState | undefined {
    if (!this.fight) return undefined;
    return this.monsters.find((m) => m.id === this.fight!.monsterId && m.alive);
  }

  tick(now: number): CombatEvent[] {
    this.events = [];
    if (this.gameOver) return this.flush();
    const dt = this.lastTick ? now - this.lastTick : 0;
    this.lastTick = now;
    void dt;

    if (this.chaseEnabled) this.tickNotice(now);

    const foe = this.fightMonster();
    if (this.fight && !foe) this.endFight(now);
    if (foe) this.tickFight(foe, now);

    for (const h of Object.values(this.heroes)) {
      if (h.latched && !this.livingMonsters().some((m) => m.kind === 'bog_leeches')) this.clearLatch(h);
    }

    if (this.fight && !this.adjacentMonster() && this.chaseEnabled) {
      const still = this.fightMonster();
      if (still && manhattan(still.x, still.y, this.partyX, this.partyY) > 1) this.endFight(now);
    }

    return this.flush();
  }

  private tickNotice(now: number) {
    for (const m of this.livingMonsters()) {
      const dist = manhattan(m.x, m.y, this.partyX, this.partyY);
      if (dist <= NOTICE_RANGE && this.hasLos(m.x, m.y, this.partyX, this.partyY)) {
        if (!m.noticed) {
          m.noticed = true;
          this.emit({ type: 'sfx', name: `${m.kind}_alert`, x: m.x, y: m.y, combat: true });
          this.emit({ type: 'log', key: 'monster_near' });
        }
        if (dist === 1 && !this.fight) this.beginFight(m, now);
      }
    }
    if (this.fight) return;
    if (now < this.chaseReadyAt) return;
    this.chaseReadyAt = now + 0.45;
    for (const m of this.livingMonsters()) {
      if (this.isStationary(m)) continue;
      if (!m.noticed) continue;
      const dist = manhattan(m.x, m.y, this.partyX, this.partyY);
      if (dist <= 1) continue;
      const step = this.stepToward(m.x, m.y, this.partyX, this.partyY);
      if (!step) continue;
      if (this.monsterAt(step.x, step.y)) continue;
      if (step.x === this.partyX && step.y === this.partyY) continue;
      if (this.openMap && !this.openMap.walkable(step.x, step.y)) continue;
      const from = { x: m.x, y: m.y };
      m.x = step.x;
      m.y = step.y;
      this.emit({ type: 'monster_move', id: m.id, from, to: { x: m.x, y: m.y } });
      if (manhattan(m.x, m.y, this.partyX, this.partyY) === 1) this.beginFight(m, now);
    }
  }

  private hasLos(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.openMap) return this.openMap.los(x0, y0, x1, y1);
    return true;
  }

  private stepToward(x: number, y: number, tx: number, ty: number): { x: number; y: number } | null {
    const dx = Math.sign(tx - x);
    const dy = Math.sign(ty - y);
    const first = Math.abs(tx - x) >= Math.abs(ty - y) ? { x: x + dx, y } : { x, y: y + dy };
    const second = Math.abs(tx - x) >= Math.abs(ty - y) ? { x, y: y + dy } : { x: x + dx, y };
    for (const p of [first, second]) {
      if (p.x === x && p.y === y) continue;
      if (this.openMap && !this.openMap.walkable(p.x, p.y)) continue;
      return p;
    }
    return null;
  }

  private tickFight(m: MonsterState, now: number) {
    if (m.windup && now >= m.windup.until) {
      const kind = m.windup.kind;
      m.windup = null;
      this.resolveMonsterStrike(m, now, kind);
    }
    if (m.windup) return;
    if (now < m.nextAttackAt) return;
    const def = this.def(m.kind);
    if (!def) return;
    m.nextAttackAt = now + def.interval;
    m.attackCount += 1;

    if (m.missNext) {
      m.missNext = false;
      this.emit({ type: 'log', key: 'sand_miss' });
      this.emit({ type: 'sfx', name: 'act_miss', combat: true });
      return;
    }

    const b = def.behavior;
    const nth = b.every ?? 3;
    const special = b.every != null && m.attackCount % nth === 0;

    if (b.habit === 'wind_up' && special) {
      this.startWindup(m, now, m.kind === 'drowned_dwarf' ? 'slam' : 'pinch');
      return;
    }
    if (b.habit === 'boss_two_phase' && special && m.hp / m.maxHp <= (b.phaseHpFrac ?? 0.5)) {
      this.startWindup(m, now, 'cleave');
      return;
    }

    this.resolveMonsterStrike(m, now, b.habit === 'dart' && special ? 'dart' : 'normal');
  }

  private startWindup(m: MonsterState, now: number, kind: 'pinch' | 'slam' | 'cleave') {
    const sound = WINDUP_SOUND[m.kind] ?? `${m.kind}_windup`;
    const dur = WINDUP_SOUND_SEC[m.kind] ?? this.def(m.kind)?.behavior.windup ?? 1;
    m.windup = { until: now + dur, kind, sound };
    this.emit({ type: 'monster_anim', id: m.id, anim: 'windup' });
    this.emit({ type: 'sfx', name: sound, x: m.x, y: m.y, combat: true, volume: 1, id: m.id });
  }

  private resolveMonsterStrike(
    m: MonsterState,
    now: number,
    kind: 'normal' | 'dart' | 'pinch' | 'slam' | 'cleave'
  ) {
    const def = this.def(m.kind);
    if (!def) return;
    const side = this.monsterSide(m);
    if (side && side !== 'front') {
      this.emit({ type: 'log', key: `monster_flank_${side}`, vars: { monster: m.kind } });
      this.emit({ type: 'flank', side });
    }
    const attackSfx = m.kind === 'captain_dural' ? 'drowned_dwarf_attack' : `${m.kind}_attack`;
    this.emit({ type: 'monster_anim', id: m.id, anim: 'attack' });
    this.emit({ type: 'sfx', name: attackSfx, x: m.x, y: m.y, combat: true });

    if (kind === 'cleave') {
      const [lo, hi] = def.behavior.specialDamage ?? def.damage;
      for (const t of this.living('front')) this.monsterHitHero(m, t, now, this.rng.int(lo, hi), false);
      if (!this.living('front').length) {
        const t = this.pickHeroTarget();
        if (t) this.monsterHitHero(m, t, now, this.rng.int(lo, hi), false);
      }
      return;
    }

    const preferBack = kind === 'dart';
    const target = this.pickStandingHero(preferBack);
    if (!target) return;

    if (kind === 'pinch' || kind === 'slam') {
      const [lo, hi] = def.behavior.specialDamage ?? def.damage;
      let dmg = this.rng.int(lo, hi);
      const shielded = this.shieldHero && now < this.shieldUntil;
      if (kind === 'pinch' && shielded && def.behavior.block === 'halve') {
        dmg = Math.max(1, Math.floor(dmg / 2));
        this.emit({ type: 'log', key: 'block_hit', vars: { n: dmg } });
        const dealt = this.applyDamageToHero(target, dmg, now, { ignoreHalf: true });
        this.emit({ type: 'log', key: 'monster_hit', vars: { monster: m.kind, hero: target.id, n: dealt } });
        if (dealt > 0) this.emit({ type: 'sfx', name: 'hurt', combat: true });
        return;
      }
      this.monsterHitHero(m, target, now, dmg, false);
      return;
    }

    const roll = this.rng.d20();
    const crit = roll === 20;
    const fumble = roll === 1;
    const hit = crit || (!fumble && roll + def.toHit >= this.heroAc(target, now));
    if (!hit) {
      this.emit({ type: 'log', key: 'dodge', vars: { hero: target.id } });
      this.emit({ type: 'sfx', name: 'act_miss', combat: true });
      return;
    }
    let [lo, hi] = def.damage;
    let dmg = this.rng.int(lo, hi);
    if (crit) dmg *= 2;
    this.monsterHitHero(m, target, now, dmg, true);
  }

  private monsterHitHero(m: MonsterState, target: HeroState, now: number, dmg: number, canLatch: boolean) {
    if (target.downed || target.hp <= 0) {
      const other = this.pickStandingHero();
      if (!other) return;
      target = other;
    }
    const dealt = this.applyDamageToHero(target, dmg, now);
    this.emit({ type: 'log', key: 'monster_hit', vars: { monster: m.kind, hero: target.id, n: dealt } });
    if (dealt > 0) this.emit({ type: 'sfx', name: 'hurt', combat: true });
    const b = this.def(m.kind)?.behavior;
    if (canLatch && b?.habit === 'latch' && !target.downed && this.rng.chance(b.chance ?? 0.25)) {
      target.latched = true;
      target.latchTurnsLeft = b.latchTurns ?? 3;
      this.emit({ type: 'leech_latch', hero: target.id });
      this.emit({ type: 'log', key: 'leech_latch', vars: { hero: target.id } });
    }
    if (b?.habit === 'web' && !target.downed && this.rng.chance(b.chance ?? 0.25)) {
      target.webbedUntil = now + (b.duration ?? 3);
      this.emit({ type: 'web', hero: target.id, until: target.webbedUntil });
    }
    if (target.latched && b?.habit === 'latch') {
      const drain = b.latchDrain ?? 1;
      target.latchTurnsLeft -= 1;
      if (drain > 0 && !target.downed) {
        this.applyDamageToHero(target, drain, now, { ignoreHalf: true });
        this.emit({ type: 'log', key: 'leech_drain', vars: { hero: target.id, n: drain } });
        this.emit({ type: 'sfx', name: 'bog_leeches_attack', volume: 0.4, combat: true });
      }
      if (target.latchTurnsLeft <= 0) this.clearLatch(target);
    }
  }

  forceWipe(): CombatEvent[] {
    this.events = [];
    for (const id of HERO_IDS) {
      const h = this.heroes[id];
      h.hp = 0;
      if (!h.downed) {
        h.downed = true;
        this.emit({ type: 'hero_down', hero: id });
      }
    }
    this.checkWipe();
    return this.flush();
  }

  /** Test helper: set a hero's HP without going through a swing. */
  debugSetHp(id: HeroId, hp: number) {
    const h = this.heroes[id];
    h.hp = clamp(Math.floor(hp), 0, h.maxHp);
    h.downed = h.hp <= 0;
  }
}

export function openGrid(
  blocked: (x: number, y: number) => boolean,
  w: number,
  h: number,
  water?: (x: number, y: number) => boolean
): Occupancy {
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  return {
    inBounds,
    blocked: (x, y) => !inBounds(x, y) || blocked(x, y),
    walkable: (x, y) => inBounds(x, y) && !blocked(x, y),
    water: water ? (x, y) => !!water(x, y) : undefined,
    los(x0, y0, x1, y1) {
      let x = x0;
      let y = y0;
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      while (x !== x1 || y !== y1) {
        if (x !== x1) x += dx;
        if (y !== y1) y += dy;
        if (x === x1 && y === y1) return true;
        if (!inBounds(x, y) || blocked(x, y)) return false;
      }
      return true;
    }
  };
}
