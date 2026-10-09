import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  getPosition: () => { x: number; y: number; dir: number };
  noteOpen: () => boolean;
  doorOpen: (x: number, y: number) => boolean;
  giveKey: () => void;
  interactCount: () => number;
};

test.use(devices['iPhone 15']);

test('proto3d iPhone tap: canvas interact once; HTML buttons still work', async ({ page }) => {
  test.setTimeout(90000);

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForTimeout(400);

  const pose = async (x: number, y: number, dir: number) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    await page.waitForTimeout(120);
  };

  const count = () => page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interactCount());

  // --- Canvas tap on Pell's desk: one tap opens, a second tap closes ---
  await pose(11, 9, 1);
  const deskBefore = await count();
  await page.locator('#render-canvas').tap();
  await page.waitForTimeout(80);
  expect(await count(), 'desk tap fires interact exactly once').toBe(deskBefore + 1);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
    'note stays open after a single real tap'
  ).toBe(true);
  await expect(page.locator('#note-overlay')).toHaveClass(/show/);

  await page.locator('#render-canvas').tap();
  await page.waitForTimeout(80);
  expect(await count(), 'second desk tap fires interact exactly once more').toBe(deskBefore + 2);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
    'second tap closes Pell\'s note'
  ).toBe(false);
  await expect(page.locator('#note-overlay')).not.toHaveClass(/show/);

  // --- Canvas tap on the locked door: one tap unlocks/opens, does not toggle twice ---
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.giveKey());
  await pose(3, 2, 1);
  const doorBefore = await count();
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2))
  ).toBe(false);
  await page.locator('#render-canvas').tap();
  await page.waitForTimeout(80);
  expect(await count(), 'door canvas tap fires interact exactly once').toBe(doorBefore + 1);
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2)),
    'a single tap opens the door and does not close it again'
  ).toBe(true);

  // --- Arrow buttons still respond to a real tap (not broken by canvas preventDefault) ---
  await pose(1, 7, 0);
  await page.locator('#btn-forward').tap();
  await page.waitForTimeout(280);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getPosition()),
    'forward button tap moves the party'
  ).toMatchObject({ x: 1, y: 6, dir: 0 });

  await page.locator('#btn-right').tap();
  await page.waitForTimeout(280);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getPosition()),
    'right button tap turns the party'
  ).toMatchObject({ x: 1, y: 6, dir: 1 });

  // --- DOOR button still responds to a real tap ---
  await pose(3, 2, 1);
  await expect(page.locator('#btn-door')).toBeVisible();
  const doorBtnBefore = await count();
  const openBeforeBtn = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2)
  );
  await page.locator('#btn-door').tap();
  await page.waitForTimeout(80);
  expect(await count(), 'DOOR button tap fires interact exactly once').toBe(doorBtnBefore + 1);
  await page.waitForTimeout(800);
  const openAfterBtn = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2)
  );
  expect(openAfterBtn, 'DOOR button tap toggles the door once').not.toBe(openBeforeBtn);
});
