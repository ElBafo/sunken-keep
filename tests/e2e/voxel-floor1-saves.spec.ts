import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  pickupHere: () => boolean;
  handleDoor: (x?: number, y?: number) => string;
  getBag: () => Array<{ item: string; count: number }>;
  doorOpen: (x: number, y: number) => boolean;
  snapDoor: (x: number, y: number, open: boolean) => boolean;
  debugKillAt: (x: number, y: number) => boolean;
  addXp: (n: number) => void;
  getHeroes: () => Array<{
    id: string;
    hp: number;
    maxHp: number;
    mana: number;
    level?: number;
    xp?: number;
    downed: boolean;
  }>;
  combatMonsters: () => Array<{ kind: string; x: number; y: number; alive: boolean }>;
  saveToSlot: (slot: number) => boolean;
  loadFromSlot: (slot: number) => boolean;
  requestManualSave: () => void;
  tryAutosave: () => boolean;
  forceWipe: () => void;
  loadAutosave: () => void;
  gameOverVisible: () => boolean;
  lastMessage: string;
  logLines: string[];
  mapState: () => {
    position: { x: number; y: number; dir: number };
    bag: Array<{ item: string; count: number }>;
    party: Array<{ id: string; hp: number; level: number; xp: number }>;
    doors: Array<{ x: number; y: number; open: boolean; locked: boolean }>;
    monsters: Array<{ kind: string; x: number; y: number; alive: boolean }>;
  };
  gridX: number;
  gridY: number;
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

test('voxel floor 1: save, reload, load, game over, stairs', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);
  await page.evaluate(() => localStorage.clear());

  const played = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(2, 5, 0);
    const picked = api.pickupHere();
    api.setPosition(4, 2, 3);
    const unlocked = api.handleDoor(4, 2);
    api.snapDoor(4, 2, true);
    api.setPosition(6, 5, 1);
    const killed = api.debugKillAt(7, 5);
    api.addXp(220);
    const saved = api.saveToSlot(1);
    return {
      picked,
      unlocked,
      killed,
      saved,
      bag: api.getBag(),
      heroes: api.getHeroes(),
      door: api.doorOpen(4, 2),
      rat: api.combatMonsters().find((m) => m.x === 7 && m.y === 5),
      state: api.mapState()
    };
  });
  expect(played.picked).toBe(true);
  expect(played.unlocked === 'unlocking' || played.unlocked === 'toggled').toBe(true);
  expect(played.killed).toBe(true);
  expect(played.saved).toBe(true);
  expect(played.bag.some((s) => s.item === 'key')).toBe(false);
  expect(played.door).toBe(true);
  expect(played.rat?.alive).toBe(false);
  expect(played.heroes.some((h) => (h.level ?? 1) > 1 || (h.xp ?? 0) > 0)).toBe(true);

  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __voxelFloor1?: { ready?: boolean } }).__voxelFloor1?.ready === true,
    { timeout: 60000 }
  );

  const loaded = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const ok = api.loadFromSlot(1);
    return {
      ok,
      bag: api.getBag(),
      heroes: api.getHeroes(),
      door: api.doorOpen(4, 2),
      rat: api.combatMonsters().find((m) => m.x === 7 && m.y === 5),
      state: api.mapState()
    };
  });
  expect(loaded.ok).toBe(true);
  expect(loaded.door).toBe(true);
  expect(loaded.rat?.alive).toBe(false);
  expect(loaded.state.doors.find((d) => d.x === 4 && d.y === 2)?.open).toBe(true);
  expect(loaded.heroes.some((h) => (h.level ?? 1) > 1 || (h.xp ?? 0) > 0)).toBe(true);
  expect(loaded.state.position.x).toBe(6);
  expect(loaded.state.position.y).toBe(5);

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(3, 14, 3);
    api.tryAutosave();
    api.requestManualSave();
  });
  await expect(page.locator('#title-overlay')).toHaveClass(/show/, { timeout: 15000 });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/voxel_floor1_saveload_menu.png`, fullPage: false });
  await page.evaluate(() => document.getElementById('title-overlay')?.classList.remove('show'));
  await page.waitForTimeout(200);

  const wiped = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.forceWipe();
    return api.gameOverVisible();
  });
  expect(wiped).toBe(true);
  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.loadAutosave();
  });
  const afterGo = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    return {
      over: api.gameOverVisible(),
      door: api.doorOpen(4, 2),
      rat: api.combatMonsters().find((m) => m.x === 7 && m.y === 5)
    };
  });
  expect(afterGo.over).toBe(false);
  expect(afterGo.door).toBe(true);
  expect(afterGo.rat?.alive).toBe(false);

  const stairs = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(16, 9, 2);
    api.setPosition(16, 10, 2);
    return {
      message: api.lastMessage,
      logs: api.logLines,
      pos: api.mapState().position
    };
  });
  expect(stairs.pos.x).toBe(16);
  expect(stairs.pos.y).toBe(10);
  const line = [stairs.message, ...stairs.logs].join(' ');
  expect(line).toMatch(/stairs lead down into darkness/i);
  expect(line).toMatch(/Floor 2 is coming soon/i);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/voxel_floor1_stairs.png`, fullPage: false });
});
