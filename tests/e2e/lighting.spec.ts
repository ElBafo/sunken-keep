import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  interact: () => void;
  getOil: () => number;
  setOil: (n: number) => void;
  lastMessage: () => string;
  torchStates: () => Array<{ x: number; y: number; face: string; lit: boolean; capped: boolean }>;
  tileBrightness: (x: number, y: number) => number;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => { luma: number; fogRatio: number; n: number };
  sprites: () => Array<{ item?: string; x: number; y: number; kind: string }>;
};

test.use(devices['iPhone 15']);

test('proto3d lighting: pools, relight, oil, no 404s', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const failed404s: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('[ERROR]', msg.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() === 404) {
      failed404s.push(response.url());
      console.log('[404]', response.url());
    }
  });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
    console.log('SHOT', file);
  };

  const oilHud = page.locator('#oil-readout');
  await expect(oilHud).toHaveText('Oil 2/4');

  const startOil = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil());
  expect(startOil).toBe(2);

  const states = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates());
  expect(states.find((s) => s.x === 0 && s.y === 6)?.lit).toBe(true);
  expect(states.find((s) => s.x === 4 && s.y === 6)?.lit).toBe(false);
  expect(states.find((s) => s.x === 0 && s.y === 3)?.capped).toBe(true);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(5, 7, 0));
  const poolBefore = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(1, 6)
  );
  const darkBefore = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(3, 6)
  );
  console.log('BRIGHTNESS before relight pool', poolBefore.toFixed(3), 'dark', darkBefore.toFixed(3));
  expect(poolBefore, 'lit pool brighter than dark stretch').toBeGreaterThan(darkBefore + 0.12);
  expect(darkBefore, 'dark stretch stays readable').toBeGreaterThan(0.1);

  await shot(1, 7, 0, 'torch-side-profile.png');
  await shot(6, 7, 0, 'oil-flask.png');
  const oilSprite = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.sprites().find((s) => s.item === 'oil')
  );
  expect(oilSprite, 'oil flask sprite').toBeTruthy();
  expect(oilSprite!.x).toBe(6);
  expect(oilSprite!.y).toBe(6);

  await shot(3, 6, 1, 'dead-torch-before.png');
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(3, 6, 1);
    p.interact();
  });
  await page.waitForTimeout(700);
  await shot(3, 6, 1, 'dead-torch-after.png');

  const afterLit = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 4 && s.y === 6)
  );
  expect(afterLit?.lit, 'west-corridor torch relit').toBe(true);
  const oilAfterLight = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil()
  );
  expect(oilAfterLight).toBe(1);
  await expect(oilHud).toHaveText('Oil 1/4');

  await shot(2, 6, 1, 'corridor-two-torch-pools.png');

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(5, 7, 0));
  const pool = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(1, 6)
  );
  const dark = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(2, 6)
  );
  console.log('BRIGHTNESS lit pool', pool.toFixed(3), 'dark stretch', dark.toFixed(3));
  expect(pool, 'lit pool stays brighter than the mid-corridor').toBeGreaterThan(dark);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 6, 0);
    p.interact();
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil())).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toContain(
    'Oil flask'
  );
  await expect(oilHud).toHaveText('Oil 2/4');

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setOil(0);
    p.setPosition(7, 1, 1);
    p.interact();
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toBe(
    'No oil to spare.'
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 8 && s.y === 1)?.lit
    )
  ).toBe(false);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 3, 3);
    p.interact();
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toBe(
    'Sealed.'
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 0 && s.y === 3)?.lit
    )
  ).toBe(false);

  const region = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 1);
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    return {
      near: p.regionStats(w * 0.12, h * 0.28, w * 0.32, h * 0.7),
      mid: p.regionStats(w * 0.42, h * 0.32, w * 0.62, h * 0.68)
    };
  });
  console.log('REGION near luma', region.near.luma.toFixed(1), 'mid luma', region.mid.luma.toFixed(1));

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
