import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15 Pro']);

test('should render visible scene', async ({ page }) => {
  const logs: string[] = [];
  const errors: string[] = [];
  const failed404s: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });
  
  page.on('response', response => {
    if (response.status() === 404) {
      failed404s.push(response.url());
    }
  });
  
  await page.goto(`${BASE_URL}/proto3d.html`);
  await page.waitForTimeout(1000);
  
  // Click to start
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Screenshot at start
  await page.screenshot({ path: 'screenshots/start-position.png', fullPage: false });
  console.log('✓ Screenshot: start position');
  
  // Check for errors
  console.log(`Console errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors.join('\n'));
  }
  
  // Check for 404s
  console.log(`404 errors: ${failed404s.length}`);
  if (failed404s.length > 0) {
    console.log('404s:', failed404s.join('\n'));
  }
  
  expect(errors.length).toBe(0);
  expect(failed404s.length).toBe(0);
  
  // Move forward
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/after-move.png', fullPage: false });
  console.log('✓ Screenshot: after move');
  
  // Navigate to water hall (1, 7) -> (1, 2)
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: 'screenshots/water-hall.png', fullPage: false });
  console.log('✓ Screenshot: water hall');
  
  // Navigate to locked door area
  await page.locator('#btn-right').click();
  await page.waitForTimeout(300);
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(300);
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/locked-door.png', fullPage: false });
  console.log('✓ Screenshot: locked door area');
  
  // Navigate to slime (need to go around)
  await page.locator('#btn-right').click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
  }
  await page.locator('#btn-left').click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: 'screenshots/slime.png', fullPage: false });
  console.log('✓ Screenshot: slime');
  
  // Measure FPS
  await page.waitForTimeout(2000);
  const fpsText = await page.locator('#fps-counter').textContent();
  console.log(`FPS: ${fpsText}`);
});

test('should work with palette disabled', async ({ page }) => {
  await page.goto(`${BASE_URL}/proto3d.html?palette=0`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/no-palette.png', fullPage: false });
  console.log('✓ Screenshot: palette disabled');
});
