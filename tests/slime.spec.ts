import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

// Floor 1 slime is at tiles[2][7] → x=7, y=2 (col, row). Face it from the west.
const SLIME_X = 7;
const SLIME_Y = 2;
const DIR_EAST = 1;

test.use(devices['iPhone 15']);

test('slime is visible from 1 and 2 squares away', async ({ page }) => {
  const errors: string[] = [];
  const failed404s: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('[ERROR]', msg.text());
    }
  });

  page.on('response', response => {
    if (response.status() === 404) {
      failed404s.push(response.url());
      console.log('[404]', response.url());
    }
  });

  await page.goto(`${BASE_URL}/proto3d.html?test=1`);

  await page.waitForFunction(() => (window as any).__proto3d?.ready === true, null, { timeout: 15000 });

  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(500);

  const spriteInfo = await page.evaluate(() => (window as any).__proto3d.sprites());
  const slime = spriteInfo.find((s: { x: number; y: number; frames: number }) => s.x === SLIME_X && s.y === SLIME_Y);
  console.log('Slime sprite info:', JSON.stringify(slime));
  expect(slime, 'slime billboard must exist at tiles[2][7] = (x=7,y=2)').toBeTruthy();
  expect(slime.frames).toBe(4);

  // 2 squares away: (5,2) facing east toward (7,2)
  await page.evaluate(({ x, y, dir }) => {
    (window as any).__proto3d.setPosition(x, y, dir);
  }, { x: SLIME_X - 2, y: SLIME_Y, dir: DIR_EAST });
  await page.waitForTimeout(400);

  const pos2 = await page.evaluate(() => (window as any).__proto3d.getPosition());
  expect(pos2).toEqual({ x: 5, y: 2, dir: 1 });

  await page.screenshot({ path: 'screenshots/proto-slime-2sq.png', fullPage: false });
  console.log('✓ Screenshot: proto-slime-2sq.png (5,2 facing east)');

  // 1 square away: (6,2) facing east toward (7,2)
  await page.evaluate(({ x, y, dir }) => {
    (window as any).__proto3d.setPosition(x, y, dir);
  }, { x: SLIME_X - 1, y: SLIME_Y, dir: DIR_EAST });
  await page.waitForTimeout(250);

  const pos1 = await page.evaluate(() => (window as any).__proto3d.getPosition());
  expect(pos1).toEqual({ x: 6, y: 2, dir: 1 });

  await page.screenshot({ path: 'screenshots/proto-slime-1sq.png', fullPage: false });
  await page.screenshot({ path: 'screenshots/proto-slime.png', fullPage: false });
  console.log('✓ Screenshot: proto-slime-1sq.png / proto-slime.png (6,2 facing east)');

  // Second idle frame from 1 square (animation ticks every 200ms)
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'screenshots/proto-slime-idle-b.png', fullPage: false });
  console.log('✓ Screenshot: proto-slime-idle-b.png (later idle frame)');

  console.log(`Console errors: ${errors.length}`);
  console.log(`404 errors: ${failed404s.length}`);
  if (errors.length) console.log(errors);
  if (failed404s.length) console.log(failed404s);

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
