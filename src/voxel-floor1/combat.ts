import {
  CombatEngine,
  HERO_IDS,
  openGrid,
  parseRules,
  Rng,
  type CombatEvent,
  type HandSlot,
  type HeroId,
  type HeroState,
  type Occupancy,
  type RulesData
} from '../core';
import type { SavedHero, SavedMonster } from '../proto3d/saves';
import { isSlimeKind, takeSlimeFrostBark } from '../core/slime-frost';
import { fetchJsonCached } from '../proto3d/asset-cache';
import { floor1 as classicFloor1 } from '../proto3d/floor-data';
import type { FloorData } from '../proto3d/types';
import { canCross, floor1Map, isWalkableTile, isWaterCell, tileAt, type FloorMap } from './layout';

/** Same two-choice lists as Classic `art/ui/perks/perks.json`. */
export const FLOOR1_PERK_CHOICES: Record<HeroId, Record<3 | 5, [string, string]>> = {
  brannoc: { 3: ['shield_wall', 'cleave'], 5: ['stubborn', 'heavy_swing'] },
  mags: { 3: ['quick_hands', 'dirty_tricks'], 5: ['backstab', 'light_fingers'] },
  wren: { 3: ['mercy', 'steady_flame'], 5: ['sanctuary', 'ember_ward'] },
  ilsevar: { 3: ['deep_frost', 'tidecaller'], 5: ['shatter', 'cold_blood'] }
};

export type FloorMonsterSpawn = {
  x: number;
  y: number;
  kind: string;
  split?: boolean;
};

export type CombatLogVars = Record<string, string | number>;

export type Floor1CombatHooks = {
  pushLog: (text: string) => void;
  storyLog: (key: string, vars?: CombatLogVars) => string;
  heroName: (id: string) => string;
  monsterName: (id: string) => string;
  playCombat: (name: string, volume?: number, x?: number, y?: number, id?: string) => void;
  playUi: (name: string) => void;
  playHeroHurt: (hero: HeroId, nowSec: number) => void;
  playHeroDown: (hero: HeroId) => void;
  setFightDuck: (on: boolean) => void;
  stopWindup: (id?: string) => void;
  noteOpen?: () => boolean;
  onMonsterMove?: (id: string, from: { x: number; y: number }, to: { x: number; y: number }) => void;
  onMonsterAnim?: (id: string, anim: string) => void;
  onMonsterDead?: (id: string, x: number, y: number, kind: string) => void;
  onSlimeSplit?: (event: Extract<CombatEvent, { type: 'slime_split' }>) => void;
  onHitType?: (id: string, kind: string, monster: string) => void;
  onGameOver?: () => void;
  onHudSync?: () => void;
  onLevelUp?: (hero: HeroId, level: number) => void;
  onPerkPending?: (hero: HeroId, level: number) => void;
  onPerkHook?: (hero: HeroId, level: number) => void;
  onFlank?: (side: 'left' | 'right' | 'behind') => void;
  onFightStart?: () => void;
  onFightEnd?: () => void;
  onSlimeFrostResist?: () => void;
  onArmFrostHint?: () => void;
  dismissFrostHint?: () => void;
};

export function parseCombatSearch(search: string): { test: boolean; combat: boolean; seed: number } {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const seedRaw = q.get('seed');
  const seed =
    seedRaw != null && seedRaw !== '' && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : Date.now() >>> 0;
  return {
    test: q.get('test') === '1',
    combat: q.get('combat') === '1',
    seed
  };
}

/** Same cells as Classic after the water-hall leech move off the locked door. */
export function classicFloor1Monsters(floor: FloorData = classicFloor1): FloorMonsterSpawn[] {
  const out: FloorMonsterSpawn[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.tiles[y][x];
      if (!tile.monster) continue;
      out.push({ x, y, kind: tile.monster, split: !!tile.split });
    }
  }
  return out;
}

/** Cell walkability plus closed voxel door edges for LOS. */
export function voxelOccupancy(map: FloorMap = floor1Map): Occupancy {
  const base = openGrid(
    (x, y) => !isWalkableTile(tileAt(map, x, y)),
    map.width,
    map.height,
    (x, y) => isWaterCell(map, x, y)
  );
  return {
    ...base,
    los(x0, y0, x1, y1) {
      let x = x0;
      let y = y0;
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      while (x !== x1 || y !== y1) {
        const nx = x !== x1 ? x + dx : x;
        const ny = y !== y1 ? y + dy : y;
        if (nx === x1 && ny === y1) return base.inBounds(nx, ny) && isWalkableTile(tileAt(map, nx, ny));
        if (!base.walkable(nx, ny) || !canCross(map, x, y, nx, ny)) return false;
        x = nx;
        y = ny;
      }
      return true;
    }
  };
}

