import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE = '/sunken-keep/voxel-lab.html?test=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Lab = {
  ready?: boolean;
  shadows: boolean;
  shadowMapEnabled: boolean;
  fps: number;
  setShadows: (on: boolean) => void;
  setLamp: (on: boolean) => void;
  turnLeft: () => void;
  turnRight: () => void;
  meanLuma: (band?: { y0?: number; y1?: number }) => number;
  debugShadowState: () => {
    shadowMapEnabled: boolean;
    lightCast: number;
    meshCast: number;
    meshReceive: number;
  };
};

test.use(devices['iPhone 15']);

test('voxel-lab turn buttons and visible shadow toggle', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(BASE);
  await page.waitForFunction(
    () => (window as unknown as { __voxelLab?: { ready?: boolean } }).__voxelLab?.ready === true,
    null,
    { timeout: 40000 }
  );
  await page.waitForTimeout(400);

  const left = page.locator('#btn-left');
  const right = page.locator('#btn-right');
  await expect(left).toHaveText('Turn Left');
  await expect(right).toHaveText('Turn Right');
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(leftBox!.height).toBeGreaterThanOrEqual(44);
  expect(leftBox!.width).toBeGreaterThanOrEqual(44);
  expect(rightBox!.height).toBeGreaterThanOrEqual(44);
  expect(rightBox!.width).toBeGreaterThanOrEqual(44);

  await expect(page.locator('#stats')).toContainText('fps');
  await expect(page.locator('#btn-match')).toHaveText('Match game');
  await expect(page.locator('#slider-warmth')).toBeVisible();

  const onState = await page.evaluate(() => {
    const lab = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    lab.setShadows(true);
    return lab.debugShadowState();
  });
  expect(onState.shadowMapEnabled).toBe(true);
  expect(onState.lightCast).toBeGreaterThanOrEqual(2);
  expect(onState.meshCast).toBeGreaterThan(2);
  expect(onState.meshReceive).toBeGreaterThan(2);

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/voxel_lab_shadows_on.png`, fullPage: false });
  const lumaOn = await page.evaluate(() =>
    (window as unknown as { __voxelLab: Lab }).__voxelLab.meanLuma({ y0: 0.05, y1: 0.42 })
  );

  const offState = await page.evaluate(() => {
    const lab = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    lab.setShadows(false);
    return lab.debugShadowState();
  });
  expect(offState.shadowMapEnabled).toBe(false);
  expect(offState.lightCast).toBe(0);
  expect(offState.meshCast).toBe(0);
  expect(offState.meshReceive).toBe(0);

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/voxel_lab_shadows_off.png`, fullPage: false });
  const lumaOff = await page.evaluate(() =>
    (window as unknown as { __voxelLab: Lab }).__voxelLab.meanLuma({ y0: 0.05, y1: 0.42 })
  );

  expect(lumaOff).toBeGreaterThan(lumaOn + 0.008);

  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.setShadows(true));
  await left.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/voxel_lab_after_turn_left.png`, fullPage: false });
});
