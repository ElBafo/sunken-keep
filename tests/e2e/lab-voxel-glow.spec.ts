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
  setVoxel: (on: boolean) => Promise<void> | void;
  labLight: () => boolean;
  voxel: () => boolean;
  sourceLight: (x: number, y: number) => number;
  tileBrightness: (x: number, y: number) => number;
  getAmbient: () => number;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => Region;
};

const SPOTS = [
  { name: 'dark_corridor', x: 11, y: 9, dir: 1, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'lair_19_5', x: 19, y: 5, dir: 2, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'lair_19_3', x: 19, y: 3, dir: 2, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'lod_edge_8_2', x: 8, y: 2, dir: 1, band: [0.55, 0.22, 0.92, 0.72] }
] as const;

test.use(devices['iPhone 15']);

test('Lab+voxel matches Lab+flat in the dark; Classic bake unchanged', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1&light=lab`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click({ force: true });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __proto3d: Proto3d }).__proto3d.setFlickerFrame(0);
  });
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
  ).toBe(true);

  const sample = async (spot: (typeof SPOTS)[number]): Promise<Region> => {
    return page.evaluate(([x, y, dir, band]) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setFlickerFrame(0);
      p.setPosition(x, y, dir);
      const canvas = document.querySelector('#render-canvas') as HTMLCanvasElement | null;
      const w = canvas?.width ?? 270;
      const h = canvas?.height ?? 380;
      return p.regionStats(w * band[0], h * band[1], w * band[2], h * band[3]);
    }, [spot.x, spot.y, spot.dir, spot.band] as const);
  };

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(
      ([px, py, pd]) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setFlickerFrame(0);
        p.setPosition(px, py, pd);
      },
      [x, y, dir] as const
    );
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  };

  const flat: Record<string, Region> = {};
  for (const spot of SPOTS) {
    await page.waitForTimeout(80);
    flat[spot.name] = await sample(spot);
    await shot(spot.x, spot.y, spot.dir, `lab_flat_${spot.name}.png`);
  }

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setVoxel(true);
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
  ).toBe(true);

  const voxel: Record<string, Region> = {};
  for (const spot of SPOTS) {
    await page.waitForTimeout(80);
    voxel[spot.name] = await sample(spot);
    await shot(spot.x, spot.y, spot.dir, `lab_voxel_${spot.name}.png`);
  }

  const freeze = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(19, 5, 2);
    return {
      source198: p.sourceLight(19, 8),
      luma198: p.tileBrightness(19, 8),
      ambient: p.getAmbient()
    };
  });

  const report = Object.fromEntries(
    SPOTS.map((spot) => {
      const f = flat[spot.name];
      const v = voxel[spot.name];
      return [
        spot.name,
        {
          flat: f,
          voxel: v,
          lumaDelta: v.luma - f.luma,
          absDelta: Math.abs(v.luma - f.luma)
        }
      ];
    })
  );
  writeFileSync(
    `${OUT}/lab_voxel_vs_flat.json`,
    JSON.stringify({ freeze, spots: report }, null, 2)
  );
  console.log('LAB_VOXEL_VS_FLAT', JSON.stringify({ freeze, spots: report }));

  expect(freeze.source198, 'lair gameplay table stays 0').toBe(0);
  expect(freeze.luma198).toBeCloseTo(0.05848, 4);
  expect(freeze.ambient).toBeCloseTo(0.05848, 4);

  expect(report.dark_corridor.absDelta, 'dark corridor Lab+voxel vs Lab+flat').toBeLessThanOrEqual(10);
  expect(report.lair_19_5.absDelta, 'lair (19,5) Lab+voxel vs Lab+flat').toBeLessThanOrEqual(10);
  expect(report.lair_19_3.absDelta, 'lair (19,3) Lab+voxel vs Lab+flat').toBeLessThanOrEqual(10);
  expect(report.lod_edge_8_2.absDelta, 'voxel/flat LOD edge').toBeLessThanOrEqual(10);

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setLabLight(false);
  });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
  ).toBe(false);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
  ).toBe(true);
});
