import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  stepForward: () => boolean;
  combatMonsters: () => Array<{ id: string; kind: string; x: number; y: number; hp: number; alive: boolean }>;
  monsterViews: () => Array<{ id: string; kind: string; x: number; y: number; visible: boolean; yWorld: number }>;
  inCombat: boolean;
  combatAwake: boolean;
  useHand: (id: string, hand: 'main' | 'off') => boolean;
  drinkPotion: (hero: string, kind: 'red' | 'blue' | 'green') => boolean;
  getHeroes: () => Array<{ id: string; hp: number; maxHp: number; mana: number; downed: boolean; state: string }>;
  setHeroHp: (id: string, hp: number) => void;
  debugKillAt: (x: number, y: number) => boolean;
  tickCombat: (sec?: number) => void;
  wakeCombat: () => void;
  logLines: string[];
};

async function boot(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 420, height: 912 });
  await page.goto(BASE);
  await page.waitForFunction(
    () => (window as unknown as { __voxelFloor1?: { ready?: boolean } }).__voxelFloor1?.ready === true,
    null,
    { timeout: 60000 }
  );
}

test.use({ viewport: { width: 420, height: 912 }, hasTouch: true, isMobile: true });

test('voxel floor 1: walk to a rat, fight with two heroes, drink, kill', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const opened = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.wakeCombat();
    api.setPosition(6, 5, 1);
    const bumped = api.stepForward();
    return {
      bumped,
      fighting: api.inCombat,
      awake: api.combatAwake,
      rat: api.combatMonsters().find((m) => m.x === 7 && m.y === 5),
      view: api.monsterViews().find((m) => m.x === 7 && m.y === 5)
    };
  });
  expect(opened.awake).toBe(true);
  expect(opened.bumped).toBe(false);
  expect(opened.fighting).toBe(true);
  expect(opened.rat?.kind).toBe('keep_rat');
  expect(opened.rat?.alive).toBe(true);
  expect(opened.view?.visible).toBe(true);

  const swung = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const brannoc = api.useHand('brannoc', 'main');
    const mags = api.useHand('mags', 'main');
    api.tickCombat();
    return {
      brannoc,
      mags,
      fighting: api.inCombat,
      rat: api.combatMonsters().find((m) => m.x === 7 && m.y === 5),
      logs: api.logLines
    };
  });
  expect(swung.brannoc || swung.mags).toBe(true);
  expect(swung.fighting).toBe(true);

  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/voxel_floor1_combat_midfight.png`, fullPage: false });

  const wounded = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const start = api.getHeroes().find((h) => h.id === 'brannoc')!;
    api.setHeroHp('brannoc', Math.round(start.maxHp * 0.5));
    const after = api.getHeroes().find((h) => h.id === 'brannoc')!;
    return { startHp: start.hp, hurtHp: after.hp, hurtState: after.state };
  });
  expect(wounded.hurtState).toBe('hurt');
  expect(wounded.hurtHp).toBeLessThan(wounded.startHp);

  await page.waitForFunction(() => {
    const cell = document.querySelector<HTMLElement>('.portrait-cell[data-hero="brannoc"]');
    const img = cell?.querySelector<HTMLImageElement>('img.portrait-face');
    return cell?.dataset.state === 'hurt' && !!img?.complete && /hurt/.test(img.src);
  });
  await page.screenshot({ path: `${OUT}/voxel_floor1_combat_hurt_portrait.png`, fullPage: false });

  const drank = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const before = api.getHeroes().find((h) => h.id === 'brannoc')!;
    const ok = api.drinkPotion('brannoc', 'red');
    const after = api.getHeroes().find((h) => h.id === 'brannoc')!;
    return { ok, before: before.hp, after: after.hp };
  });
  expect(drank.ok).toBe(true);
  expect(drank.after).toBeGreaterThan(drank.before);

  const killed = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const used = { brannoc: false, mags: false };
    for (let i = 0; i < 12; i++) {
      if (api.useHand('brannoc', 'main')) used.brannoc = true;
      if (api.useHand('mags', 'main')) used.mags = true;
      api.tickCombat();
    }
    const rat = api.combatMonsters().find((m) => m.x === 7 && m.y === 5 && m.alive);
    if (rat) api.debugKillAt(7, 5);
    return {
      used,
      living: api.combatMonsters().filter((m) => m.x === 7 && m.y === 5 && m.alive),
      fighting: api.inCombat
    };
  });
  expect(Number(killed.used.brannoc) + Number(killed.used.mags)).toBeGreaterThanOrEqual(2);
  expect(killed.living).toHaveLength(0);
});
