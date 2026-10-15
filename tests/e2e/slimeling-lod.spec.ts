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
  darkFx: () => {
    eyes: Array<{ x: number; y: number; monster: string; monsterId?: string | null; visible: boolean }>;
  };
  lastBarkTrigger: () => string | null;
  lastMessage: () => string;
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

test('split leaves two slimelings, no live slime-7, darkness + eyes', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const eyesOnly = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.snapDoor?.(19, 5, true);
    p.setPosition(19, 3, 2);
    const slime = p.sprites().filter((s) => s.monsterKind === 'slime' && !s.disposed);
    return {
      trigger: p.lastBarkTrigger(),
      visibleSlime: slime.filter((s) => s.visible && !s.hidden).length,
      eyes: p.darkFx().eyes.filter((e) => e.monster === 'slime' && e.visible).length
    };
  });
  expect(eyesOnly.trigger, 'eyes do not fire slime_reveal').not.toBe('slime_reveal');
  expect(eyesOnly.visibleSlime, 'unlit slime body stays hidden at 4 squares').toBe(0);

  const adjacent = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(19, 6, 2);
    const slime = p.sprites().filter((s) => s.monsterKind === 'slime' && !s.disposed);
    return {
      trigger: p.lastBarkTrigger(),
      visibleSlime: slime.filter((s) => s.visible && !s.hidden).length,
      message: p.lastMessage()
    };
  });
  expect(adjacent.trigger, 'body draw at (19,6) fires slime_reveal').toBe('slime_reveal');
  expect(adjacent.visibleSlime, 'adjacent slime body is drawn').toBe(1);

  const split = await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const slime = p.combatMonsters().find((m) => m.kind === 'slime' && m.alive);
    if (!slime) return { ok: false, kids: [] as ReturnType<Proto3d['combatMonsters']> };
    p.setMonsterHp(slime.id, Math.floor(slime.hp / 2));
    await p.whenMonstersSynced();
    p.setPosition(slime.x, slime.y - 1, 2);
    return {
      ok: true,
      parentId: slime.id,
      kids: p.combatMonsters().filter((m) => m.kind === 'slime_small' && m.alive),
      sprites: p.sprites().filter((s) => s.kind === 'monster' && s.x === 19 && s.y === 7)
    };
  });
  expect(split.ok, 'slime splits').toBe(true);
  expect(split.kids, 'two slimelings in combat state').toHaveLength(2);

  const after = await page.evaluate((parentId) => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const atTile = p.sprites().filter((s) => s.kind === 'monster' && s.x === 19 && s.y === 7);
    const slimelings = atTile.filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
    const parent = p.sprites().filter((s) => s.monsterId === parentId);
    const liveParent = parent.filter((s) => !s.disposed && s.visible && !s.hidden);
    return {
      slimelings: slimelings.map((s) => ({ id: s.monsterId, visible: s.visible, hidden: s.hidden })),
      parentCount: parent.length,
      liveParent: liveParent.length,
      eyes: p.darkFx().eyes.filter((e) => e.monster === 'slime_small')
    };
  }, split.parentId);
  expect(after.slimelings, 'exactly two slimeling sprites').toHaveLength(2);
  expect(after.liveParent, 'no visible live parent slime-7').toBe(0);
  expect(after.eyes, 'one eye pair per slimeling').toHaveLength(2);

  const atDist = async (back: number) =>
    page.evaluate((n) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      const kid = p.combatMonsters().find((m) => m.kind === 'slime_small' && m.alive);
      if (!kid) return { sprites: [] as ReturnType<Proto3d['sprites']>, liveParent: 0 };
      p.setPosition(kid.x, kid.y - n, 2);
      const sprites = p.sprites().filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
      const parent = p.sprites().filter(
        (s) => s.monsterKind === 'slime' && s.visible && !s.hidden && !s.disposed
      );
      return {
        sprites,
        visible: sprites.filter((s) => s.visible && !s.hidden).length,
        lods: sprites.map((s) => s.lod),
        liveParent: parent.length
      };
    }, back);

  const d1 = await atDist(1);
  expect(d1.sprites, 'two slimelings at 1').toHaveLength(2);
  expect(d1.visible, 'adjacent bodies draw').toBe(2);
  expect(d1.liveParent, 'no visible slime-7 at 1').toBe(0);
  await page.screenshot({ path: `${OUT}/slimeling-lod-1.png` });

  for (const [dist, lod] of [
    [2, 'near'],
    [3, 'mid'],
    [4, 'far']
  ] as const) {
    const got = await atDist(dist);
    expect(got.sprites, `two slimelings at ${dist}`).toHaveLength(2);
    expect(got.visible, `unlit bodies hidden at ${dist}`).toBe(0);
    expect(got.lods.every((l) => l === lod), `${lod} LOD at ${dist}`).toBe(true);
    expect(got.liveParent, `no visible slime-7 at ${dist}`).toBe(0);
    await page.screenshot({ path: `${OUT}/slimeling-lod-${dist}.png` });
  }

  const rat = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(10, 3, 0);
    const sprite = p.sprites().find((s) => s.monsterId === 'keep_rat-1' || (s.monsterKind === 'keep_rat' && s.x === 10 && s.y === 1));
    return {
      visible: !!(sprite && sprite.visible && !sprite.hidden && !sprite.disposed),
      disposed: !!sprite?.disposed,
      eyes: p.darkFx().eyes.some((e) => e.x === 10 && e.y === 1 && e.visible)
    };
  });
  expect(rat.visible, 'keep_rat-1 is not drawn from (10,3)').toBe(false);

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
    const kid = kids[0];
    if (kid) p.setPosition(kid.x, kid.y - 1, 2);
    return {
      kids: kids.map((k) => k.id),
      spriteIds: sprites.map((s) => s.monsterId),
      eyes: p.darkFx().eyes.filter((e) => e.monster === 'slime_small').length
    };
  });
  expect(restored.kids, 'slimelings still alive after load').toHaveLength(2);
  expect(restored.spriteIds.sort(), 'each living slimeling has a sprite').toEqual(restored.kids.slice().sort());
  expect(restored.eyes, 'slimeling eyes rebuild after load').toBe(2);
  await page.screenshot({ path: `${OUT}/slimeling-after-reload.png` });
});
