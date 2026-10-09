import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';
const OUT = '/tmp/proto3d-iphone';

test.use(devices['iPhone 15']);

test('proto3d feedback: camera, doors, bump, fog, floors, no 404s', async ({ page }) => {
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
  await page.waitForFunction(() => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true, null, {
    timeout: 20000
  });
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(500);

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: { setPosition: (a: number, b: number, c: number) => void } }).__proto3d.setPosition(
        px,
        py,
        pd
      );
    }, [x, y, dir] as const);
    await page.waitForTimeout(350);
    const path = `${OUT}/${file}`;
    await page.screenshot({ path, fullPage: false });
    const md5 = createHash('md5').update(readFileSync(path)).digest('hex');
    console.log(`SHOT ${file} md5=${md5}`);
    return md5;
  };

  await shot(1, 7, 0, 'eye-corridor.png');
  await shot(1, 7, 2, 'eye-wall.png');
  await shot(5, 2, 3, 'door-closed.png');

  await page.evaluate(() => {
    const api = window as unknown as {
      __proto3d: { giveKey: () => void; openDoor: (x: number, y: number) => boolean };
    };
    api.__proto3d.giveKey();
    api.__proto3d.openDoor(4, 2);
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    (window as unknown as { __proto3d: { setPosition: (a: number, b: number, c: number) => void } }).__proto3d.setPosition(
      5,
      2,
      3
    );
  });
  await page.waitForTimeout(200);
  await shot(5, 2, 3, 'door-open.png');

  await page.evaluate(() => {
    (window as unknown as { __proto3d: { setPosition: (a: number, b: number, c: number) => void } }).__proto3d.setPosition(
      6,
      2,
      1
    );
  });
  const bump = await page.evaluate(() => {
    return (
      window as unknown as {
        __proto3d: {
          tryMoveForward: () => { result: string; after: { x: number; y: number } };
        };
      }
    ).__proto3d.tryMoveForward();
  });
  console.log('BUMP', bump);
  expect(bump.result).toBe('monster');
  expect(bump.after.x).toBe(6);
  expect(bump.after.y).toBe(2);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/slime-bump.png`, fullPage: false });
  console.log(
    'SHOT slime-bump.png md5=' + createHash('md5').update(readFileSync(`${OUT}/slime-bump.png`)).digest('hex')
  );

  await shot(1, 4, 0, 'water-floor-fixed.png');
  await shot(1, 7, 0, 'fog-corridor.png');

  await page.evaluate(() => {
    (window as unknown as { __proto3d: { setPosition: (a: number, b: number, c: number) => void } }).__proto3d.setPosition(
      1,
      6,
      0
    );
  });
  await page.waitForTimeout(3500);
  const fpsHigh = await page.evaluate(
    () => (window as unknown as { __proto3d: { fps: () => number } }).__proto3d.fps()
  );
  console.log('FPS high (two-torch corridor)', fpsHigh);

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1&fx=0`);
  await page.waitForFunction(() => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true, null, {
    timeout: 20000
  });
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);
  const quality = await page.evaluate(
    () => (window as unknown as { __proto3d: { quality: () => string } }).__proto3d.quality()
  );
  expect(quality).toBe('low');
  await page.evaluate(() => {
    (window as unknown as { __proto3d: { setPosition: (a: number, b: number, c: number) => void } }).__proto3d.setPosition(
      1,
      6,
      0
    );
  });
  await page.waitForTimeout(3500);
  const fpsLow = await page.evaluate(
    () => (window as unknown as { __proto3d: { fps: () => number } }).__proto3d.fps()
  );
  console.log('FPS low ?fx=0 (two-torch corridor)', fpsLow);

  const manifest = await page.goto(`${BASE_URL}/proto3d/manifest.json`);
  expect(manifest?.ok()).toBeTruthy();
  const man = await manifest!.json();
  expect(man.name).toBe('Sunken Keep 3D');
  expect(man.start_url).toContain('proto3d.html');
  expect(man.display).toBe('standalone');

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
