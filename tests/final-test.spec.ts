import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']);

test('Final WebKit test with screenshots', async ({ page }) => {
  const errors: string[] = [];
  const failed404s: string[] = [];
  
  page.on('console', msg => {
    console.log('[BROWSER]', msg.text());
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('response', response => {
    if (response.status() === 404) {
      failed404s.push(response.url());
    }
  });
  
  await page.goto(`${BASE_URL}/proto3d.html`);
  await page.waitForTimeout(1000);
  
  // Trigger debug
  await page.evaluate(() => {
    (window as any).__debugFrame = true;
  });
  
  // Click to start
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshots/final-start.png', fullPage: false });
  console.log('✓ Screenshot saved: final-start.png');
  
  // Move forward
  for (let i = 0; i < 2; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: 'screenshots/final-corridor.png' });
  console.log('✓ Screenshot saved: final-corridor.png');
  
  // Check errors
  expect(errors.length).toBe(0);
  expect(failed404s.length).toBe(0);
  
  const fpsText = await page.locator('#fps-counter').textContent();
  console.log(`FPS: ${fpsText}`);
});
