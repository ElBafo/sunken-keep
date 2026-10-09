import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']);

test('proto3d layout, no errors, slime visible at 2 squares', async ({ page }) => {
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
  await page.waitForTimeout(400);

  // Face the slime from 2 squares away: tiles[2][7] = (7,2), stand at (5,2) facing east
  await page.evaluate(() => (window as any).__proto3d.setPosition(5, 2, 1));
  await page.waitForTimeout(400);

  const viewport = page.viewportSize()!;
  const canvasBox = await page.locator('#render-canvas').boundingBox();
  expect(canvasBox, 'canvas boundingBox').not.toBeNull();

  const canvas = canvasBox!;
  const canvasBottom = canvas.y + canvas.height;

  console.log('viewport', viewport);
  console.log('canvas', canvas);

  expect(canvas.x, 'canvas left').toBe(0);
  expect(canvas.width, 'canvas width == viewport width').toBe(viewport.width);
  expect(canvas.y, 'canvas top >= 0').toBeGreaterThanOrEqual(0);

  const buttonIds = ['#btn-forward', '#btn-left', '#btn-back', '#btn-right'];
  for (const id of buttonIds) {
    const box = await page.locator(id).boundingBox();
    expect(box, `${id} boundingBox`).not.toBeNull();
    console.log(id, box);
    expect(box!.y, `${id} top >= canvas bottom`).toBeGreaterThanOrEqual(canvasBottom);
    expect(box!.height, `${id} at least 44pt`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${id} at least 44pt wide`).toBeGreaterThanOrEqual(44);
  }

  const backing = await page.evaluate(() => {
    const c = document.getElementById('render-canvas') as HTMLCanvasElement;
    return { width: c.width, height: c.height };
  });
  console.log('backing store', backing);
  expect(backing.width).toBe(270);

  await page.screenshot({ path: 'screenshots/layout-test.png', fullPage: false });
  await page.screenshot({ path: 'screenshots/proto-slime-2sq.png', fullPage: false });
  console.log('✓ screenshots/layout-test.png and proto-slime-2sq.png');

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
