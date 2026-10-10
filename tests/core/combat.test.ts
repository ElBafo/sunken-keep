import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { CombatEngine, ITEM_ACT_SFX, openGrid, parseRules, Rng, simulateFloor1 } from '../../src/core';
import type { CombatEvent, HeroId } from '../../src/core';
import { HERO_HURT_VOICE_GAP, HERO_VOICES } from '../../src/proto3d/constants';

const actions = JSON.parse(readFileSync(resolve('public/levels/actions.json'), 'utf8'));
const monsters = JSON.parse(readFileSync(resolve('public/levels/monsters.json'), 'utf8'));
const rules = parseRules(actions, monsters);

function engine(seed = 1) {
  return new CombatEngine(rules, new Rng(seed));
}

function fight(e: CombatEngine, kind: string, now = 0) {
  const m = e.spawnMonster(kind, 1, 0);
  e.setPartyPos(0, 0, 1);
  e.beginFight(m, now);
  return m;
}

function logs(events: CombatEvent[], key: string) {
  return events.filter((ev) => ev.type === 'log' && ev.key === key);
}

describe('hero voices and perk hook flags', () => {
  it('keeps voices behind one constant and only releases perk hooks after the fight', () => {
    expect(HERO_VOICES).toBe(true);
    expect(HERO_HURT_VOICE_GAP).toBe(0.6);
    const e = engine();
    e.heroes.brannoc.xp = 219;
    const alive = fight(e, 'slime');
    const mid = e.debugAddXp(40);
    expect(alive.alive).toBe(true);
    expect(mid.some((x) => x.type === 'perk_pending')).toBe(true);
    expect(mid.some((x) => x.type === 'perk_hook')).toBe(false);
    expect(e.fight).toBeTruthy();
    const end = e.finishFight(1);
    expect(end.some((x) => x.type === 'perk_hook')).toBe(true);
    expect(end.some((x) => x.type === 'fight_end')).toBe(true);
  });
});

