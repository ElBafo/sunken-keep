import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']);

test('proto3d camera offset, wall sconces, no errors', async ({ page }) => {
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

  const pose = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => (window as any).__proto3d.setPosition(px, py, pd), [x, y, dir]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `screenshots/${file}`, fullPage: false });
    console.log('✓ screenshots/' + file);
  };

  const captureCompareViews = async (suffix: string) => {
    await pose(1, 7, 0, `proto3d-start${suffix}.png`);
    await pose(1, 5, 0, `proto3d-corridor${suffix}.png`);
    await pose(1, 7, 2, `proto3d-wall-1sq${suffix}.png`);
    await pose(5, 2, 3, `proto3d-door-1sq${suffix}.png`);
    await pose(1, 4, 0, `proto3d-water-hall${suffix}.png`);
    await pose(5, 2, 1, `proto3d-slime${suffix}.png`);
    await pose(2, 6, 0, `proto3d-key${suffix}.png`);
  };

  // Palette on (default)
  await captureCompareViews('');
  const startLuma = await page.evaluate(() => {
    (window as any).__proto3d.setPosition(1, 7, 0);
    return (window as any).__proto3d.meanLuma();
  });
  console.log('start view mean luma', startLuma.toFixed(1));

  // Sconce extras (palette on)
  await pose(1, 5, 2, 'proto3d-sconce-side.png');
  await pose(3, 6, 3, 'proto3d-sconce-far.png');
  await pose(1, 7, 0, 'proto3d-sconce-left.png');
  await pose(3, 2, 0, 'proto3d-sconce-right.png');
  await pose(1, 6, 3, 'proto3d-sconce-face.png');
  await pose(1, 7, 0, 'proto3d-palette.png');

  // FPS in the two-torch corridor
  await page.evaluate(() => (window as any).__proto3d.setPosition(1, 7, 0));
  await page.waitForTimeout(3500);
  const fps = await page.evaluate(() => (window as any).__proto3d.fps());
  console.log('two-torch corridor fps', fps);

  // Face the slime from 2 squares away
  await page.evaluate(() => (window as any).__proto3d.setPosition(5, 2, 1));
  await page.waitForTimeout(400);

  const viewport = page.viewportSize()!;
  const canvasBox = await page.locator('#render-canvas').boundingBox();
  expect(canvasBox, 'canvas boundingBox').not.toBeNull();

  const canvas = canvasBox!;
  const canvasBottom = canvas.y + canvas.height;

  expect(canvas.width / canvas.height, '3D view keeps 270/380').toBeCloseTo(270 / 380, 2);
  expect(canvas.width, 'view is CSS-scaled, not width-stretched').toBeLessThanOrEqual(viewport.width + 1);
  expect(canvas.y, 'canvas top >= 0').toBeGreaterThanOrEqual(0);

  const buttonIds = ['#btn-forward', '#btn-left', '#btn-back', '#btn-right'];
  for (const id of buttonIds) {
    const box = await page.locator(id).boundingBox();
    expect(box, `${id} boundingBox`).not.toBeNull();
    expect(box!.y, `${id} top >= canvas bottom`).toBeGreaterThanOrEqual(canvasBottom);
    expect(box!.height, `${id} at least 44pt`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${id} at least 44pt wide`).toBeGreaterThanOrEqual(44);
  }

  const backing = await page.evaluate(() => {
    const c = document.getElementById('render-canvas') as HTMLCanvasElement;
    return { width: c.width, height: c.height };
  });
  expect(backing.width).toBe(270);
  expect(backing.height, 'render target stays 380').toBe(380);

  await page.screenshot({ path: 'screenshots/layout-test.png', fullPage: false });
  await page.screenshot({ path: 'screenshots/proto-slime-2sq.png', fullPage: false });

  // Palette off via ?palette=0
  await page.goto(`${BASE_URL}/proto3d.html?test=1&palette=0`);
  await page.waitForFunction(() => (window as any).__proto3d?.ready === true, null, { timeout: 15000 });
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);
  await captureCompareViews('-nopalette');

  expect(startLuma, 'start view mean luma').toBeGreaterThanOrEqual(30);
  expect(startLuma, 'start view mean luma').toBeLessThanOrEqual(70);
  expect(fps, 'two-torch corridor fps').toBeGreaterThan(20);

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
