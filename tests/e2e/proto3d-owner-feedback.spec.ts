import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type FaceLight = {
  kind: string;
  lightX: number;
  lightY: number;
  face?: string;
  worldX: number;
  worldZ: number;
  avgR: number;
};

type TorchInfo = {
  x: number;
  y: number;
  face: string;
  lit: boolean;
  snuffing: boolean;
  bracketVisible: boolean;
  flameVisible: boolean;
  tapLocked: boolean;
};

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  faceLighting: () => FaceLight[];
  tileLight: (x: number, y: number) => number;
  tileBrightness: (x: number, y: number) => number;
  sourceLight: (x: number, y: number) => number;
  getAmbient: () => number;
  torches: () => TorchInfo[];
  torchLit: (x: number, y: number) => boolean;
  interact: () => void;
  lastMessage: () => string;
  getOil: () => number;
  oil: () => number;
  giveOil: (n?: number) => void;
  setOil: (n: number) => void;
  stepVolume: () => number;
  lastStep: () => string | null;
  tryMoveForward: () => { result: string; after: { x: number; y: number; dir: number } };
  regionStats: (x0: number, y0: number, x1: number, y1: number) => { luma: number; fogRatio: number; n: number };
};

test.use(devices['iPhone 15']);

test('proto3d owner feedback: occluded light, hidden back torch, snuff, water steps, no 404s', async ({
  page
}) => {
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
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    await page.waitForTimeout(180);
    const path = `${OUT}/${file}`;
    await page.screenshot({ path, fullPage: false });
    console.log(`SHOT ${file} md5=${createHash('md5').update(readFileSync(path)).digest('hex')}`);
  };

  // Expanded floor 1 start hall / pantry / lamp room.
  await shot(1, 7, 0, 'floor1-start-north.png');
  await shot(1, 5, 1, 'floor1-start-east-to-pantry.png');
  await shot(10, 9, 1, 'floor1-lamp-room.png');

  // (4,6) is a one-cell pillar with an open square at (4,5), so light can
  // walk around it. The solid (6,4) south-facing torch wall separates the
  // pantry from the north rooms; its back face at (6,3) must stay ambient.
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(1, 7, 0));
  const leak = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const faces = p.faceLighting();
    const avg = (pred: (f: FaceLight) => boolean) => {
      const list = faces.filter(pred);
      const n = list.length || 1;
      return { r: list.reduce((s, f) => s + f.avgR, 0) / n, n: list.length };
    };
    return {
      litWall: avg((f) => f.kind === 'wall' && f.lightX === 6 && f.lightY === 5),
      darkWall: avg((f) => f.kind === 'wall' && f.lightX === 6 && f.lightY === 3),
      darkFloor: avg((f) => f.kind === 'floor' && f.lightX === 6 && f.lightY === 3),
      litFloor: avg((f) => f.kind === 'floor' && f.lightX === 6 && f.lightY === 5),
      tileLit: p.tileLight(6, 5),
      tileDark: p.tileLight(6, 3),
      sourceDark: p.sourceLight(6, 3),
      ambient: p.getAmbient()
    };
  });
  console.log('LEAK', leak);
  expect(leak.litWall.n, 'south face of the (6,4) torch wall').toBeGreaterThan(0);
  expect(leak.darkWall.n, 'north / back face of the (6,4) torch wall').toBeGreaterThan(0);
  expect(leak.darkFloor.n, 'floor behind the torch wall').toBeGreaterThan(0);
  expect(leak.litWall.r, 'torch-facing wall is warm').toBeGreaterThan(0.2);
  expect(leak.darkWall.r, 'back side of the torch wall stays ambient').toBeLessThan(0.08);
  expect(leak.darkFloor.r, 'square behind the wall stays ambient').toBeLessThan(0.08);
  expect(leak.tileDark, 'BFS does not reach the north room').toBeLessThan(0.08);
  expect(leak.tileLit, 'torch still lights its own room').toBeGreaterThan(0.2);
  expect(leak.sourceDark, 'no torch or lantern on the back square').toBeLessThan(0.02);

  await shot(6, 5, 0, 'torch-wall-lit-side.png');
  await shot(6, 3, 2, 'torch-wall-dark-side.png');

  // --- Torch behind / on own-square sides must not render ---
  await shot(1, 6, 1, 'back-to-torch-wall.png');
  const behind = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 1);
    return p.torches().find((t) => t.x === 0 && t.y === 6);
  });
  expect(behind, 'west-wall torch at (0,6)').toBeTruthy();
  expect(behind!.lit, 'torch behind the party is still lit').toBe(true);
  expect(behind!.bracketVisible, 'bracket on the wall behind is culled').toBe(false);
  expect(behind!.flameVisible, 'flame on the wall behind is culled').toBe(false);

  await shot(1, 6, 3, 'facing-torch-wall.png');
  const facing = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    return p.torches().find((t) => t.x === 0 && t.y === 6);
  });
  expect(facing!.bracketVisible, 'facing the same torch shows the bracket').toBe(true);
  expect(facing!.flameVisible, 'facing the same torch shows the flame').toBe(true);

  const ownFloor = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 7, 2);
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    return p.regionStats(w * 0.2, h * 0.62, w * 0.8, h * 0.95);
  });
  expect(ownFloor.luma, 'facing a wall still shows the floor (not a black frame)').toBeGreaterThan(8);
  expect(ownFloor.fogRatio, 'own floor is not culled to fog').toBeLessThan(0.55);

  const stepVol = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.stepVolume());
  expect(stepVol, 'STEP_VOLUME is the 60% cut').toBeCloseTo(0.4, 5);

  // Water square (1,4) must play a water step set, not stone.
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 5, 0);
  });
  const waterStep = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const moved = p.tryMoveForward();
    return { moved, last: p.lastStep() };
  });
  console.log('WATER STEP', waterStep);
  expect(waterStep.moved.after, 'step onto shallow water').toMatchObject({ x: 1, y: 4 });
  expect(waterStep.last, 'water square uses a water step variant').toMatch(/step_water_(shallow|deep)/);

  // --- Snuff the facing (0,6) torch; its pool must drop to ambient/lantern only ---
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.interact();
  });
  const immediately = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.interact();
    return {
      lit: p.torchLit(0, 6),
      msg: p.lastMessage(),
      oil: p.getOil(),
      torch: p.torches().find((t) => t.x === 0 && t.y === 6)
    };
  });
  expect(immediately.lit, 'snuffed torch is unlit').toBe(false);
  expect(immediately.msg, 'snuff log line').toMatch(/snuffs the torch/i);
  expect(immediately.torch?.snuffing || immediately.torch?.tapLocked, 'guard after snuff').toBeTruthy();

  // Measure the snuffed torch's front square with the party far enough that
  // only ambient (or a leftover lantern fringe) remains.
  const snuffedLight = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(10, 9, 1);
    return {
      source: p.sourceLight(1, 6),
      tile: p.tileLight(1, 6),
      ambient: p.getAmbient(),
      lit: p.torchLit(0, 6)
    };
  });
  console.log('SNUFFED LIGHT', snuffedLight);
  expect(snuffedLight.lit).toBe(false);
  expect(snuffedLight.source, 'snuffed torch square has no torch pool').toBeLessThan(0.02);
  expect(snuffedLight.tile, 'snuffed square is ambient-or-lantern only').toBeLessThan(snuffedLight.ambient + 0.02);

  await page.waitForTimeout(200);
  await shot(1, 6, 3, 'torch-snuffed.png');

  await page.waitForTimeout(1600);
  const afterGuard = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    return p.torches().find((t) => t.x === 0 && t.y === 6);
  });
  expect(afterGuard!.lit).toBe(false);
  expect(afterGuard!.flameVisible, 'dead bracket, no flame').toBe(false);
  expect(afterGuard!.bracketVisible, 'dead bracket remains').toBe(true);

  const oilBefore = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.giveOil(1);
    return p.getOil();
  });
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interact());
  const relit = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.interact();
    return { lit: p.torchLit(0, 6), oil: p.getOil(), torch: p.torches().find((t) => t.x === 0 && t.y === 6) };
  });
  expect(relit.lit, 'relight spends 1 oil').toBe(true);
  expect(relit.oil, 'double-tap after ignite does not snuff / refund').toBe(oilBefore - 1);
  expect(relit.torch?.tapLocked, 'ignite flare + 1s guard').toBe(true);

  await page.waitForTimeout(1600);
  await shot(1, 6, 3, 'torch-relit.png');

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
