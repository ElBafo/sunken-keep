import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Boot = {
  skipToPlayableMs?: number | null;
  atlasFallbacks?: string[];
  atlasLeaks?: string[];
  imagePngs?: string[];
  pendingFirstFightSounds?: string[];
};

type Proto3d = {
  boot: () => Boot;
  setPosition: (x: number, y: number, dir: number) => void;
  snuffFacing: () => void;
  isSquareLit: (x: number, y: number) => boolean;
  darkFx: () => {
    eyes: Array<{ x: number; y: number; monster: string; tint: string; visible: boolean }>;
    glints: Array<{ x: number; y: number; item: string; visible: boolean }>;
    stairs: number;
  };
};

test.use({ ...devices['iPhone 15'], hasTouch: true, isMobile: true });

function pngReport() {
  const boot = (window as unknown as { __proto3d: Proto3d }).__proto3d.boot();
  const pngs = boot.imagePngs ?? [];
  return {
    leaks: boot.atlasLeaks ?? ['missing'],
    fallbacks: boot.atlasFallbacks ?? [],
    pngCount: pngs.length,
    pngs,
    darkSingles: pngs.filter((p) => p.startsWith('proto3d/fx/dark/'))
  };
}

test('New Game skip to first fight then dark corridor has no packed-frame single-file loads', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto(`${BASE_URL}/proto3d.html`);
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __proto3d?: { ready?: boolean; boot?: () => { tapPromptReady?: boolean } } })
        .__proto3d;
      return api?.ready === true && api.boot?.().tapPromptReady === true;
    },
    null,
    { timeout: 60000 }
  );
  const tap = page.locator('#tap-to-start');
  if (await tap.isVisible()) {
    await tap.click({ force: true });
    await expect(tap).toBeHidden({ timeout: 8000 });
  }
  await page.waitForFunction(
    () => (window as unknown as { __proto3d: { boot: () => { introShot1?: boolean } } }).__proto3d.boot().introShot1 === true,
    null,
    { timeout: 30000 }
  );
  await page.locator('.title-hit[data-id="New Game"]').click({ force: true });
  await expect(page.locator('#intro-overlay')).toHaveClass(/show/, { timeout: 15000 });
  const skip = page.locator('#intro-skip');
  await expect(skip).toBeVisible({ timeout: 8000 });
  await skip.click({ force: true });
  await page.waitForFunction(
    () => {
      const boot = (window as unknown as { __proto3d?: { boot?: () => Boot } }).__proto3d?.boot?.();
      return boot?.skipToPlayableMs != null;
    },
    null,
    { timeout: 45000 }
  );
  await page.waitForFunction(
    () => {
      const boot = (window as unknown as { __proto3d?: { boot?: () => Boot } }).__proto3d?.boot?.();
      return (boot?.pendingFirstFightSounds?.length ?? 1) === 0;
    },
    null,
    { timeout: 8000 }
  );
  const firstFight = await page.evaluate(pngReport);
  console.log('ATLAS first fight', {
    pngCount: firstFight.pngCount,
    leaks: firstFight.leaks,
    darkSingles: firstFight.darkSingles
  });
  expect(firstFight.leaks, `packed frames loaded as singles: ${firstFight.leaks.join(', ')}`).toEqual([]);
  expect(firstFight.darkSingles, 'no fx/dark frame as a single file at first fight').toEqual([]);
  expect(firstFight.pngCount).toBeGreaterThan(0);

  // Past the slime (7,2): stand at (9,2) looking west so amber eyes show. Snuff the
  // start torch so the (2,5) key glints. Then look north from (2,7) at those glints.
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.snuffFacing();
    p.setPosition(9, 2, 3);
  });
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      const fx = p.darkFx();
      return (
        fx.eyes.some((e) => e.visible) &&
        fx.glints.some((g) => g.visible && g.item === 'key')
      );
    },
    null,
    { timeout: 8000 }
  );
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${OUT}/atlas_dark_corridor_eyes.png`, fullPage: false });

  await page.evaluate(() => {
    (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(2, 7, 0);
  });
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${OUT}/atlas_dark_corridor_glints.png`, fullPage: false });

  const dark = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const boot = p.boot();
    const pngs = boot.imagePngs ?? [];
    return {
      leaks: boot.atlasLeaks ?? ['missing'],
      fallbacks: boot.atlasFallbacks ?? [],
      pngCount: pngs.length,
      pngs,
      darkSingles: pngs.filter((path) => path.startsWith('proto3d/fx/dark/')),
      slimeLit: p.isSquareLit(7, 2),
      keyLit: p.isSquareLit(2, 5),
      fx: p.darkFx()
    };
  });
  console.log('ATLAS dark corridor', {
    pngCount: dark.pngCount,
    leaks: dark.leaks,
    darkSingles: dark.darkSingles,
    slimeLit: dark.slimeLit,
    keyLit: dark.keyLit,
    eyes: dark.fx.eyes.filter((e) => e.visible),
    glints: dark.fx.glints.filter((g) => g.visible)
  });
  expect(dark.leaks, `packed frames loaded as singles in dark corridor: ${dark.leaks.join(', ')}`).toEqual([]);
  expect(dark.darkSingles, 'no fx/dark frame loads as a single file').toEqual([]);
  expect(
    dark.fx.eyes.some((e) => e.visible),
    'eyes show in the dark corridor'
  ).toBe(true);
  expect(
    dark.fx.glints.some((g) => g.visible && g.item === 'key'),
    'key glint shows in the dark'
  ).toBe(true);
  expect(dark.pngCount).toBeGreaterThan(0);
});
