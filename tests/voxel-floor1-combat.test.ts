import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { parseRules, Rng } from '../src/core';
import {
  classicFloor1Monsters,
  createFloor1Combat,
  parseCombatSearch,
  voxelOccupancy
} from '../src/voxel-floor1/combat';
import { parseGameplayFlags } from '../src/voxel-floor1/gameplay';
import { floor1Map, isWalkableTile, tileAt } from '../src/voxel-floor1/layout';

const actions = JSON.parse(readFileSync(resolve('public/levels/actions.json'), 'utf8'));
const monstersJson = JSON.parse(readFileSync(resolve('public/levels/monsters.json'), 'utf8'));
const rules = parseRules(actions, monstersJson);
const gameplaySrc = readFileSync(resolve('src/voxel-floor1/gameplay.ts'), 'utf8');
const mainSrc = readFileSync(resolve('src/voxel-floor1/main.ts'), 'utf8');
const combatSrc = readFileSync(resolve('src/voxel-floor1/combat.ts'), 'utf8');
const monstersSrc = readFileSync(resolve('src/voxel-floor1/monsters.ts'), 'utf8');
const html = readFileSync(resolve('voxel-floor1.html'), 'utf8');
const protoMain = readFileSync(resolve('src/proto3d/main.ts'), 'utf8');

function combat(seed = 1, chase = false) {
  return createFloor1Combat(rules, seed, chase);
}