export function createFloor1Combat(rules: RulesData, seed = 1, chaseEnabled = false): Floor1Combat {
  return new Floor1Combat(new CombatEngine(rules, new Rng(seed)), chaseEnabled);
}

export async function loadFloor1Combat(search: string): Promise<Floor1Combat> {
  const flags = parseCombatSearch(search);
  const base = import.meta.env.BASE_URL;
  const [actions, monsters] = await Promise.all([
    fetchJsonCached(`${base}levels/actions.json`),
    fetchJsonCached(`${base}levels/monsters.json`)
  ]);
  const combat = createFloor1Combat(parseRules(actions, monsters), flags.seed, !flags.test || flags.combat);
  if (flags.test) combat.wake();
  return combat;
}

export class Floor1Combat {
  readonly engine: CombatEngine;
  awake = false;
  lastHand: { hero: HeroId; hand: HandSlot } | null = null;
  handTapCount = 0;
  perkHooks: Array<{ hero: HeroId; level: number }> = [];
  chosenPerks = new Map<string, string>();
  lastFlank: 'left' | 'right' | 'behind' | null = null;
  frostHintArmed = false;
  frostHintDismissed = false;
  private storyFlags = new Set<string>();
  private hooks: Floor1CombatHooks | null = null;
  private heldLogs: string[] = [];

  constructor(engine: CombatEngine, chaseEnabled: boolean) {
    this.engine = engine;
    this.engine.setChaseEnabled(chaseEnabled);
    this.refreshOccupancy();
    this.spawnFloorMonsters();
  }

  attach(hooks: Floor1CombatHooks): void {
    this.hooks = hooks;
  }

  wake(): void {
    this.awake = true;
  }

  pollAwake(unlocked: boolean): boolean {
    if (this.awake || unlocked) {
      this.awake = true;
      return true;
    }
    return false;
  }

  refreshOccupancy(map: FloorMap = floor1Map): void {
    this.engine.setOccupancy(voxelOccupancy(map));
  }

  spawnFloorMonsters(floor: FloorData = classicFloor1): void {
    this.engine.clearMonsters();
    for (const spawn of classicFloor1Monsters(floor)) {
      this.engine.spawnMonster(spawn.kind, spawn.x, spawn.y, undefined, { split: !!spawn.split });
    }
  }

  setParty(x: number, y: number, dir: number): void {
    this.engine.setPartyPos(x, y, dir);
  }

  noteStep(now: number): void {
    this.engine.noteStep(now);
  }

  monsterAt(x: number, y: number) {
    return this.engine.monsterAt(x, y);
  }

  facingMonster() {
    return this.engine.facingMonster();
  }

  inCombat(): boolean {
    return this.engine.inCombat();
  }

  get gameOver(): boolean {
    return this.engine.gameOver;
  }

  heroes(): Record<HeroId, HeroState> {
    return this.engine.heroes;
  }

  setEquipment(id: HeroId, hand: HandSlot, item: string): void {
    this.engine.setEquipment(id, hand, item);
  }

  bump(x: number, y: number, now: number): CombatEvent[] {
    if (!this.awake || this.engine.gameOver) return [];
    return this.applyEvents(this.engine.bump(x, y, now));
  }

  useHand(hero: HeroId, hand: HandSlot, now: number): CombatEvent[] {
    if (!this.awake || this.engine.gameOver) return [];
    return this.applyEvents(this.engine.useHand(hero, hand, now));
  }

  usePotion(hero: HeroId, kind: 'red' | 'blue' | 'green', now: number): CombatEvent[] {
    if (this.engine.gameOver) return [];
    return this.applyEvents(this.engine.usePotion(hero, kind, now));
  }

  tick(now: number): CombatEvent[] {
    if (!this.awake || this.engine.gameOver) return [];
    const before = new Map(this.engine.monsters.map((m) => [m.id, { x: m.x, y: m.y }]));
    const raw = this.engine.tick(now);
    return this.applyEvents(this.revertIllegalMoves(before, raw));
  }

