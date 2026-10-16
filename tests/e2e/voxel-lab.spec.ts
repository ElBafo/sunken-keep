import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE = '/sunken-keep/voxel-lab.html?test=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Lab = {
  ready?: boolean;
  shadows: boolean;
  shadowMapEnabled: boolean;
  seeThrough: boolean;
  fps: number;
  setShadows: (on: boolean) => void;
  setLamp: (on: boolean) => void;
  setSeeThrough: (on: boolean) => void;
  turnLeft: () => void;
  turnRight: () => void;
  meanLuma: (band?: { y0?: number; y1?: number }) => number;
  debugShadowState: () => {
    shadowMapEnabled: boolean;
    lightCast: number;
    meshCast: number;
    meshReceive: number;
  };
  debugActors: () => {
    chestName: string;
    chestMeshes: number;
    chestCast: number;
    slimeName: string;
    slimeCast: boolean;
    slimeSeeThrough: boolean;
    slimeDepthWrite: boolean;
    slimeOpacity: number;
    slimeHasDepthMat: boolean;
    slimeDepthAlphaTest: number;
    chestHasFrontMap: boolean;
    chestHasSideMap: boolean;
    chestHasTopMap: boolean;
    contactCount: number;
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
  await expect(page.locator('#btn-see-through')).toHaveText('See-through slime');
  await expect(page.locator('#slider-warmth')).toBeVisible();

  const firstLuma = await page.evaluate(() =>
    (window as unknown as { __voxelLab: Lab }).__voxelLab.meanLuma({ y0: 0.12, y1: 0.45 })
  );
  expect(firstLuma, 'first load with shadows on is not solid black').toBeGreaterThan(0.06);

  const onState = await page.evaluate(() => {
    const lab = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    lab.setShadows(true);
    return lab.debugShadowState();
  });
  expect(onState.shadowMapEnabled).toBe(true);
  expect(onState.lightCast).toBeGreaterThanOrEqual(2);
  expect(onState.meshCast).toBeGreaterThan(2);
  expect(onState.meshReceive).toBeGreaterThan(2);

  const actorsOn = await page.evaluate(() =>
    (window as unknown as { __voxelLab: Lab }).__voxelLab.debugActors()
  );
  expect(actorsOn.chestName).toBe('lab-chest');
  expect(actorsOn.chestMeshes).toBeGreaterThanOrEqual(1);
  expect(actorsOn.chestCast).toBeGreaterThanOrEqual(1);
  expect(actorsOn.chestHasFrontMap).toBe(true);
  expect(actorsOn.chestHasSideMap).toBe(true);
  expect(actorsOn.chestHasTopMap).toBe(true);
  expect(actorsOn.contactCount).toBeGreaterThanOrEqual(2);
  expect(actorsOn.slimeName).toBe('lab-slime');
  expect(actorsOn.slimeCast).toBe(true);
  expect(actorsOn.slimeHasDepthMat).toBe(true);
  expect(actorsOn.slimeDepthAlphaTest).toBeGreaterThan(0.2);
  expect(actorsOn.slimeDepthWrite).toBe(true);

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

  await page.evaluate(() => {
    const lab = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    lab.setShadows(true);
    lab.setSeeThrough(true);
  });
  const ghost = await page.evaluate(() =>
    (window as unknown as { __voxelLab: Lab }).__voxelLab.debugActors()
  );
  expect(ghost.slimeSeeThrough).toBe(true);
  expect(ghost.slimeDepthWrite).toBe(false);
  expect(ghost.slimeCast).toBe(false);
  expect(ghost.slimeOpacity).toBeLessThan(1);
  await expect(page.locator('#btn-see-through')).toHaveText('See-through on');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/voxel_lab_see_through_on.png`, fullPage: false });

  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.setSeeThrough(false));
  await left.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/voxel_lab_after_turn_left.png`, fullPage: false });
});