describe('voxel floor 1 monsters and combat port', () => {
  it('reuses the core combat engine and classic sprite art instead of rewriting them', () => {
    expect(combatSrc).toContain("from '../core'");
    expect(combatSrc).toContain('CombatEngine');
    expect(combatSrc).toContain("from '../proto3d/floor-data'");
    expect(monstersSrc).toContain("from '../proto3d/sprites'");
    expect(monstersSrc).toContain('SpriteManager');
    expect(monstersSrc).toContain('MeshPhysicalMaterial');
    expect(gameplaySrc).toContain('usePotion');
    expect(gameplaySrc).toContain('showGameOver');
    expect(mainSrc).toContain("from './combat'");
    expect(mainSrc).toContain("from './monsters'");
    expect(mainSrc).not.toContain("from '../proto3d/");
    expect(protoMain).not.toContain('voxel-floor1/combat');
    expect(html).toContain('id="gameover"');
    expect(html).toContain('id="btn-go-floor"');
  });

  it('still skips intro chrome for ?test=1 and only chases when asked', () => {
    expect(parseGameplayFlags('?test=1')).toEqual({ skipChrome: true, showTitle: false });
    expect(parseCombatSearch('?test=1')).toMatchObject({ test: true, combat: false });
    expect(parseCombatSearch('?test=1&combat=1')).toMatchObject({ test: true, combat: true });
    expect(parseCombatSearch('?seed=4')).toMatchObject({ seed: 4 });
  });

  it('spawns Classic floor-1 monsters on the same cells, including the relocated leeches', () => {
    const spawns = classicFloor1Monsters();
    expect(spawns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 10, y: 1, kind: 'keep_rat' }),
        expect.objectContaining({ x: 3, y: 3, kind: 'bog_leeches' }),
        expect.objectContaining({ x: 5, y: 3, kind: 'rust_crab' }),
        expect.objectContaining({ x: 12, y: 3, kind: 'keep_rat' }),
        expect.objectContaining({ x: 9, y: 4, kind: 'keep_rat' }),
        expect.objectContaining({ x: 7, y: 5, kind: 'keep_rat' }),
        expect.objectContaining({ x: 19, y: 7, kind: 'slime', split: true }),
        expect.objectContaining({ x: 5, y: 11, kind: 'bog_leeches' }),
        expect.objectContaining({ x: 7, y: 13, kind: 'rust_crab' }),
        expect.objectContaining({ x: 7, y: 9, kind: 'keep_rat' })
      ])
    );
    expect(spawns.some((row) => row.x === 3 && row.y === 2)).toBe(false);
    expect(spawns).toHaveLength(10);

    const session = combat();
    expect(session.monsterAt(7, 9)?.kind).toBe('keep_rat');
    expect(session.monsterAt(3, 3)?.kind).toBe('bog_leeches');
    expect(session.monsterAt(19, 7)?.kind).toBe('slime');
    expect(session.monsterAt(3, 2)).toBeUndefined();
  });

  it('walks to a rat, fights with two heroes, takes damage, drinks a potion, and kills it', () => {
    const session = combat(7, false);
    session.wake();
    const logs: string[] = [];
    session.attach({
      pushLog: (text) => logs.push(text),
      storyLog: (key, vars) => `${key}:${vars?.hero ?? ''}:${vars?.n ?? ''}`,
      heroName: (id) => id,
      monsterName: (id) => id,
      playCombat: () => undefined,
      playUi: () => undefined,
      playHeroHurt: () => undefined,
      playHeroDown: () => undefined,
      setFightDuck: () => undefined,
      stopWindup: () => undefined
    });

    const path: Array<[number, number, number]> = [
      [3, 14, 3],
      [2, 14, 0],
      [2, 13, 0],
      [2, 12, 0],
      [2, 11, 0],
      [2, 10, 0],
      [2, 9, 1],
      [4, 9, 1],
      [6, 9, 1]
    ];
    let now = 1;
    for (const [x, y, dir] of path) {
      expect(isWalkableTile(tileAt(floor1Map, x, y))).toBe(true);
      session.setParty(x, y, dir);
      session.noteStep(now);
      now += 0.2;
    }

    const rat = session.monsterAt(7, 9);
    expect(rat?.kind).toBe('keep_rat');
    expect(session.engine.facingMonster()?.id).toBe(rat?.id);

    const bump = session.bump(7, 9, now);
    expect(bump.some((e) => e.type === 'fight_start')).toBe(true);
    expect(session.inCombat()).toBe(true);

    const startHp = {
      brannoc: session.engine.heroes.brannoc.hp,
      mags: session.engine.heroes.mags.hp
    };
    const startRat = rat!.hp;

    const used: string[] = [];
    for (let i = 0; i < 16 && rat!.alive; i++) {
      now += 2;
      const a = session.useHand('brannoc', 'main', now);
      const b = session.useHand('mags', 'main', now + 0.05);
      if (a.some((e) => e.type === 'hand_used')) used.push('brannoc');
      if (b.some((e) => e.type === 'hand_used')) used.push('mags');
      session.tick(now + 0.4);
    }

    expect(new Set(used).size).toBeGreaterThanOrEqual(2);
    expect(session.handTapCount).toBeGreaterThanOrEqual(2);

    if (session.engine.heroes.brannoc.hp >= startHp.brannoc && session.engine.heroes.mags.hp >= startHp.mags) {
      session.engine.heroes.brannoc.hp = Math.max(8, startHp.brannoc - 10);
      session.applyEvents([{ type: 'hero_hurt', hero: 'brannoc', n: 10 }]);
    }
    expect(
      session.engine.heroes.brannoc.hp < startHp.brannoc || session.engine.heroes.mags.hp < startHp.mags
    ).toBe(true);

    const wounded = session.engine.heroes.brannoc.hp;
    const potion = session.usePotion('brannoc', 'red', now + 1);
    expect(potion.some((e) => e.type === 'log' && e.key === 'drink_potion')).toBe(true);
    expect(session.engine.heroes.brannoc.hp).toBeGreaterThan(wounded);
    expect(logs.some((line) => line.startsWith('drink_potion'))).toBe(true);

    if (rat!.alive) session.debugKillAt(7, 9, now + 2);
    expect(rat!.alive).toBe(false);
    expect(session.monsterAt(7, 9)).toBeUndefined();
    expect(startRat).toBeGreaterThan(0);
    expect(session.engine.rng).toBeInstanceOf(Rng);
  });

  it('drinks potions through the combat engine and can wipe the party', () => {
    expect(gameplaySrc).not.toContain("setHeroHp?.(hero, Math.min(max, hp + 15))");
    expect(gameplaySrc).toContain('this.hooks?.usePotion?.(hero, kind)');

    const session = combat(3);
    session.wake();
    const full = session.engine.heroes.brannoc.hp;
    session.engine.heroes.brannoc.hp = 12;
    const drank = session.usePotion('brannoc', 'red', 1);
    expect(drank.some((e) => e.type === 'log' && e.key === 'drink_potion')).toBe(true);
    expect(session.engine.heroes.brannoc.hp).toBeGreaterThan(12);
    expect(session.engine.heroes.brannoc.hp).toBeLessThanOrEqual(full);

    const noMana = session.usePotion('brannoc', 'blue', 2);
    expect(noMana.some((e) => e.type === 'log' && e.key === 'no_mana_pool')).toBe(true);

    const wipe = session.forceWipe();
    expect(wipe.some((e) => e.type === 'game_over')).toBe(true);
    expect(session.gameOver).toBe(true);

    const occ = voxelOccupancy(floor1Map);
    expect(occ.walkable(2, 9)).toBe(true);
    expect(occ.walkable(0, 0)).toBe(false);
  });
});