  debugKillAt(x: number, y: number, now: number): CombatEvent[] {
    return this.applyEvents(this.engine.debugKillAt(x, y, now));
  }

  addXp(amount: number, now: number): CombatEvent[] {
    return this.applyEvents(this.engine.debugAddXp(amount, now));
  }

  finishFight(now: number): CombatEvent[] {
    return this.applyEvents(this.engine.finishFight(now));
  }

  pickPerk(hero: HeroId, perkId: string): boolean {
    const waiting = this.engine.pendingPerks.filter((p) => p.hero === hero);
    if (!waiting.length) return false;
    const level = (waiting[0].level === 5 ? 5 : 3) as 3 | 5;
    const choices = FLOOR1_PERK_CHOICES[hero]?.[level];
    if (!choices?.includes(perkId)) return false;
    this.engine.pendingPerks = this.engine.pendingPerks.filter((p) => !(p.hero === hero && p.level === level));
    this.perkHooks = this.perkHooks.filter((p) => !(p.hero === hero && p.level === level));
    const next = this.engine.pendingPerks.find((p) => p.hero === hero);
    this.engine.heroes[hero].pendingPerk = next?.level ?? null;
    this.chosenPerks.set(`${hero}:${level}`, perkId);
    this.hooks?.onHudSync?.();
    return true;
  }

  pendingFor(hero: HeroId): Array<{ hero: HeroId; level: number }> {
    return this.engine.pendingPerks.filter((p) => p.hero === hero);
  }

  nextPerkHook(): { hero: HeroId; level: number } | undefined {
    return this.perkHooks[0] ?? this.engine.pendingPerks[0];
  }

  livingSlimes(): Array<{ id: string; kind: string; x: number; y: number; alive: boolean }> {
    return this.engine.monsters.filter((m) => m.alive && isSlimeKind(m.kind));
  }

  forceWipe(): CombatEvent[] {
    return this.applyEvents(this.engine.forceWipe());
  }

  resetParty(): void {
    this.engine.resetParty();
    this.perkHooks = [];
    this.chosenPerks.clear();
    this.lastFlank = null;
    this.lastHand = null;
    this.handTapCount = 0;
    this.frostHintArmed = false;
    this.frostHintDismissed = false;
  }

  applySavedParty(party: SavedHero[]): void {
    this.resetParty();
    for (const hero of party) this.engine.applyHero(hero);
    this.engine.pendingPerks = HERO_IDS.flatMap((id) => {
      const level = this.engine.heroes[id].pendingPerk;
      return level ? [{ hero: id, level }] : [];
    });
    this.perkHooks = this.engine.pendingPerks.slice();
  }

  restoreMonsters(list: SavedMonster[]): void {
    this.engine.restoreMonsters(list);
    this.engine.fight = null;
    this.engine.gameOver = false;
  }

  snapshotMonsters(): SavedMonster[] {
    return this.engine.monsters.map((m) => ({
      id: m.id,
      kind: m.kind,
      x: m.x,
      y: m.y,
      hp: m.hp,
      maxHp: m.maxHp,
      alive: m.alive,
      split: m.split,
      splitDone: m.splitDone,
      pairSlot: m.pairSlot,
      pairId: m.pairId
    }));
  }

  nearestMonsterDist(): number {
    return this.engine.nearestMonsterDist();
  }

  allHeroesUnderHpFrac(frac: number): boolean {
    return this.engine.allHeroesUnderHpFrac(frac);
  }

  flushHeldLogs(): void {
    const held = this.heldLogs;
    this.heldLogs = [];
    for (const text of held) this.hooks?.pushLog(text);
  }

