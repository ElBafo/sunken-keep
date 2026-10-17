import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  gridX: number;
  gridY: number;
  dir: number;
  draws: number;
  triangles: number;
  fps: number;
  lantern: boolean;
  cell: number;
  eyeHeight: number;
  fov: number;
  setPosition: (x: number, y: number, dir: number) => void;
  stepForward: () => boolean;
  turnLeft: () => boolean;
  meanLuma: () => number;
};

test.use(devices['iPhone 15']);

test('voxel-floor1 boots at New Game start with a lit lantern', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(BASE);
  await page.waitForFunction(
    () => (window as unknown as { __voxelFloor1?: { ready?: boolean } }).__voxelFloor1?.ready === true,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(400);

  const left = page.locator('#btn-left');
  const right = page.locator('#btn-right');
  await expect(left).toHaveText('Turn Left');
  await expect(right).toHaveText('Turn Right');
  const leftBox = await left.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(leftBox!.height).toBeGreaterThanOrEqual(44);

  const state = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    return {
      gridX: api.gridX,
      gridY: api.gridY,
      dir: api.dir,
      lantern: api.lantern,
      cell: api.cell,
      eyeHeight: api.eyeHeight,
      fov: api.fov,
      draws: api.draws,
      triangles: api.triangles,
      luma: api.meanLuma()
    };
  });
  expect(state.gridX).toBe(3);
  expect(state.gridY).toBe(14);
  expect(state.dir).toBe(3);
  expect(state.lantern).toBe(true);
  expect(state.cell).toBe(2);
  expect(state.fov).toBe(80);
  expect(state.eyeHeight).toBeCloseTo(0.94, 2);
  expect(state.draws).toBeGreaterThan(0);
  expect(state.triangles).toBeGreaterThan(0);
  expect(state.luma).toBeGreaterThan(0.02);
  expect(state.luma).toBeLessThan(0.55);

  await page.screenshot({ path: `${OUT}/voxel_floor1_start.png`, fullPage: false });

  const blocked = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.setPosition(2, 14, 2);
    return { back: api.stepForward(), x: api.gridX, y: api.gridY };
  });
  expect(blocked.back).toBe(false);
  expect(blocked.x).toBe(2);
  expect(blocked.y).toBe(14);

  await page.evaluate(() => {
    (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.setPosition(2, 11, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/voxel_floor1_corridor.png`, fullPage: false });
});
