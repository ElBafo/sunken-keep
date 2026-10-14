import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  snapDoor?: (x: number, y: number, open: boolean) => void;
  combatAwake: () => boolean;
  combatMonsters: () => Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    hp: number;
    alive: boolean;
    pairSlot: string | null;
    nextAttackAt: number;
  }>;
  sprites: () => Array<{
    kind: string;
    monsterKind?: string;
    monsterId?: string;
    x: number;
    y: number;
    visible: boolean;
    hidden: boolean;
    disposed: boolean;
    lod: string | null;
    frames: number;
    anim: string;
    pairSlot: string | null;
  }>;
  setMonsterHp: (id: string, hp: number) => boolean;
  whenMonstersSynced: () => Promise<void>;
  playMonsterAnim: (id: string, anim: string) => { anim: string; frame: number } | null;
  saveToSlot: (slot: number) => boolean;
  loadFromSlot: (slot: number) => Promise<boolean>;
  inCombat: () => boolean;
  tryMoveForward: () => { result: string };
};

test.use(devices['iPhone 15']);

async function boot(page: import('@playwright/test').Page, qs = 'test=1&debug=1&persist=1') {
  await page.goto(`${BASE_URL}/proto3d.html?${qs}`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { combatAwake?: () => boolean } }).__proto3d?.combatAwake?.() === true,
    null,
    { timeout: 8000 }
  );
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { __proto3d?: { combatMonsters?: () => Array<{ kind: string }> } }).__proto3d;
      return !!p?.combatMonsters?.().some((m) => m.kind === 'slime');
    },
    null,
    { timeout: 15000 }
  );
}

async function splitSlime(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const slime = p.combatMonsters().find((m) => m.kind === 'slime' && m.alive);
    if (!slime) return { ok: false, kids: [] as ReturnType<Proto3d['combatMonsters']> };
    p.snapDoor?.(19, 5, true);
    p.setPosition(slime.x, slime.y - 1, 2);
    p.setMonsterHp(slime.id, Math.floor(slime.hp / 2));
    await p.whenMonstersSynced();
    return { ok: true, kids: p.combatMonsters().filter((m) => m.kind === 'slime_small' && m.alive) };
  });
}

test('slimelings stay visible at 2/3/4, restore after load, death frame is immediate', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const split = await splitSlime(page);
  expect(split.ok, 'slime splits').toBe(true);
  expect(split.kids, 'two slimelings in combat state').toHaveLength(2);

  const atDist = async (back: number) =>
    page.evaluate((n) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      const kid = p.combatMonsters().find((m) => m.kind === 'slime_small' && m.alive);
      if (!kid) return { sprites: [] as ReturnType<Proto3d['sprites']>, lod: null as string | null };
      p.setPosition(kid.x, kid.y - n, 2);
      const sprites = p.sprites().filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
      return {
        sprites,
        visible: sprites.filter((s) => s.visible && !s.hidden).length,
        lods: sprites.map((s) => s.lod),
        frames: sprites.map((s) => s.frames)
      };
    }, back);

  const d1 = await atDist(1);
  expect(d1.visible, 'visible at 1 square').toBe(2);
  await page.screenshot({ path: `${OUT}/slimeling-lod-1.png` });

  const d2 = await atDist(2);
  expect(d2.visible, 'visible at 2 squares').toBe(2);
  expect(d2.lods.every((l) => l === 'near'), 'near LOD at 2').toBe(true);
  await page.screenshot({ path: `${OUT}/slimeling-lod-2.png` });

  const d3 = await atDist(3);
  expect(d3.visible, 'visible at 3 squares').toBe(2);
  expect(d3.lods.every((l) => l === 'mid'), 'mid LOD at 3').toBe(true);
  await page.screenshot({ path: `${OUT}/slimeling-lod-3.png` });

  const d4 = await atDist(4);
  expect(d4.visible, 'visible at 4 squares').toBe(2);
  expect(d4.lods.every((l) => l === 'far'), 'far LOD at 4').toBe(true);
  await page.screenshot({ path: `${OUT}/slimeling-lod-4.png` });

  const death = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const kid = p.combatMonsters().find((m) => m.kind === 'slime_small' && m.alive);
    if (!kid) return null;
    p.playMonsterAnim(kid.id, 'hurt');
    return p.playMonsterAnim(kid.id, 'death');
  });
  expect(death?.anim, 'death wins immediately').toBe('death');
  expect(death?.frame).toBe(0);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const kid = p.combatMonsters().find((m) => m.kind === 'slime_small' && m.alive);
    if (kid) p.setPosition(kid.x, kid.y - 1, 2);
    p.saveToSlot(2);
  });
  await page.reload();
  await boot(page, 'test=1&debug=1&persist=1');
  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.loadFromSlot(2);
    await p.whenMonstersSynced();
  });

  const restored = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const kids = p.combatMonsters().filter((m) => m.kind === 'slime_small' && m.alive);
    const sprites = p.sprites().filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
    return {
      kids: kids.map((k) => k.id),
      spriteIds: sprites.map((s) => s.monsterId),
      visible: sprites.filter((s) => s.visible && !s.hidden).length
    };
  });
  expect(restored.kids, 'slimelings still alive after load').toHaveLength(2);
  expect(restored.spriteIds.sort(), 'each living slimeling has a sprite').toEqual(restored.kids.slice().sort());
  expect(restored.visible, 'restored slimelings are drawn').toBe(2);
  await page.screenshot({ path: `${OUT}/slimeling-after-reload.png` });
});