  applyEvents(events: CombatEvent[]): CombatEvent[] {
    if (!events.length) return events;
    for (const e of events) {
      switch (e.type) {
        case 'log':
          this.combatLog(e.key, e.vars);
          if (e.key === 'slime_frost_resist' && takeSlimeFrostBark(this.storyFlags)) {
            this.hooks?.onSlimeFrostResist?.();
          }
          break;
        case 'sfx':
          if (e.name === 'hero_down') break;
          this.hooks?.playCombat(e.name, e.volume ?? 1, e.x, e.y, e.id);
          break;
        case 'sfx_stop':
          this.hooks?.stopWindup(e.id);
          break;
        case 'hit_type':
          this.hooks?.onHitType?.(e.id, e.kind, e.monster);
          if (e.kind === 'resist' && !isSlimeKind(e.monster)) this.armFrostHint();
          break;
        case 'monster_anim':
          this.hooks?.onMonsterAnim?.(e.id, e.anim);
          break;
        case 'monster_move':
          this.hooks?.onMonsterMove?.(e.id, e.from, e.to);
          break;
        case 'monster_dead':
          this.hooks?.onMonsterAnim?.(e.id, 'death');
          this.hooks?.onMonsterDead?.(e.id, e.x, e.y, e.kind);
          this.hooks?.stopWindup(e.id);
          break;
        case 'slime_split':
          this.hooks?.onSlimeSplit?.(e);
          break;
        case 'hero_hurt':
          this.hooks?.playHeroHurt(e.hero, 0);
          break;
        case 'hero_down':
          this.hooks?.playCombat('hero_down');
          this.hooks?.playHeroDown(e.hero);
          break;
        case 'level_up':
          this.hooks?.onLevelUp?.(e.hero, e.level);
          break;
        case 'perk_pending':
          this.hooks?.onPerkPending?.(e.hero, e.level);
          break;
        case 'perk_hook':
          this.perkHooks.push({ hero: e.hero, level: e.level });
          this.hooks?.onPerkHook?.(e.hero, e.level);
          break;
        case 'flank':
          this.lastFlank = e.side;
          this.hooks?.onFlank?.(e.side);
          break;
        case 'fight_start':
          this.hooks?.setFightDuck(true);
          this.hooks?.onFightStart?.();
          break;
        case 'fight_end':
          this.hooks?.setFightDuck(false);
          this.hideFrostHint();
          this.hooks?.onFightEnd?.();
          break;
        case 'game_over':
          this.hooks?.onGameOver?.();
          break;
        case 'hand_used':
          this.lastHand = { hero: e.hero, hand: e.hand };
          this.handTapCount += 1;
          if (e.hero === 'ilsevar' && (e.item === 'wand' || e.item === 'scroll')) {
            this.dismissFrostHint();
          }
          break;
        case 'out_of_reach':
        case 'denied':
          this.hooks?.playUi('ui_button_denied');
          break;
        default:
          break;
      }
    }
    this.hooks?.onHudSync?.();
    return events;
  }

  private revertIllegalMoves(
    before: Map<string, { x: number; y: number }>,
    events: CombatEvent[]
  ): CombatEvent[] {
    const reverted = new Set<string>();
    for (const m of this.engine.monsters) {
      const prev = before.get(m.id);
      if (!prev || (prev.x === m.x && prev.y === m.y)) continue;
      if (canCross(floor1Map, prev.x, prev.y, m.x, m.y)) continue;
      m.x = prev.x;
      m.y = prev.y;
      reverted.add(m.id);
    }
    if (!reverted.size) return events;
    return events.filter((e) => !(e.type === 'monster_move' && reverted.has(e.id)));
  }

  private logVars(vars?: CombatLogVars): CombatLogVars | undefined {
    if (!vars) return vars;
    const out: CombatLogVars = { ...vars };
    if (typeof out.hero === 'string') out.hero = this.hooks?.heroName(out.hero) ?? out.hero;
    if (typeof out.monster === 'string') out.monster = this.hooks?.monsterName(out.monster) ?? out.monster;
    if (typeof out.target === 'string') out.target = this.hooks?.heroName(out.target) ?? out.target;
    return out;
  }

  armFrostHint(): void {
    if (this.frostHintDismissed) return;
    this.frostHintArmed = true;
    this.hooks?.onArmFrostHint?.();
  }

  hideFrostHint(): void {
    this.frostHintArmed = false;
  }

  dismissFrostHint(): void {
    this.frostHintDismissed = true;
    this.frostHintArmed = false;
    this.hooks?.dismissFrostHint?.();
  }

  private combatLog(key: string, vars?: CombatLogVars): void {
    const text = this.hooks?.storyLog(key, this.logVars(vars)) ?? '';
    if (!text) return;
    if (this.hooks?.noteOpen?.()) {
      this.heldLogs.push(text);
      return;
    }
    this.hooks?.pushLog(text);
  }
}

export { HERO_IDS };
