import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type ScreenRect = {
  height: number;
  feetY: number;
  width: number;
  worldX: number;
  worldZ: number;
  scaleY: number;
  lod: string | null;
};

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  spriteScreen: (kind: 'monster' | 'item', x: number, y: number) => ScreenRect | null;
  sprites: () => Array<{ monsterKind?: string; x: number; y: number; worldX: number; worldZ: number; scaleY: number; baseH: number; lod?: string | null }>;
  cameraSpec: () => { eyeHeight: number; backOffsetTiles: number; pitchDeg: number; fov: number; view: [number, number] };
  listenerPose: () => { x: number; y: number; z: number };
  snapDoor?: (x: number, y: number, open: boolean) => void;
};

test.use(devices['iPhone 15']);

async function boot(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForTimeout(400);
}

async function measure(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  dir: number,
  kind: 'monster' | 'item',
  sx: number,
  sy: number
) {
  return page.evaluate(
    ({ x, y, dir, kind, sx, sy }) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(x, y, dir);
      return p.spriteScreen(kind, sx, sy);
    },
    { x, y, dir, kind, sx, sy }
  );
}

test('slime size grows smoothly at 3 / 2 / 1 squares; approach-independent', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const cam = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.cameraSpec());
  expect(cam.eyeHeight).toBeCloseTo(0.94, 5);
  expect(cam.backOffsetTiles).toBeCloseTo(0.5, 5);
  expect(cam.pitchDeg).toBeCloseTo(-3.5, 5);
  expect(cam.fov).toBe(80);
  expect(cam.view).toEqual([270, 380]);

  const listen = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 2, 1);
    return p.listenerPose();
  });
  expect(listen.x, 'listener on party square').toBeCloseTo(12, 5);
  expect(listen.z).toBeCloseTo(4, 5);

  const far = await measure(page, 4, 2, 1, 'monster', 7, 2);
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-3-squares.png` });
  const mid = await measure(page, 5, 2, 1, 'monster', 7, 2);
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-2-squares.png` });
  const near = await measure(page, 6, 2, 1, 'monster', 7, 2);
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-1-square.png` });

  expect(far, 'slime at 3 squares').toBeTruthy();
  expect(mid, 'slime at 2 squares').toBeTruthy();
  expect(near, 'slime at 1 square').toBeTruthy();
  expect(far!.lod, '3 squares uses mid frames').toBe('mid');
  expect(mid!.lod, '2 squares uses near frames').toBe('near');
  expect(near!.lod, '1 square uses close frames').toBe('close');

  expect(mid!.height, 'height grows 3 → 2').toBeGreaterThan(far!.height);
  expect(near!.height, 'height grows 2 → 1').toBeGreaterThan(mid!.height);
  expect(mid!.feetY, 'feet move down 3 → 2').toBeGreaterThan(far!.feetY);
  expect(near!.feetY, 'feet move down 2 → 1').toBeGreaterThan(mid!.feetY);

  const step32 = mid!.height / far!.height;
  const step21 = near!.height / mid!.height;
  expect(step21, 'no 2× jump from 2 to 1').toBeLessThan(2);
  expect(step21).toBeGreaterThan(1.05);
  expect(step32).toBeGreaterThan(1.05);
  expect(step32).toBeLessThan(2);

  expect(near!.worldX, 'feet at square centre').toBeCloseTo(14, 5);
  expect(near!.worldZ).toBeCloseTo(4, 5);
  expect(near!.scaleY, 'close and near share the same world height').toBeCloseTo(mid!.scaleY, 5);

  const fromEast = await measure(page, 9, 2, 3, 'monster', 7, 2);
  expect(fromEast!.height, '2-square size does not depend on approach').toBeCloseTo(mid!.height, 1);
  expect(fromEast!.feetY).toBeCloseTo(mid!.feetY, 1);

  const backToTwo = await measure(page, 5, 2, 1, 'monster', 7, 2);
  expect(backToTwo!.height, 'size at 2 squares is the same after stepping away').toBeCloseTo(mid!.height, 1);

  const rat = await measure(page, 6, 5, 1, 'monster', 7, 5);
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/rat-1-square.png` });
  expect(rat, 'keep_rat at 1 square').toBeTruthy();
  expect(rat!.lod).toBe('close');
  expect(rat!.scaleY, 'rat is much shorter than the slime').toBeLessThan(near!.scaleY * 0.55);
  expect(rat!.worldX).toBeCloseTo(14, 5);
  expect(rat!.worldZ).toBeCloseTo(10, 5);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(6, 2, 1));
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-1-square-again.png` });

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(7, 7, 2));
  await page.waitForTimeout(120);
  const item = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return p.spriteScreen('item', 7, 7);
  });
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/item-own-square-wall.png` });
  expect(item, 'own-square item is on screen').toBeTruthy();
  expect(item!.feetY, 'own-square item sits in the visible floor strip').toBeGreaterThan(item!.topY);
});
