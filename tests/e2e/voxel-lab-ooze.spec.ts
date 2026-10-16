import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE = '/sunken-keep/voxel-lab.html?test=1';
const OUT = '/opt/cursor/artifacts/screenshots';
const METRICS = '/opt/cursor/artifacts/ooze-metrics.json';

type Lab = {
  ready?: boolean;
  fps: number;
  avgMs: number;
  worstMs: number;
  draws: number;
  oozeRes: number;
  oozeMat: string;
  oozeVoxels: number;
  oozeTriangles: number;
  oozeDraws: number;
  setOozeRes: (res: 16 | 32 | 48) => void;
  setOozeMat: (mat: 'opaque' | 'shell') => void;
  setOozeAnim: (anim: string) => void;
  setOozeDist: (d: 1 | 2) => void;
  setOozeView: (v: 'game' | 'orbit' | 'free') => void;
  setOozeCompare: (on: boolean) => void;
  resetOoze: () => void;
  debugOoze: () => {
    res: number;
    mat: string;
    anim: string;
    dist: number;
    view: string;
    compare: boolean;
    spriteLod: string;
    spriteSource: string;
    spriteVisible: boolean;
    voxels: number;
    triangles: number;
    draws: number;
    peakHeight: number;
    width: number;
    hovering: boolean;
    hasFaceStamp: boolean;
    contact: boolean;
  };
};

async function lab(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(BASE);
  await page.waitForFunction(
    () => (window as unknown as { __voxelLab?: { ready?: boolean } }).__voxelLab?.ready === true,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(400);
}

test.use(devices['iPhone 15']);

test('gray ooze lab toggles, framing, and cost grid', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await lab(page);

  for (const id of [
    '#btn-ooze-res',
    '#btn-ooze-mat',
    '#btn-ooze-anim',
    '#btn-ooze-dist',
    '#btn-ooze-view',
    '#btn-ooze-compare',
    '#btn-ooze-reset'
  ]) {
    const box = await page.locator(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }

  await expect(page.locator('#stats')).toContainText('fps');
  await expect(page.locator('#btn-ooze-res')).toHaveText('Res 32');
  await expect(page.locator('#btn-ooze-mat')).toHaveText('Wet stone');
  await expect(page.locator('#btn-ooze-view')).toHaveText('Game cam');
  await expect(page.locator('#btn-ooze-dist')).toHaveText('1 square');

  const idle = await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.debugOoze());
  expect(idle.res).toBe(32);
  expect(idle.mat).toBe('opaque');
  expect(idle.view).toBe('game');
  expect(idle.dist).toBe(1);
  expect(idle.hovering).toBe(false);
  expect(idle.hasFaceStamp).toBe(false);
  expect(idle.contact).toBe(true);
  expect(idle.spriteSource).toBe('gray_ooze');
  expect(idle.peakHeight).toBeLessThan(0.7);
  expect(idle.width).toBeGreaterThan(idle.peakHeight * 1.4);
  expect(idle.spriteLod).toBe('close');

  await page.screenshot({ path: `${OUT}/ooze_game_1sq_opaque_32.png`, fullPage: false });

  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.setOozeDist(2));
  await page.waitForTimeout(200);
  const two = await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.debugOoze());
  expect(two.dist).toBe(2);
  expect(two.spriteLod).toBe('near');
  await page.screenshot({ path: `${OUT}/ooze_game_2sq_opaque_32.png`, fullPage: false });

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    api.setOozeDist(1);
    api.setOozeCompare(true);
  });
  await page.waitForTimeout(200);
  const cmp = await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.debugOoze());
  expect(cmp.compare).toBe(true);
  expect(cmp.spriteVisible).toBe(true);
  await page.screenshot({ path: `${OUT}/ooze_compare_sprite.png`, fullPage: false });

  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.setOozeView('orbit'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/ooze_orbit.png`, fullPage: false });

  await page.evaluate(() => {
    const api = (window as unknown as { __voxelLab: Lab }).__voxelLab;
    api.setOozeView('game');
    api.setOozeCompare(false);
    api.setOozeAnim('lunge');
  });
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${OUT}/ooze_lunge.png`, fullPage: false });

  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.setOozeAnim('death'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/ooze_death.png`, fullPage: false });
  await page.evaluate(() => (window as unknown as { __voxelLab: Lab }).__voxelLab.resetOoze());

  const grid: Array<{
    res: 16 | 32 | 48;
    mat: 'opaque' | 'shell';
    fps: number;
    avgMs: number;
    worstMs: number;
    draws: number;
    oozeDraws: number;
    voxels: number;
    triangles: number;
  }> = [];

  for (const res of [16, 32, 48] as const) {
    for (const mat of ['opaque', 'shell'] as const) {
      await page.evaluate(
        ({ res: r, mat: m }) => {
          const api = (window as unknown as { __voxelLab: Lab }).__voxelLab;
          api.setOozeRes(r);
          api.setOozeMat(m);
          api.setOozeAnim('idle');
          api.setOozeView('game');
          api.setOozeDist(1);
        },
        { res, mat }
      );
      await page.waitForTimeout(2200);
      const sample = await page.evaluate(() => {
        const api = (window as unknown as { __voxelLab: Lab }).__voxelLab;
        const dbg = api.debugOoze();
        return {
          fps: api.fps,
          avgMs: api.avgMs,
          worstMs: api.worstMs,
          draws: api.draws,
          oozeDraws: dbg.draws,
          voxels: dbg.voxels,
          triangles: dbg.triangles
        };
      });
      grid.push({ res, mat, ...sample });
      await page.screenshot({ path: `${OUT}/ooze_res${res}_${mat}.png`, fullPage: false });
    }
  }

  writeFileSync(METRICS, JSON.stringify({ viewport: 'iPhone 15', grid }, null, 2));
  expect(grid).toHaveLength(6);
  for (const row of grid) {
    expect(row.voxels).toBeGreaterThan(50);
    expect(row.triangles).toBeGreaterThan(20);
    expect(row.draws).toBeGreaterThan(0);
  }
  const midOpaque = grid.find((g) => g.res === 32 && g.mat === 'opaque');
  const midShell = grid.find((g) => g.res === 32 && g.mat === 'shell');
  expect(midOpaque).toBeTruthy();
  expect(midShell).toBeTruthy();
  expect(midShell!.triangles).toBeGreaterThanOrEqual(midOpaque!.triangles);
});
