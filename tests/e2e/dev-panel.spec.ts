import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  setFlickerFrame: (frame: number) => void;
  canvasSize: () => { canvas: [number, number]; renderTarget: [number, number]; css: [number, number] };
  getPosition: () => { x: number; y: number; dir: number };
  sprites: () => Array<{ kind: string; monsterKind?: string; monsterId?: string; x: number; y: number; hidden?: boolean }>;
  labLight: () => boolean;
  paletteEnabled: () => boolean;
  setLabLight: (on: boolean) => Promise<void> | void;
  setDevRes: (mode: 270 | 360 | 480 | 'native') => void;
  setDevCompare: (on: boolean) => Promise<void> | void;
  setDevEnemy: (enemy: 'slime' | 'ooze') => Promise<void> | void;
  setDevDist: (dist: 1 | 2) => Promise<void> | void;
  captureDevView: () => { slug: string; meta: { pixelW: number; light: string; enemy: string } } | null;
  dev: () => {
    open: boolean;
    res: 270 | 360 | 480 | 'native';
    pixels: { w: number; h: number };
    compare: boolean;
    enemy: string;
    dist: number;
    overlay: boolean;
  };
};

async function boot(page: import('@playwright/test').Page, query: string) {
  await page.goto(`${BASE_URL}/proto3d.html?${query}`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click({ force: true });
  await page.waitForTimeout(400);
}

test.use(devices['iPhone 15']);

test('dev panel is hidden for players', async ({ page }) => {
  await boot(page, 'test=1');
  await expect(page.locator('#dev-panel')).toHaveCount(0);
  const hud = await page.evaluate(() => {
    const c = document.getElementById('party-canvas') as HTMLCanvasElement | null;
    return { w: c?.width ?? 0, h: c?.height ?? 0 };
  });
  expect(hud.w).toBe(270);
});

test('dev panel toggles 3D res, compare scene, and capture', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });
  await boot(page, 'test=1&dev=1');

  await expect(page.locator('#dev-panel')).toBeVisible();
  await page.locator('#dev-collapse').click();
  await expect(page.locator('#dev-stats')).toContainText(/270/);
  await expect(page.locator('#settings-overlay')).toBeHidden();

  const before = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const hud = document.getElementById('party-canvas') as HTMLCanvasElement;
    return {
      canvas: p.canvasSize(),
      hud: [hud.width, hud.height] as [number, number],
      aspect: p.canvasSize().renderTarget[0] / p.canvasSize().renderTarget[1],
      palette: p.paletteEnabled(),
      lab: p.labLight()
    };
  });
  expect(before.canvas.renderTarget).toEqual([270, 380]);
  expect(before.hud[0]).toBe(270);
  expect(before.lab).toBe(false);
  expect(before.palette).toBe(true);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setDevRes(360));
  await page.waitForTimeout(120);
  const mid = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const hud = document.getElementById('party-canvas') as HTMLCanvasElement;
    const cam = document.getElementById('render-canvas') as HTMLCanvasElement;
    return {
      canvas: p.canvasSize(),
      hud: [hud.width, hud.height] as [number, number],
      css: [cam.clientWidth, cam.clientHeight] as [number, number],
      palette: p.paletteEnabled()
    };
  });
  expect(mid.canvas.renderTarget[0]).toBe(360);
  expect(mid.canvas.renderTarget[1] / mid.canvas.renderTarget[0]).toBeCloseTo(380 / 270, 2);
  expect(mid.hud).toEqual(before.hud);
  expect(mid.css[0]).toBe(270);
  expect(mid.palette).toBe(true);

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setFlickerFrame(0);
    await p.setDevCompare(true);
    await p.setDevEnemy('slime');
    await p.setDevDist(1);
  });
  await page.waitForTimeout(200);
  const slime = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      pos: p.getPosition(),
      sprites: p.sprites().filter((s) => s.kind === 'monster' && !s.hidden),
      dev: p.dev()
    };
  });
  expect(slime.pos).toEqual({ x: 1, y: 7, dir: 0 });
  expect(slime.dev.compare).toBe(true);
  expect(slime.sprites.some((s) => s.monsterKind === 'slime' && s.x === 1 && s.y === 6)).toBe(true);

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setDevDist(2);
  });
  await page.waitForTimeout(160);
  const two = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return p.sprites().filter((s) => s.kind === 'monster' && !s.hidden);
  });
  expect(two.some((s) => s.x === 1 && s.y === 5)).toBe(true);

  await page.locator('#dev-collapse').click();
  await page.screenshot({ path: `${OUT}/dev_compare_slime_2sq_360.png`, fullPage: false });
  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setDevDist(1);
  });
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${OUT}/dev_compare_slime_1sq_360.png`, fullPage: false });

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setDevEnemy('ooze');
    await p.setDevDist(2);
  });
  await page.waitForTimeout(400);
  const ooze = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      sprites: p.sprites().filter((s) => s.kind === 'monster' && !s.hidden),
      enemy: p.dev().enemy
    };
  });
  expect(ooze.enemy).toBe('ooze');
  expect(ooze.sprites.some((s) => s.monsterKind === 'slime' && s.x === 1 && s.y === 5)).toBe(false);

  await page.screenshot({ path: `${OUT}/dev_compare_ooze_2sq_360.png`, fullPage: false });
  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setDevDist(1);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/dev_compare_ooze_1sq_360.png`, fullPage: false });

  await page.evaluate(async () => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    await p.setDevEnemy('slime');
    await p.setDevDist(1);
    p.setDevRes(270);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/dev_compare_slime_1sq_270.png`, fullPage: false });

  await page.evaluate(async () => {
    await (window as unknown as { __proto3d: Proto3d }).__proto3d.setLabLight(true);
  });
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${OUT}/dev_compare_slime_1sq_270_lab.png`, fullPage: false });

  const cap = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.captureDevView());
  expect(cap?.slug).toMatch(/270/);
  expect(cap?.meta.enemy).toBe('slime');
  expect(cap?.meta.light).toBe('lab');

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setDevRes(270));
});
