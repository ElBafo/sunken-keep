import { mkdirSync } from 'fs';
import { test, expect, devices, type Page } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  tryMoveBackward: () => { result: string; after: { x: number; y: number; dir: number } };
  tryTurnRight: () => string;
  meanLuma: () => number;
  getPosition: () => { x: number; y: number; dir: number };
};

async function sampleLuma(page: Page, ms = 220) {
  const samples: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.meanLuma()));
    await page.waitForTimeout(8);
  }
  return samples;
}

test.use(devices['iPhone 15']);

test('backing toward a wall never fills the view with a near-clipped brick plane', async ({ page }) => {
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

  // Alcove south of the unlit (8,5) sconce. Facing south puts the EOB eye on that wall.
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(8, 6, 2);
  });
  await page.waitForTimeout(80);
  const alcove = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.meanLuma()
  );
  await page.screenshot({ path: `${OUT}/wall_clip_8_6_south.png`, fullPage: false });
  console.log('ALCOVE (8,6) south luma', alcove);
  expect(alcove, 'rest pose is a room, not a near-clipped brick slab').toBeLessThan(90);

  // (8,7) is solid; the flash is turning onto south in the walkable alcove.
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(8, 6, 1);
  });
  await page.waitForTimeout(40);
  const turned = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.tryTurnRight()
  );
  expect(turned).toBe('ok');
  const turnSamples = await sampleLuma(page);
  await page.screenshot({ path: `${OUT}/wall_clip_turn_8_6_south.png`, fullPage: false });
  const turnPeak = Math.max(...turnSamples);
  console.log('TURN samples', turnSamples.length, 'peak', turnPeak, 'end', turnSamples[turnSamples.length - 1]);
  expect(turnPeak, 'no near-clipped brick flash turning onto the (8,5) sconce wall').toBeLessThan(90);

  // Back-step onto a wall-behind square (west wall of (1,7)).
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(2, 7, 1);
  });
  await page.waitForTimeout(40);
  const moved = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.tryMoveBackward()
  );
  expect(moved.result).toBe('ok');
  const samples = await sampleLuma(page);
  await page.screenshot({ path: `${OUT}/wall_clip_back_1_7_east.png`, fullPage: false });
  const peak = Math.max(...samples);
  console.log('BACK-STEP samples', samples.length, 'peak', peak, 'end', samples[samples.length - 1]);
  expect(peak, 'no ~50ms near-clipped brick flash during the back-step').toBeLessThan(90);
});
