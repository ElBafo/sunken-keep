import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';

type Boot = {
  skipToPlayableMs?: number | null;
  atlasFallbacks?: string[];
  atlasLeaks?: string[];
  imagePngs?: string[];
  pendingFirstFightSounds?: string[];
};

test.use({ ...devices['iPhone 15'], hasTouch: true, isMobile: true });

test('New Game skip to first fight has no packed-frame single-file loads', async ({ page }) => {
  test.setTimeout(120000);
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
  const report = await page.evaluate(() => {
    const boot = (window as unknown as { __proto3d: { boot: () => Boot } }).__proto3d.boot();
    return {
      leaks: boot.atlasLeaks ?? ['missing'],
      fallbacks: boot.atlasFallbacks ?? [],
      pngCount: boot.imagePngs?.length ?? -1
    };
  });
  expect(report.leaks, `packed frames loaded as singles: ${report.leaks.join(', ')}`).toEqual([]);
  expect(report.pngCount).toBeGreaterThan(0);
});
