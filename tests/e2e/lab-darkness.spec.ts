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
  tileBrightness: (x: number, y: number) => number;
  sourceLight: (x: number, y: number) => number;
  getAmbient: () => number;
  isSquareLit: (x: number, y: number) => boolean;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => Region;
  meanLuma: () => number;
};

test.use(devices['iPhone 15']);

const SPOTS = [
  { name: 'dark_corridor', x: 11, y: 9, dir: 1, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'unlit_room', x: 13, y: 9, dir: 3, band: [0.22, 0.22, 0.78, 0.7] },
  { name: 'lair_19_3', x: 19, y: 3, dir: 2, band: [0.28, 0.22, 0.72, 0.62] },
  { name: 'lair_19_5', x: 19, y: 5, dir: 2, band: [0.28, 0.22, 0.72, 0.62] }
] as const;

test('Classic unlit matches the pre-#40 table; Lab unlit stays as dark as Classic', async ({
  page
}) => {
  test.setTimeout(150000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click({ force: true });
  await page.waitForTimeout(500);

  const measure = async (lab: boolean, voxel: boolean, tag: string) => {
    await page.evaluate(async ({ labOn, voxelOn }) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      await p.setLabLight(labOn);
      await p.setVoxel(voxelOn);
      p.setFlickerFrame(0);
    }, { labOn: lab, voxelOn: voxel });
    const freeze = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(19, 5, 2);
      p.setFlickerFrame(0);
      return {
        luma198: p.tileBrightness(19, 8),
        source198: p.sourceLight(19, 8),
        ambient: p.getAmbient(),
        lit197: p.isSquareLit(19, 7)
      };
    });
    const spots: Record<string, Region & { mean: number }> = {};
    for (const spot of SPOTS) {
      await page.evaluate(({ x, y, dir }) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setFlickerFrame(0);
        p.setPosition(x, y, dir);
      }, spot);
      await page.waitForTimeout(220);
      await page.screenshot({ path: `${OUT}/darkness_${tag}_${spot.name}.png`, fullPage: false });
      spots[spot.name] = await page.evaluate((band) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        const canvas = document.querySelector('canvas');
        const w = canvas?.width ?? 420;
        const h = canvas?.height ?? 912;
        return { ...p.regionStats(w * band[0], h * band[1], w * band[2], h * band[3]), mean: p.meanLuma() };
      }, spot.band);
    }
    return { freeze, spots };
  };

  const classic = await measure(false, false, 'classic');
  const lab = await measure(true, false, 'lab');
  const classicVoxel = await measure(false, true, 'classic_voxel');
  const labVoxel = await measure(true, true, 'lab_voxel');

  const report = { classic, lab, classicVoxel, labVoxel };
  writeFileSync(`${OUT}/darkness_luma_report.json`, JSON.stringify(report, null, 2));
  console.log('DARKNESS_LUMA', JSON.stringify(report));

  for (const row of [classic, classicVoxel, lab, labVoxel]) {
    expect(row.freeze.luma198, 'tileBrightness(19,8) stays ambient').toBeCloseTo(0.05848, 4);
    expect(row.freeze.source198, 'sourceLight(19,8) stays 0').toBe(0);
    expect(row.freeze.ambient).toBeCloseTo(0.05848, 4);
    expect(row.freeze.lit197).toBe(false);
  }

  // Classic default must stay the dungeon mood. Lab unlit / lair may not read brighter.
  for (const name of ['unlit_room', 'lair_19_3', 'lair_19_5'] as const) {
    expect(
      lab.spots[name].luma,
      `Lab ${name} luma ${lab.spots[name].luma} vs Classic ${classic.spots[name].luma}`
    ).toBeLessThanOrEqual(classic.spots[name].luma * 1.12 + 2);
    expect(
      labVoxel.spots[name].luma,
      `Lab+voxel ${name} luma vs Classic`
    ).toBeLessThanOrEqual(classic.spots[name].luma * 1.15 + 2);
  }
});
