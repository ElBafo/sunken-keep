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
  noteOpen: () => boolean;
  hideNote: () => boolean;
  useBagSlot: (i: number) => void;
  equipBagSlot: (i: number, hero: string) => boolean;
  getHands: () => Array<{ id: string; main: string; off: string }>;
  lastMessage: string;
  lastUi: () => string[];
  logLines: string[];
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

test.use({ viewport: { width: 420, height: 912 }, hasTouch: true, isMobile: true });

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
  expect(locked.message).toMatch(/key turns|lock groans/i);

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

test('voxel floor 1: journal reader opens from the bag and the HUD bag button closes the bag', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const opened = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.giveItem('journal_page');
    const i = api.getBag().findIndex((s) => s.item === 'journal_page');
    api.useBagSlot(i);
    return {
      i,
      noteOpen: api.noteOpen(),
      title: document.getElementById('note-title')?.textContent ?? '',
      text: document.getElementById('note-text')?.textContent ?? '',
      overlay: document.getElementById('note-overlay')?.classList.contains('show') ?? false,
      message: api.lastMessage,
      log: api.logLines
    };
  });
  expect(opened.i).toBeGreaterThanOrEqual(0);
  expect(opened.noteOpen).toBe(true);
  expect(opened.overlay).toBe(true);
  expect(opened.title).toMatch(/Orrun/);
  expect(opened.text).toContain('The Tide asks only for fire.');
  expect(opened.text).toContain('Floor by floor, we give it.');
  expect(opened.text).toContain('- O.S.');
  expect(opened.message).toContain('The Tide asks only for fire.');
  expect(opened.log.some((line) => /Orrun's journal/.test(line))).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/voxel_floor1_journal_reader.png`, fullPage: false });

  await page.locator('#note-overlay').tap();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.noteOpen())
  ).toBe(false);
  await expect(page.locator('#note-overlay')).not.toHaveClass(/show/);

  await page.evaluate(() => (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.openBag());
  await page.waitForTimeout(400);
  await expect(page.locator('#inventory-screen')).toBeVisible();
  const bagBtn = page.locator('#btn-bag');
  await expect(bagBtn).toBeVisible();
  const stacked = await page.evaluate(() => {
    const bag = document.getElementById('btn-bag');
    const inv = document.getElementById('inventory-screen');
    if (!bag || !inv) return null;
    const bagZ = window.getComputedStyle(bag).zIndex;
    const invZ = window.getComputedStyle(inv).zIndex;
    const r = bag.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      bagZ,
      invZ,
      bagOnTop: !!(top && (top === bag || bag.contains(top))),
      w: r.width,
      h: r.height
    };
  });
  expect(Number(stacked?.bagZ)).toBeGreaterThan(Number(stacked?.invZ));
  expect(stacked?.bagOnTop).toBe(true);
  expect((stacked?.w ?? 0) >= 44 && (stacked?.h ?? 0) >= 44).toBe(true);
  await page.screenshot({ path: `${OUT}/voxel_floor1_bag_button.png`, fullPage: false });

  await bagBtn.tap();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.bagOpen())
  ).toBe(false);
  await expect(page.locator('#inventory-screen')).toBeHidden();
});
