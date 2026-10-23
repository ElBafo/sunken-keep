import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  pickupHere: () => boolean;
  pickupAt: (x: number, y: number) => boolean;
  getBag: () => Array<{ item: string; count: number }>;
  giveItem: (id: string, n?: number) => number;
  giveKey: () => void;
  handleDoor: (x?: number, y?: number) => string;
  doorLocked: (x: number, y: number) => boolean;
  doorOpen: (x: number, y: number) => boolean;
  openBag: () => void;
  closeBag: () => void;
  bagOpen: () => boolean;
  equipBagSlot: (i: number, hero: string) => boolean;
  getHands: () => Array<{ id: string; main: string; off: string }>;
  lastMessage: string;
  lastUi: () => string[];
  floorItems: () => Array<{ x: number; y: number; item: string; visible: boolean }>;
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

test('voxel floor 1: pick up a key, unlock its door, open the bag and equip', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  await page.evaluate(() => {
    (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.setPosition(2, 6, 0);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/voxel_floor1_floor_item.png`, fullPage: false });

  const picked = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(2, 5, 0);
    return {
      ok: api.pickupHere(),
      bag: api.getBag(),
      items: api.floorItems(),
      ui: api.lastUi()
    };
  });
  expect(picked.ok).toBe(true);
  expect(picked.bag.some((s) => s.item === 'key')).toBe(true);
  expect(picked.items.find((i) => i.x === 2 && i.y === 5)?.visible ?? false).toBe(false);
  expect(picked.ui.some((n) => n === 'key' || n === 'pickup')).toBe(true);

  const locked = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(4, 2, 3);
    return {
      locked: api.doorLocked(4, 2),
      result: api.handleDoor(4, 2),
      open: api.doorOpen(4, 2),
      stillLocked: api.doorLocked(4, 2),
      bag: api.getBag(),
      message: api.lastMessage,
      ui: api.lastUi()
    };
  });
  expect(locked.locked).toBe(true);
  expect(locked.result).toBe('unlocking');
  expect(locked.stillLocked).toBe(false);
  expect(locked.bag.some((s) => s.item === 'key')).toBe(false);
  expect(locked.ui).toContain('door_unlock');

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.giveItem('iron_shield');
    api.openBag();
  });
  await page.waitForTimeout(400);
  await expect(page.locator('#inventory-screen')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.bagOpen())).toBe(
    true
  );
  await page.screenshot({ path: `${OUT}/voxel_floor1_bag_open.png`, fullPage: false });

  const equipped = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    const i = api.getBag().findIndex((s) => s.item === 'iron_shield');
    return {
      i,
      ok: api.equipBagSlot(i, 'mags'),
      hands: api.getHands(),
      bag: api.getBag()
    };
  });
  expect(equipped.i).toBeGreaterThanOrEqual(0);
  expect(equipped.ok).toBe(true);
  expect(equipped.hands.find((h) => h.id === 'mags')?.off).toBe('iron_shield');
  expect(equipped.bag.some((s) => s.item === 'tricks_pouch')).toBe(true);
});
