import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  setFlickerFrame: (frame: number) => void;
  labRender: () => boolean;
  setLabRender: (on: boolean) => Promise<void> | void;
  labRenderStats: () => {
    enabled: boolean;
    faces: number;
    voxelFaces: number;
    triangles: number;
    lights: { torches: number; litTorches: number; sunbeams: number; lantern: number };
  };
  labWallKeys: () => string[];
  lanternWorld: () => [number, number, number] | null;
  triangles: () => number;
  draws: () => number;
  fps: () => number;
  frameStats: () => { n: number; mean: number; p95: number };
  sourceLight: (x: number, y: number) => number;
  isSquareLit: (x: number, y: number) => boolean;
  tileBrightness: (x: number, y: number) => number;
  getAmbient: () => number;
  openSecret: (x: number, y: number) => boolean;
  secretOpen: (x: number, y: number) => boolean;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => {
    luma: number;
    r: number;
    g: number;
    b: number;
    n: number;
  };
  interact: () => void;
  snapDoor: (x: number, y: number, open: boolean) => void;
  doorOpen: (x: number, y: number) => boolean;
  darkFx: () => { stairs: number };
  paletteEnabled: () => boolean;
  labLight: () => boolean;
  voxel: () => boolean;
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
  { x: 12, y: 9, dir: 1, file: 'pell_lamp' },
  { x: 9, y: 10, dir: 3, file: 'jar_rack' }
] as const;

async function boot(page: import('@playwright/test').Page, query: string) {
  await page.goto(`${BASE_URL}/proto3d.html?${query}`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click({ force: true });
  await page.waitForTimeout(500);
}

async function shot(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  dir: number,
  file: string
) {
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
}

test('default path is classic: no lab world, palette on', async ({ page }) => {
  await boot(page, 'test=1&debug=1');
  const state = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      lab: p.labRender(),
      light: p.labLight(),
      voxel: p.voxel(),
      palette: p.paletteEnabled()
    };
  });
  expect(state.lab).toBe(false);
  expect(state.light).toBe(false);
  expect(state.voxel).toBe(false);
  expect(state.palette).toBe(true);
});

test('?render=lab lights the lantern on the first frame', async ({ page }) => {
  await boot(page, 'test=1&debug=1&render=lab');
  const first = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      lab: p.labRender(),
      palette: p.paletteEnabled(),
      stats: p.labRenderStats(),
      lantern: p.lanternWorld(),
      luma198: p.tileBrightness(19, 8),
      source198: p.sourceLight(19, 8)
    };
  });
  expect(first.lab).toBe(true);
  expect(first.palette).toBe(false);
  expect(first.stats.lights.lantern, 'lantern lit on the first frame').toBeGreaterThan(0);
  expect(first.lantern, 'lantern parented in world space').not.toBeNull();
  expect(first.luma198).toBeCloseTo(0.05848, 4);
  expect(first.source198).toBe(0);
});

test('lab world renderer: walls after secret, lair, stairs, fps vs classic', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await boot(page, 'test=1&debug=1');
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setFlickerFrame(0));

  for (const pose of POSES) {
    await shot(page, pose.x, pose.y, pose.dir, `classic_${pose.file}.png`);
  }

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
  });
  await page.waitForTimeout(1100);
  const classicStats = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const canvas = document.querySelector('canvas');
    const w = canvas?.width ?? 420;
    const h = canvas?.height ?? 912;
    p.setPosition(19, 3, 2);
    p.setFlickerFrame(0);
    return {
      fps: p.fps(),
      draws: p.draws(),
      tris: p.triangles(),
      frame: p.frameStats(),
      lair: p.regionStats(w * 0.22, h * 0.22, w * 0.78, h * 0.72)
    };
  });

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setLabRender(true);
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labRender())).toBe(
    true
  );

  const beforeSecret = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 13, 3);
    return { keys: p.labWallKeys(), faces: p.labRenderStats().faces };
  });
  const opened = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const ok = p.openSecret(5, 13);
    return { ok, open: p.secretOpen(5, 13), keys: p.labWallKeys(), faces: p.labRenderStats().faces };
  });
  expect(opened.ok).toBe(true);
  expect(opened.open).toBe(true);
  expect(opened.faces, 'rebuild still has every wall after the secret opens').toBeGreaterThanOrEqual(
    beforeSecret.faces
  );
  for (const key of beforeSecret.keys) {
    expect(opened.keys.includes(key), `missing ${key} after secret open`).toBe(true);
  }

  for (const pose of POSES) {
    await shot(page, pose.x, pose.y, pose.dir, `labworld_${pose.file}.png`);
  }

  const labLair = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const canvas = document.querySelector('canvas');
    const w = canvas?.width ?? 420;
    const h = canvas?.height ?? 912;
    p.setPosition(19, 3, 2);
    p.setFlickerFrame(0);
    return {
      luma198: p.tileBrightness(19, 8),
      lit197: p.isSquareLit(19, 7),
      lair: p.regionStats(w * 0.22, h * 0.22, w * 0.78, h * 0.72),
      stairs: p.darkFx().stairs,
      lantern: p.labRenderStats().lights.lantern
    };
  });
  expect(labLair.luma198).toBeCloseTo(0.05848, 4);
  expect(labLair.lit197).toBe(false);
  expect(labLair.stairs, 'down stairs at (16,10) still placed').toBeGreaterThan(0);
  expect(labLair.lantern).toBeGreaterThan(0);
  const lairRatio = labLair.lair.luma / Math.max(classicStats.lair.luma, 0.001);
  expect(lairRatio, 'lair rendered brightness within 1.1x of classic').toBeLessThanOrEqual(1.1);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.snapDoor(4, 2, true);
    p.setPosition(3, 2, 1);
  });
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2))).toBe(
    true
  );

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(12, 9, 1);
    p.interact();
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.setFlickerFrame(0);
  });
  await page.waitForTimeout(1100);
  const labStats = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      fps: p.fps(),
      draws: p.draws(),
      tris: p.triangles(),
      frame: p.frameStats(),
      world: p.labRenderStats()
    };
  });
  expect(labStats.world.enabled).toBe(true);
  expect(labStats.draws).toBeGreaterThan(0);

  writeFileSync(
    `${OUT}/labworld_perf.json`,
    JSON.stringify({ classic: classicStats, lab: labStats, lairRatio }, null, 2)
  );
});

test('dev panel offers a Lab world renderer toggle', async ({ page }) => {
  await boot(page, 'test=1&dev=1');
  await expect(page.locator('#dev-panel')).toBeVisible();
  await page.locator('#dev-collapse').click();
  const renderRow = page.locator('.row[data-key="Render"]');
  await expect(renderRow).toBeVisible();
  await renderRow.getByRole('button', { name: 'Lab' }).click();
  await page.waitForTimeout(800);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labRender())
  ).toBe(true);
});
