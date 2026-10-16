import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Region = { luma: number; fogRatio: number; n: number; r: number; g: number; b: number };

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
  regionStats: (x0: number, y0: number, x1: number, y1: number) => Region;
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

const BRIGHT_SPOTS = [
  { name: 'edge_8_2_east', x: 8, y: 2, dir: 1, band: [0.55, 0.22, 0.92, 0.72] },
  { name: 'lair_19_3', x: 19, y: 3, dir: 2, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'lair_19_5', x: 19, y: 5, dir: 2, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'torch_corridor', x: 1, y: 6, dir: 3, band: [0.22, 0.18, 0.78, 0.62] },
  { name: 'cellar_door', x: 6, y: 9, dir: 0, band: [0.32, 0.28, 0.68, 0.68] }
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

  const sampleSpot = async (spot: (typeof BRIGHT_SPOTS)[number]) => {
    return page.evaluate(([px, py, pd, band]) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setFlickerFrame(0);
      p.setPosition(px, py, pd);
      const canvas = document.querySelector('canvas');
      const w = canvas?.width ?? 420;
      const h = canvas?.height ?? 912;
      return p.regionStats(w * band[0], h * band[1], w * band[2], h * band[3]);
    }, [spot.x, spot.y, spot.dir, [...spot.band]] as const);
  };

  const brightnessOff: Record<string, Region> = {};
  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(false);
  });
  await page.waitForTimeout(200);
  for (const spot of BRIGHT_SPOTS) {
    await page.waitForTimeout(80);
    brightnessOff[spot.name] = await sampleSpot(spot);
  }

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(true);
  });
  await page.waitForTimeout(300);
  const brightnessOn: Record<string, Region> = {};
  for (const spot of BRIGHT_SPOTS) {
    await page.waitForTimeout(80);
    brightnessOn[spot.name] = await sampleSpot(spot);
  }

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(19, 3, 2);
  });
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(false);
  });
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(true);
  });
  await page.waitForTimeout(300);
  const lairAfterToggle = await sampleSpot(BRIGHT_SPOTS[1]);

  const deltas = Object.fromEntries(
    BRIGHT_SPOTS.map((spot) => {
      const off = brightnessOff[spot.name];
      const on = brightnessOn[spot.name];
      const lumaRatio = off.luma > 0.5 ? on.luma / off.luma : on.luma / Math.max(off.luma, 0.001);
      return [
        spot.name,
        {
          off,
          on,
          lumaDelta: on.luma - off.luma,
          lumaRatio,
          warmthOff: off.r - off.b,
          warmthOn: on.r - on.b
        }
      ];
    })
  );

  const report = {
    default: offStats,
    voxel: onStats,
    brightness: deltas,
    lairAfterMidgameToggle: {
      off: brightnessOff.lair_19_3,
      on: brightnessOn.lair_19_3,
      afterToggle: lairAfterToggle,
      ratioVsDefault: lairAfterToggle.luma / Math.max(brightnessOff.lair_19_3.luma, 0.001)
    }
  };
  writeFileSync(`${OUT}/voxel_fps_draws.json`, JSON.stringify(report, null, 2));
  console.log('VOXEL_STATS', JSON.stringify(report));

  expect(deltas.lair_19_3.lumaRatio, 'lair from (19,3) stays within 1.1x').toBeLessThanOrEqual(1.1);
  expect(deltas.lair_19_5.lumaRatio, 'lair at (19,5) stays within 1.1x').toBeLessThanOrEqual(1.1);
  expect(report.lairAfterMidgameToggle.ratioVsDefault, 'lair after mid-game toggle').toBeLessThanOrEqual(1.1);
  expect(Math.abs(deltas.edge_8_2_east.lumaDelta), 'LOD edge brightness pop').toBeLessThanOrEqual(12);
});
