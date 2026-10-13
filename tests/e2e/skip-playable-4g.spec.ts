import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const RUNS = 3;
const BUDGET_MS = 5000;
const DOWNLOAD_MBPS = 9;
const LATENCY_MS = 150;

test.use({ ...devices['iPhone 15'], hasTouch: true, isMobile: true });

async function skipToPlayable(page: import('@playwright/test').Page): Promise<{
  skipToPlayableMs: number;
  pendingFloor1Sounds: string[];
}> {
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
  const box = await skip.boundingBox();
  expect(box).toBeTruthy();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  await skip.click({ force: true });
  await page.waitForFunction(
    () => {
      const boot = (window as unknown as { __proto3d?: { boot?: () => { skipToPlayableMs?: number | null } } }).__proto3d
        ?.boot?.();
      return boot?.skipToPlayableMs != null;
    },
    null,
    { timeout: 45000 }
  );
  return page.evaluate(() => {
    const boot = (
      window as unknown as {
        __proto3d: {
          boot: () => { skipToPlayableMs?: number | null; pendingFloor1Sounds?: string[] };
        };
      }
    ).__proto3d.boot();
    return {
      skipToPlayableMs: boot.skipToPlayableMs ?? -1,
      pendingFloor1Sounds: boot.pendingFloor1Sounds ?? ['missing-debug']
    };
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

test.describe('skip-to-playable on iPhone Fast 4G', () => {
  test('New Game skip median of 3 stays under 5s at 9 Mbps / 150 ms', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP network throttle is Chromium-only');
    test.setTimeout(300000);
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({
        ...devices['iPhone 15'],
        hasTouch: true,
        isMobile: true
      });
      const page = await context.newPage();
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: (DOWNLOAD_MBPS * 1024 * 1024) / 8,
        uploadThroughput: (3 * 1024 * 1024) / 8,
        latency: LATENCY_MS
      });
      const result = await skipToPlayable(page);
      console.log(`iPhone 9Mbps/150ms run ${i + 1}: ${result.skipToPlayableMs}ms pending=${JSON.stringify(result.pendingFloor1Sounds)}`);
      expect(result.pendingFloor1Sounds, 'no floor 1 sound still pending at play start').toEqual([]);
      times.push(result.skipToPlayableMs);
      await context.close();
    }
    const med = median(times);
    console.log(`iPhone 9Mbps/150ms skip-to-playable runs=${times.join(',')} median=${med}ms budget=${BUDGET_MS}ms`);
    expect(med).toBeGreaterThan(0);
    expect(med).toBeLessThan(BUDGET_MS);
  });
});
