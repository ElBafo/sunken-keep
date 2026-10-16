import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  setFlickerFrame: (frame: number) => void;
  setVoxel: (on: boolean) => Promise<void> | void;
  voxel: () => boolean;
  voxelStats: () => { enabled: boolean; voxels: number; triangles: number; active: number };
  draws: () => number;
  fps: () => number;
  frameStats: () => { n: number; mean: number; p95: number };
  sourceLight: (x: number, y: number) => number;
  isSquareLit: (x: number, y: number) => boolean;
  tileBrightness: (x: number, y: number) => number;
  getAmbient: () => number;
  sprites: () => Array<{ item?: string; x: number; y: number; kind: string }>;
};

test.use(devices['iPhone 15']);

const POSES = [
  { x: 3, y: 14, dir: 3, file: 'start' },
  { x: 1, y: 6, dir: 3, file: 'torch_corridor' },
  { x: 6, y: 7, dir: 3, file: 'chest_torch_wall' },
  { x: 19, y: 3, dir: 2, file: 'lair_from_19_3' },
  { x: 11, y: 3, dir: 0, file: 'crack_sunbeam' },
  { x: 15, y: 10, dir: 1, file: 'stairs_down' }
] as const;

test('voxel mode screenshots, freeze, and fps vs default', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    (window as unknown as { __proto3d: Proto3d }).__proto3d.setFlickerFrame(0);
  });

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(
      ([px, py, pd]) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setFlickerFrame(0);
        p.setPosition(px, py, pd);
      },
      [x, y, dir] as const
    );
    await page.waitForTimeout(280);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  };

  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
  ).toBe(false);

  for (const pose of POSES) {
    await shot(pose.x, pose.y, pose.dir, `voxel_off_${pose.file}.png`);
  }

  await page.evaluate(([px, py, pd]) => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(px, py, pd);
  }, [1, 6, 3] as const);
  await page.waitForTimeout(1100);
  const offStats = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { fps: p.fps(), draws: p.draws(), frame: p.frameStats(), voxel: p.voxelStats() };
  });

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setVoxel(true);
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
  ).toBe(true);

  const freeze = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(19, 5, 2);
    p.setFlickerFrame(0);
    return {
      source198: p.sourceLight(19, 8),
      luma198: p.tileBrightness(19, 8),
      lit197: p.isSquareLit(19, 7),
      lit196: p.isSquareLit(19, 6),
      ambient: p.getAmbient()
    };
  });
  expect(freeze.source198, 'gameplay tile-light at (19,8) stays 0').toBe(0);
  expect(freeze.luma198, '(19,8) stays ambient in voxel mode').toBeCloseTo(0.05848, 4);
  expect(freeze.lit197).toBe(false);
  expect(freeze.lit196).toBe(false);
  expect(freeze.ambient).toBeCloseTo(0.05848, 4);

  for (const pose of POSES) {
    await shot(pose.x, pose.y, pose.dir, `voxel_on_${pose.file}.png`);
  }

  const sprites = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 7, 3);
    return p.sprites().filter((s) => s.x === 5 && s.y === 7);
  });
  expect(sprites.some((s) => s.item === 'chest' || s.kind === 'item')).toBe(true);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.setFlickerFrame(0);
  });
  await page.waitForTimeout(1100);
  const onStats = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { fps: p.fps(), draws: p.draws(), frame: p.frameStats(), voxel: p.voxelStats() };
  });
  expect(onStats.voxel.enabled).toBe(true);
  expect(onStats.voxel.voxels).toBeGreaterThan(0);

  const report = {
    default: offStats,
    voxel: onStats
  };
  writeFileSync(`${OUT}/voxel_fps_draws.json`, JSON.stringify(report, null, 2));
  console.log('VOXEL_STATS', JSON.stringify(report));
});
