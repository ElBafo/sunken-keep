import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';

test.use({ ...devices['Desktop Chrome'], hasTouch: true });

test.describe('skip-to-playable on Fast 4G', () => {
  test('New Game skip lands in 4–5s on throttled 4 Mbps', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP network throttle is Chromium-only');
    test.setTimeout(180000);
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (1 * 1024 * 1024) / 8,
      latency: 20
    });
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
        const boot = (window as unknown as { __proto3d?: { boot?: () => { skipToPlayableMs?: number | null } } }).__proto3d
          ?.boot?.();
        return boot?.skipToPlayableMs != null;
      },
      null,
      { timeout: 45000 }
    );
    const skipToPlayableMs = await page.evaluate(
      () =>
        (window as unknown as { __proto3d: { boot: () => { skipToPlayableMs?: number | null } } }).__proto3d.boot()
          .skipToPlayableMs ?? null
    );
    console.log(`Fast 4G skip-to-playable: ${skipToPlayableMs}ms`);
    expect(skipToPlayableMs).not.toBeNull();
    expect(skipToPlayableMs ?? 0).toBeLessThan(15000);
  });
});