describe('src/core combat rules', () => {
  it('shares torch and hammer swing sounds with the HUD map', () => {
    expect(ITEM_ACT_SFX.torch_burnt).toBe('act_torch');
    expect(ITEM_ACT_SFX.ashmantle_hammer).toBe('act_axe');
    expect(ITEM_ACT_SFX.torch_lit).toBe('act_torch');
    expect(ITEM_ACT_SFX.empty_hand).toBe('act_punch');
  });

  it('parses habits from monsters.json', () => {
    expect(rules.monsters.keep_rat.behavior.habit).toBe('dart');
    expect(rules.monsters.keep_rat.behavior.every).toBe(3);
    expect(rules.monsters.rust_crab.behavior.habit).toBe('wind_up');
    expect(rules.monsters.rust_crab.behavior.every).toBe(3);
    expect(rules.monsters.rust_crab.behavior.specialDamage).toEqual([5, 8]);
    expect(rules.monsters.slime.interval).toBe(2.5);
    expect(rules.monsters.rust_crab.behavior.block).toBe('halve');
    expect(rules.monsters.slime.behavior.habit).toBe('resist_blades');
    expect(rules.monsters.slime.behavior.frostBonus).toBe(0.25);
    expect(rules.monsters.bog_leeches.behavior.habit).toBe('latch');
    expect(rules.monsters.cellar_spider.behavior.habit).toBe('web');
    expect(rules.monsters.cellar_spider.behavior.chance).toBe(0.25);
    expect(rules.monsters.cellar_spider.behavior.duration).toBe(3);
    expect(rules.monsters.drowned_dwarf.behavior.habit).toBe('wind_up');
    expect(rules.monsters.captain_dural.behavior.habit).toBe('boss_two_phase');
    expect(rules.monsters.captain_dural.behavior.phaseHpFrac).toBe(0.5);
  });

  it('natural 20 always hits and doubles damage; natural 1 always misses', () => {
    const hit = engine(7);
    const rat = fight(hit, 'keep_rat');
    const before = rat.hp;
    // seed 7 first d20 from useHand after punch log path — search a seed that crits
    let crit = false;
    let miss = false;
    for (let seed = 1; seed < 80 && (!crit || !miss); seed++) {
      const e = engine(seed);
      const m = fight(e, 'keep_rat');
      const hp = m.hp;
      const ev = e.useHand('brannoc', 'main', 0);
      if (logs(ev, 'crit').length) {
        crit = true;
        const n = Number((logs(ev, 'crit')[0] as { vars?: { n?: number } }).vars?.n);
        expect(n).toBeGreaterThanOrEqual(8);
        expect(m.hp).toBe(Math.max(0, hp - n));
      }
      if (logs(ev, 'miss').length) miss = true;
    }
    expect(crit, 'found a crit with some seed').toBe(true);
    expect(miss, 'found a miss with some seed').toBe(true);
    void before;

    const highAc = engine(1);
    const crab = fight(highAc, 'rust_crab');
    // Force a 20 by wrapping rng
    const forced = new CombatEngine(rules, {
      d20: () => 20,
      int: (a: number, b: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const m = fight(forced, 'rust_crab');
    const ev = forced.useHand('brannoc', 'main', 0);
    expect(logs(ev, 'crit').length).toBe(1);
    expect(m.hp).toBeLessThan(crab.hp);

    const fumble = new CombatEngine(rules, {
      d20: () => 1,
      int: (a: number, b: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const m2 = fight(fumble, 'keep_rat');
    const ev2 = fumble.useHand('brannoc', 'main', 0);
    expect(logs(ev2, 'miss').length).toBe(1);
    expect(m2.hp).toBe(14);
  });

  it('back-row melee logs out_of_reach', () => {
    const e = engine();
    fight(e, 'keep_rat');
    const ev = e.useHand('wren', 'main', 0);
    expect(ev.some((x) => x.type === 'out_of_reach')).toBe(true);
    expect(logs(ev, 'out_of_reach').length).toBe(1);
    expect(e.monsters[0].hp).toBe(14);
  });

  it('mage and cleric ranged/spell hands work from the back row', () => {
    const forced = new CombatEngine(rules, {
      d20: () => 15,
      int: (a: number, b: number) => b,
      next: () => 0.5,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const m = fight(forced, 'keep_rat');
    const wand = forced.useHand('ilsevar', 'main', 0);
    expect(wand.some((x) => x.type === 'out_of_reach')).toBe(false);
    expect(m.hp).toBeLessThan(14);
    const slime = new CombatEngine(rules, {
      d20: () => 15,
      int: (a: number, b: number) => b,
      next: () => 0.5,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const s = fight(slime, 'slime');
    const frost = slime.useHand('ilsevar', 'off', 0);
    expect(frost.some((x) => x.type === 'out_of_reach')).toBe(false);
    expect(logs(frost, 'frost_bolt').length).toBe(1);
    expect(s.hp).toBeLessThan(40);
  });

  it('slime resists blades/piercing and takes full blunt; frost gets +25%', () => {
    const mk = () =>
      new CombatEngine(rules, {
        d20: () => 18,
        int: (a: number, b: number) => a,
        next: () => 0,
        pick: <T>(xs: T[]) => xs[0],
        chance: () => false
      } as unknown as Rng);

    const axeE = mk();
    const slimeA = fight(axeE, 'slime');
    axeE.useHand('brannoc', 'main', 0);
    const axeDmg = 40 - slimeA.hp;

    const maceE = mk();
    maceE.heroes.wren.formation = 'front';
    const slimeM = fight(maceE, 'slime');
    maceE.useHand('wren', 'main', 0);
    const maceDmg = 40 - slimeM.hp;

    const dagE = mk();
    const slimeD = fight(dagE, 'slime');
    dagE.useHand('mags', 'main', 0);
    const dagDmg = 40 - slimeD.hp;

    expect(axeDmg).toBe(Math.floor(4 * 0.5));
    expect(maceDmg).toBe(3);
    expect(dagDmg).toBe(Math.floor(2 * 0.5));

    const frostE = mk();
    const slimeF = fight(frostE, 'slime');
    frostE.useHand('ilsevar', 'off', 0);
    const frostDmg = 40 - slimeF.hp;
    expect(frostDmg).toBe(Math.floor(8 * 1.25));

    const wandE = mk();
    const slimeW = fight(wandE, 'slime');
    const wandEv = wandE.useHand('ilsevar', 'main', 0);
    expect(wandEv.some((x) => x.type === 'hit_type' && x.kind === 'weak')).toBe(true);
    expect(40 - slimeW.hp).toBe(Math.floor(3 * 1.25));
  });

  it('crab wind-up on every 3rd attack is halved by a raised shield', () => {
    const e = new CombatEngine(rules, {
      d20: () => 18,
      int: (a: number, b: number) => (a === 5 && b === 8 ? 8 : a === 2 && b === 5 ? 4 : a),
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const crab = fight(e, 'rust_crab', 0);
    e.tick(0.5);
    expect(crab.attackCount).toBe(1);
    e.tick(3.0);
    expect(crab.attackCount).toBe(2);
    const wind = e.tick(5.5);
    expect(crab.windup?.kind).toBe('pinch');
    expect(wind.some((ev) => ev.type === 'sfx' && ev.name === 'rust_crab_windup')).toBe(true);
    e.useHand('brannoc', 'off', 5.6);
    expect(e.shieldUntil).toBeGreaterThan(5.6);
    const before = e.heroes.brannoc.hp;
    const land = e.tick(6.5);
    expect(crab.windup).toBeNull();
    expect(logs(land, 'block_hit').length).toBe(1);
    const lost = before - e.heroes.brannoc.hp;
    expect(lost).toBe(4);
  });

  it('green potion stops a leech drain', () => {
    const e = engine(3);
    const leech = fight(e, 'bog_leeches', 0);
    e.debugLatch('brannoc', 5);
    expect(e.heroes.brannoc.latched).toBe(true);
    const hp0 = e.heroes.brannoc.hp;
    e.tick(0.5);
    expect(e.heroes.brannoc.hp).toBeLessThanOrEqual(hp0);
    e.usePotion('brannoc', 'green', 1);
    expect(e.heroes.brannoc.latched).toBe(false);
    const hp1 = e.heroes.brannoc.hp;
    e.tick(2.5);
    e.tick(4.5);
    expect(e.heroes.brannoc.latched).toBe(false);
    expect(e.heroes.brannoc.hp).toBe(hp1);
    expect(leech.alive).toBe(true);
  });

  it('XP is monster max HP for every hero and levels apply progression', () => {
    const e = engine(1);
    for (const id of ['brannoc', 'wren', 'ilsevar', 'mags'] as HeroId[]) {
      expect(e.heroes[id].level).toBe(1);
      expect(e.heroes[id].xp).toBe(0);
    }
    const startMax = e.heroes.brannoc.maxHp;
    const forced = new CombatEngine(rules, {
      d20: () => 20,
      int: (a: number, b: number) => b,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const s = fight(forced, 'slime');
    s.hp = 1;
    const ev = forced.useHand('brannoc', 'main', 0);
    expect(ev.some((x) => x.type === 'monster_dead')).toBe(true);
    expect(logs(ev, 'xp_gain').length).toBe(1);
    for (const id of ['brannoc', 'wren', 'ilsevar', 'mags'] as HeroId[]) {
      expect(forced.heroes[id].xp).toBe(40);
    }
    const ev2 = forced.debugAddXp(60);
    expect(ev2.some((x) => x.type === 'level_up')).toBe(true);
    expect(forced.heroes.brannoc.level).toBe(2);
    expect(forced.heroes.brannoc.maxHp).toBe(startMax + 6);
    expect(forced.heroes.wren.maxHp).toBe(32 + 5);
    expect(forced.heroes.ilsevar.maxMana).toBe(16 + 3);
    expect(ev2.some((x) => x.type === 'perk_hook')).toBe(false);
  });

  it('emits a perk hook at levels 3 and 5 without building a perk UI', () => {
    const e = engine();
    e.heroes.brannoc.xp = 219;
    const m = fight(e, 'slime');
    m.hp = 1;
    const forced = new CombatEngine(rules, {
      d20: () => 20,
      int: () => 9,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    forced.heroes.brannoc.xp = 219;
    const s = fight(forced, 'slime');
    s.hp = 1;
    const ev = forced.useHand('brannoc', 'main', 0);
    expect(ev.some((x) => x.type === 'perk_pending' && x.level === 3)).toBe(true);
    // kill ends the fight, then the hook is released — never a mid-fight screen
    expect(forced.heroes.brannoc.level).toBeGreaterThanOrEqual(3);
    expect(ev.some((x) => x.type === 'perk_hook' && x.level === 3)).toBe(true);
    const mid = engine();
    mid.heroes.brannoc.xp = 219;
    const alive = fight(mid, 'slime');
    const midEv = mid.debugAddXp(40);
    expect(alive.alive).toBe(true);
    expect(midEv.some((x) => x.type === 'perk_pending')).toBe(true);
    expect(midEv.some((x) => x.type === 'perk_hook')).toBe(false);
    expect(mid.pendingPerks.length).toBeGreaterThan(0);
    mid.endFight(1);
    expect(mid.pendingPerks.length).toBe(0);
  });

  it('downed heroes stand up with 1 HP after a fight', () => {
    const e = engine();
    e.debugSetHp('wren', 0);
    expect(e.heroes.wren.downed).toBe(true);
    const m = fight(e, 'keep_rat');
    m.hp = 0;
    m.alive = false;
    e.endFight(1);
    expect(e.heroes.wren.downed).toBe(false);
    expect(e.heroes.wren.hp).toBe(1);
  });

  it('party wipe emits game_over', () => {
    const e = engine();
    const ev = e.forceWipe();
    expect(e.gameOver).toBe(true);
    expect(ev.some((x) => x.type === 'game_over')).toBe(true);
    expect(logs(ev, 'party_dead').length).toBe(1);
  });

  it('empty hand with a foe logs hit or miss, not punch', () => {
    const e = engine();
    e.setEquipment('brannoc', 'main', 'empty_hand');
    fight(e, 'keep_rat');
    const ev = e.useHand('brannoc', 'main', 0, 'empty_hand');
    expect(logs(ev, 'punch').length).toBe(0);
    expect(logs(ev, 'punch_air').length).toBe(0);
    expect(logs(ev, 'hit').length + logs(ev, 'miss').length + logs(ev, 'crit').length).toBe(1);
  });

  it('empty hand with nothing in front logs punch_air', () => {
    const e = engine();
    e.setEquipment('brannoc', 'main', 'empty_hand');
    const ev = e.useHand('brannoc', 'main', 0, 'empty_hand');
    expect(logs(ev, 'punch_air').length).toBe(1);
    expect(logs(ev, 'punch').length).toBe(0);
  });

  it('dry kills use monster_dies_dry; water tiles use monster_dies', () => {
    const forced = new CombatEngine(rules, {
      d20: () => 20,
      int: () => 8,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const target = fight(forced, 'keep_rat');
    target.hp = 1;
    const dryEv = forced.useHand('brannoc', 'main', 0);
    expect(logs(dryEv, 'monster_dies_dry').length).toBe(1);
    expect(logs(dryEv, 'monster_dies').length).toBe(0);

    const wet = new CombatEngine(rules, {
      d20: () => 20,
      int: () => 8,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    wet.setOccupancy(openGrid(() => false, 8, 8, () => true));
    const leech = fight(wet, 'bog_leeches');
    leech.hp = 1;
    const wetEv = wet.useHand('brannoc', 'main', 0);
    expect(logs(wetEv, 'monster_dies').length).toBe(1);
    expect(logs(wetEv, 'monster_dies_dry').length).toBe(0);
  });

  it('webbed and downed taps log their own lines; pocket sand misses as sand_miss', () => {
    const e = engine();
    fight(e, 'keep_rat');
    e.heroes.brannoc.webbedUntil = 10;
    const web = e.useHand('brannoc', 'main', 1);
    expect(logs(web, 'webbed').length).toBe(1);

    e.debugSetHp('wren', 0);
    const down = e.useHand('wren', 'main', 1);
    expect(logs(down, 'hero_down').length).toBe(1);

    const sand = new CombatEngine(rules, {
      d20: () => 18,
      int: (a: number, b: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const rat = fight(sand, 'keep_rat', 0);
    sand.heroes.mags.formation = 'front';
    sand.useHand('mags', 'off', 0.2);
    expect(rat.missNext).toBe(true);
    const miss = sand.tick(0.5);
    expect(logs(miss, 'sand_miss').length).toBe(1);
    expect(logs(miss, 'dodge').length).toBe(0);
  });

  it('monsters swing first about 0.5s into a fight', () => {
    const e = new CombatEngine(rules, {
      d20: () => 18,
      int: (a: number, b: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    fight(e, 'keep_rat', 0);
    const early = e.tick(0.4);
    expect(logs(early, 'monster_hit').length).toBe(0);
    const first = e.tick(0.5);
    expect(logs(first, 'monster_hit').length).toBe(1);
  });
});

describe('hit types and small combat bugs', () => {
  it('marks slime blade hits resist, frost weak, and keeps nat 20 as crit', () => {
    const resistE = new CombatEngine(rules, {
      d20: () => 18,
      int: (a: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    const slimeR = fight(resistE, 'slime');
    const resist = resistE.useHand('brannoc', 'main', 0);
    expect(resist.some((x) => x.type === 'hit_type' && x.kind === 'resist')).toBe(true);
    expect(resist.some((x) => x.type === 'sfx' && x.name === 'hit_resist')).toBe(true);
    expect(resist.some((x) => x.type === 'monster_anim' && x.anim === 'hurt')).toBe(false);
    expect(slimeR.hp).toBeLessThan(40);

    const critE = new CombatEngine(rules, {
      d20: () => 20,
      int: (a: number) => a,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    fight(critE, 'slime');
    const crit = critE.useHand('brannoc', 'main', 0);
    expect(crit.some((x) => x.type === 'hit_type' && x.kind === 'crit')).toBe(true);
    expect(crit.some((x) => x.type === 'sfx' && x.name === 'hit_crit')).toBe(true);
    expect(crit.some((x) => x.type === 'sfx' && x.name === 'hit_resist')).toBe(false);
  });

  it('does not play hurt on 0 damage', () => {
    const e = new CombatEngine(rules, {
      d20: () => 18,
      int: () => 0,
      next: () => 0,
      pick: <T>(xs: T[]) => xs[0],
      chance: () => false
    } as unknown as Rng);
    fight(e, 'keep_rat', 0);
    const ev = e.tick(0.5);
    expect(logs(ev, 'monster_hit').length).toBe(1);
    expect(ev.some((x) => x.type === 'sfx' && x.name === 'hurt')).toBe(false);
  });

  it('skips not_ready log outside combat', () => {
    const e = engine();
    e.useHand('brannoc', 'main', 0);
    const again = e.useHand('brannoc', 'main', 0.1);
    expect(again.some((x) => x.type === 'denied' && x.reason === 'not_ready')).toBe(true);
    expect(logs(again, 'not_ready').length).toBe(0);
  });
});

describe('floor 1 scripted playthrough', () => {
  it('reports HP lost for a fixed seed (target ~24)', () => {
    const result = simulateFloor1(actions, monsters, 21);
    console.log('FLOOR1_SIM', JSON.stringify(result));
    expect(result.wipe).toBe(false);
    expect(result.kills.length).toBe(5);
    expect(result.hpLost).toBeGreaterThan(8);
    expect(result.hpLost).toBeLessThan(50);
  });

  it('keeps 500 seeds under 40 p90 HP loss with no wipes', () => {
    const runs = Array.from({ length: 500 }, (_, i) => simulateFloor1(actions, monsters, i + 1));
    const lost = runs.map((r) => r.hpLost).sort((a, b) => a - b);
    const avg = lost.reduce((s, n) => s + n, 0) / lost.length;
    const p90 = lost[Math.floor(0.9 * (lost.length - 1))];
    const worst = lost[lost.length - 1];
    const wipes = runs.filter((r) => r.wipe);
    console.log(
      'FLOOR1_SIM_500',
      JSON.stringify({
        avg: Math.round(avg * 10) / 10,
        p90,
        worst,
        wipes: wipes.length
      })
    );
    expect(wipes.length, `wipes at seeds ${wipes.map((r) => r.seed).join(',')}`).toBe(0);
    expect(p90).toBeLessThanOrEqual(40);
  });
});
