import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  playOpeningCaveIn: (instant?: boolean) => void;
  skipCaveIn: () => void;
  caveInDone: () => boolean;
  caveInBusy: () => boolean;
  rubbleBlocking: (x: number, y: number) => boolean;
  takeFacingTorch: () => boolean;
  snuffFacingTorch: () => boolean;
  handleFacingTorch: () => boolean;
  sconces: () => Array<{ x: number; y: number; face: string; lit: boolean; empty: boolean }>;
  openSecret: (x: number, y: number) => boolean;
  secretOpen: (x: number, y: number) => boolean;
  pickupHere: () => boolean;
  handleDoor: (x?: number, y?: number) => string;
  doorOpen: (x: number, y: number) => boolean;
  doorLocked: (x: number, y: number) => boolean;
  captureSave: () => { floors: Record<string, { tiles: Array<{ x: number; y: number; doorOpen?: boolean; doorLocked?: boolean }> }> };
  saveToSlot: (slot: number) => boolean;
  loadFromSlot: (slot: number) => boolean;
  requestManualLoad: () => void;
  hitTitleBack: () => boolean;
  setHand: (id: string, hand: 'main' | 'off', item: string) => void;
  titleVisibleNow: () => boolean;
  openSettings: () => void;
  settingsVisible: () => boolean;
  getSoundOn: () => boolean;
  getQualityPref: () => string;
  lastMessage: string;
  logLines: string[];
  mapState: () => { position: { x: number; y: number; dir: number } };
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

test('voxel floor 1: cave-in, torch, secret, door-save, settings, stairs view', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);
  await page.evaluate(() => localStorage.clear());

  const cave = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.playOpeningCaveIn(false);
    return { busy: api.caveInBusy() };
  });
  expect(cave.busy).toBe(true);
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
      return api.caveInDone() && api.rubbleBlocking(3, 14);
    },
    null,
    { timeout: 8000 }
  );

  const torch = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(6, 5, 0);
    api.setHand('brannoc', 'off', 'empty_hand');
    const took = api.takeFacingTorch();
    api.setPosition(3, 1, 1);
    api.handleFacingTorch();
    const snuffed = api.snuffFacingTorch();
    return {
      took,
      snuffed,
      sconces: api.sconces().filter((s) => (s.x === 6 && s.y === 4) || (s.x === 4 && s.y === 1))
    };
  });
  expect(torch.took).toBe(true);
  expect(torch.snuffed).toBe(true);
  expect(torch.sconces.find((s) => s.x === 6 && s.y === 4)).toMatchObject({ lit: false, empty: true });
  expect(torch.sconces.find((s) => s.x === 4 && s.y === 1)).toMatchObject({ lit: false, empty: false });

  const secret = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(6, 13, 3);
    const opened = api.openSecret(5, 13);
    return { opened, open: api.secretOpen(5, 13) };
  });
  expect(secret.opened).toBe(true);
  expect(secret.open).toBe(true);

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(2, 5, 0);
    api.pickupHere();
    api.setPosition(3, 2, 1);
  });
  const door = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const result = api.handleDoor(4, 2);
    const save = api.captureSave();
    const tile = save.floors['1']?.tiles.find((t) => t.x === 4 && t.y === 2);
    const saved = api.saveToSlot(1);
    return { result, tile, saved, open: api.doorOpen(4, 2), locked: api.doorLocked(4, 2) };
  });
  expect(door.result === 'unlocking' || door.result === 'toggled').toBe(true);
  expect(door.tile?.doorOpen).toBe(true);
  expect(door.tile?.doorLocked).toBe(false);
  expect(door.saved).toBe(true);

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
      door: api.doorOpen(4, 2),
      locked: api.doorLocked(4, 2),
      secret: api.secretOpen(5, 13),
      rubble: api.rubbleBlocking(3, 14),
      sconces: api.sconces().filter((s) => (s.x === 6 && s.y === 4) || (s.x === 4 && s.y === 1))
    };
  });
  expect(loaded.ok).toBe(true);
  expect(loaded.door).toBe(true);
  expect(loaded.locked).toBe(false);
  expect(loaded.secret).toBe(true);
  expect(loaded.rubble).toBe(true);
  expect(loaded.sconces.find((s) => s.x === 6 && s.y === 4)).toMatchObject({ lit: false, empty: true });
  expect(loaded.sconces.find((s) => s.x === 4 && s.y === 1)).toMatchObject({ lit: false, empty: false });

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.requestManualLoad();
  });
  await expect(page.locator('#title-overlay')).toHaveClass(/show/, { timeout: 15000 });
  const back = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const hidden = api.hitTitleBack();
    return { hidden, visible: api.titleVisibleNow() };
  });
  expect(back.hidden).toBe(true);
  expect(back.visible).toBe(false);

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.openSettings();
  });
  await expect(page.locator('#settings-overlay')).toHaveClass(/show/, { timeout: 5000 });
  await page.locator('#btn-sound-off').click();
  await page.locator('#btn-lang-el').click();
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    return {
      visible: api.settingsVisible(),
      sound: api.getSoundOn(),
      quality: api.getQualityPref()
    };
  });
  expect(settings.visible).toBe(true);
  expect(settings.sound).toBe(false);
  await page.screenshot({ path: `${OUT}/voxel_floor1_settings_menu.png`, fullPage: false });
  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.openSettings();
  });
  await page.locator('#btn-settings-close').click();

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(16, 9, 2);
  });
  await page.waitForTimeout(500);
  const stairs = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    return api.mapState().position;
  });
  expect(stairs.x).toBe(16);
  expect(stairs.y).toBe(9);
  await page.screenshot({ path: `${OUT}/voxel_floor1_stairs_view.png`, fullPage: false });
});
