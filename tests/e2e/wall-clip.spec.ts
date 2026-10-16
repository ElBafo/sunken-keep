import { mkdirSync } from 'fs';
import { test, expect, devices, type Page } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  tryMoveBackward: () => { result: string; after: { x: number; y: number; dir: number } };
  wallClearance: () => number;
  poseCamera: (gridX: number, gridY: number, rotY: number) => number;
  poseCameraRaw: (gridX: number, gridY: number, rotY: number) => number;
};

/** CAMERA_NEAR 0.08 + 0.05 margin. */
const MIN_CLEARANCE = 0.13;
const CAMERA_NEAR = 0.08;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function rot(dir: number): number {
  return (-dir * Math.PI) / 2;
}

async function pose(
  page: Page,
  gridX: number,
  gridY: number,
  fromDir: number,
  toDir: number,
  t: number,
  raw: boolean
): Promise<number> {
  const e = easeInOutQuad(t);
  let fromRot = rot(fromDir);
  let toRot = rot(toDir);
  if (Math.abs(toRot - fromRot) > Math.PI) {
    if (toRot > fromRot) fromRot += Math.PI * 2;
    else toRot += Math.PI * 2;
  }
  const r = fromRot + (toRot - fromRot) * e;
  const gx = gridX;
  const gy = gridY;
  return page.evaluate(
    ({ gx: x, gy: y, r: rotY, raw: useRaw }) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return useRaw ? p.poseCameraRaw(x, y, rotY) : p.poseCamera(x, y, rotY);
    },
    { gx, gy, r, raw }
  );
}

test.use(devices['iPhone 15']);

test('backing toward a wall never puts the near plane through the wall face', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });
  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(8, 6, 2);
  });
  await page.waitForTimeout(40);
  const alcove = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.wallClearance()
  );
  await page.screenshot({ path: `${OUT}/wall_clip_8_6_south.png`, fullPage: false });
  console.log('ALCOVE (8,6) south clearance', alcove);
  expect(alcove, 'rest pose stays off the sconce wall').toBeGreaterThanOrEqual(MIN_CLEARANCE);

  // (8,7) is solid; the flash is turning onto south in the walkable alcove.
  let clampedMin = Infinity;
  let rawMin = Infinity;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    rawMin = Math.min(rawMin, await pose(page, 8, 6, 1, 2, t, true));
    clampedMin = Math.min(clampedMin, await pose(page, 8, 6, 1, 2, t, false));
  }
  await pose(page, 8, 6, 1, 2, 0.97, true);
  await page.locator('#canvas-container').screenshot({ path: `${OUT}/wall_clip_MAINLIKE_turn_097.png` });
  await pose(page, 8, 6, 1, 2, 0.97, false);
  await page.locator('#canvas-container').screenshot({ path: `${OUT}/wall_clip_clamped_turn_097.png` });
  console.log('TURN (8,6) E→S rawMin', rawMin, 'clampedMin', clampedMin);
  expect(rawMin, 'unclamped EOB eye clips the sconce wall during the turn').toBeLessThan(CAMERA_NEAR);
  expect(clampedMin, '0 near-wall frames turning onto the (8,5) sconce wall').toBeGreaterThanOrEqual(
    MIN_CLEARANCE
  );

  let backClamped = Infinity;
  let backRaw = Infinity;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const e = easeInOutQuad(t);
    const gx = 2 + (1 - 2) * e;
    const gy = 7;
    const r = rot(1);
    const raw = await page.evaluate(
      ({ gx: x, gy: y, r: rotY }) =>
        (window as unknown as { __proto3d: Proto3d }).__proto3d.poseCameraRaw(x, y, rotY),
      { gx, gy, r }
    );
    const clamped = await page.evaluate(
      ({ gx: x, gy: y, r: rotY }) =>
        (window as unknown as { __proto3d: Proto3d }).__proto3d.poseCamera(x, y, rotY),
      { gx, gy, r }
    );
    backRaw = Math.min(backRaw, raw);
    backClamped = Math.min(backClamped, clamped);
  }
  await page.locator('#canvas-container').screenshot({ path: `${OUT}/wall_clip_back_1_7_east.png` });
  console.log('BACK-STEP (2,7)→(1,7)E rawMin', backRaw, 'clampedMin', backClamped);
  expect(backRaw, 'unclamped back-step clips the west wall').toBeLessThan(CAMERA_NEAR);
  expect(backClamped, '0 near-wall frames during the back-step').toBeGreaterThanOrEqual(MIN_CLEARANCE);
});
