import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Region = { luma: number; fogRatio: number; n: number; r: number; g: number; b: number };

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  setFlickerFrame: (frame: number) => void;
  setLabLight: (on: boolean) => Promise<void> | void;
  labLight: () => boolean;
  labStats: () => { enabled: boolean; patched: number };
  paletteEnabled: () => boolean;
  setVoxel: (on: boolean) => Promise<void> | void;
  voxel: () => boolean;
  draws: () => number;
  fps: () => number;
  frameStats: () => { n: number; mean: number; p95: number };
  sourceLight: (x: number, y: number) => number;
  isSquareLit: (x: number, y: number) => boolean;
  tileBrightness: (x: number, y: number) => number;
  getAmbient: () => number;
  sprites: () => Array<{ item?: string; x: number; y: number; kind: string }>;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => Region;
  toggleSettings: () => void;
  settingsOpen: () => boolean;
};

test.use(devices['iPhone 15']);

const POSES = [
  { x: 3, y: 14, dir: 3, file: 'start' },
  { x: 1, y: 6, dir: 3, file: 'torch_corridor' },
  { x: 6, y: 7, dir: 3, file: 'chest_torch_wall' },
  { x: 11, y: 3, dir: 0, file: 'crack_sunbeam' },
  { x: 16, y: 9, dir: 2, file: 'stairs_down' },
  { x: 19, y: 3, dir: 2, file: 'lair_from_19_3' },
  { x: 19, y: 6, dir: 2, file: 'lair_neck' },
  { x: 8, y: 2, dir: 1, file: 'edge_8_2_east' },
  { x: 6, y: 9, dir: 0, file: 'cellar_door' }
] as const;

test('lab light screenshots, freeze, and fps vs default', async ({ page }) => {
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
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
  ).toBe(false);

  for (const pose of POSES) {
    await shot(pose.x, pose.y, pose.dir, `lab_off_${pose.file}.png`);
  }

  await page.evaluate(([px, py, pd]) => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(px, py, pd);
  }, [1, 6, 3] as const);
  await page.waitForTimeout(1100);
  const offStats = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { fps: p.fps(), draws: p.draws(), frame: p.frameStats(), lab: p.labStats() };
  });

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setLabLight(true);
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
  ).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.paletteEnabled())
  ).toBe(false);

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
  expect(freeze.luma198, '(19,8) stays ambient in lab light').toBeCloseTo(0.05848, 4);
  expect(freeze.lit197).toBe(false);
  expect(freeze.lit196).toBe(false);
  expect(freeze.ambient).toBeCloseTo(0.05848, 4);

  for (const pose of POSES) {
    await shot(pose.x, pose.y, pose.dir, `lab_on_${pose.file}.png`);
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
    return { fps: p.fps(), draws: p.draws(), frame: p.frameStats(), lab: p.labStats() };
  });
  expect(onStats.lab.enabled).toBe(true);
  expect(onStats.lab.patched).toBeGreaterThan(0);

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(true);
  });
  await page.waitForTimeout(400);
  await shot(1, 6, 3, 'lab_on_voxel_on_torch_corridor.png');
  await shot(11, 3, 0, 'lab_on_voxel_on_crack_sunbeam.png');
  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(false);
  });

  const torchWarmth = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setFlickerFrame(0);
    p.setPosition(1, 6, 3);
    const canvas = document.querySelector('canvas');
    const w = canvas?.width ?? 420;
    const h = canvas?.height ?? 912;
    return p.regionStats(w * 0.22, h * 0.18, w * 0.78, h * 0.62);
  });

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setLabLight(false);
  });
  await page.waitForTimeout(200);
  const torchWarmthOff = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setFlickerFrame(0);
    p.setPosition(1, 6, 3);
    const canvas = document.querySelector('canvas');
    const w = canvas?.width ?? 420;
    const h = canvas?.height ?? 912;
    return p.regionStats(w * 0.22, h * 0.18, w * 0.78, h * 0.62);
  });

  const menu = page.locator('#settings-overlay');
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.toggleSettings());
  await expect(menu).toBeVisible();
  await expect(page.locator('#settings-lab-light-label')).toBeVisible();
  await expect(page.locator('#btn-lab-light-on')).toHaveText(/Lab/i);
  await expect(page.locator('#btn-lab-light-off')).toHaveText(/Classic/i);
  await expect(page.locator('#btn-voxel-on')).toHaveText(/On/i);
  await expect(page.locator('#btn-voxel-off')).toHaveText(/Off/i);
  await page.screenshot({ path: `${OUT}/lab_settings_menu.png`, fullPage: false });
  await page.locator('#btn-lab-light-on').click();
  await page.waitForTimeout(200);
  await page.locator('#btn-voxel-off').click();
  await page.locator('#btn-settings-close').click();
  await expect(menu).toBeHidden();
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
  ).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
  ).toBe(false);

  const report = {
    default: offStats,
    lab: onStats,
    torchWarmth: {
      off: torchWarmthOff,
      on: torchWarmth,
      warmthOff: torchWarmthOff.r - torchWarmthOff.b,
      warmthOn: torchWarmth.r - torchWarmth.b
    }
  };
  writeFileSync(`${OUT}/lab_light_fps_draws.json`, JSON.stringify(report, null, 2));
  console.log('LAB_LIGHT_STATS', JSON.stringify(report));

  expect(onStats.frame.mean, 'lab light mean frame stays near 60fps').toBeLessThan(22);
  expect(torchWarmth.r - torchWarmth.b, 'lab torch stay warm/yellow').toBeGreaterThan(8);
});
