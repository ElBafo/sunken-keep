import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15 Pro']);

test.describe('3D Prototype Tests', () => {
  test('should load without 404 errors', async ({ page }) => {
    const failed404s: string[] = [];
    
    page.on('response', response => {
      if (response.status() === 404) {
        failed404s.push(response.url());
      }
    });
    
    await page.goto(`${BASE_URL}/proto3d.html`);
    
    // Wait for tap to start
    await expect(page.locator('#tap-to-start')).toBeVisible();
    
    // Click to start
    await page.locator('#tap-to-start').click();
    
    // Wait for game to load
    await page.waitForTimeout(3000);
    
    // Check for 404s
    if (failed404s.length > 0) {
      console.error('404 errors found:', failed404s);
      throw new Error(`Found ${failed404s.length} 404 errors: ${failed404s.join(', ')}`);
    }
    
    console.log('✓ No 404 errors detected');
  });
  
  test('should measure FPS', async ({ page }) => {
    await page.goto(`${BASE_URL}/proto3d.html`);
    
    // Click to start
    await page.locator('#tap-to-start').click();
    
    // Wait for game to initialize
    await page.waitForTimeout(2000);
    
    // Sample FPS multiple times
    const fpsReadings: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const fpsText = await page.locator('#fps-counter').textContent();
      const fps = parseInt(fpsText?.match(/\d+/)?.[0] || '0');
      if (fps > 0) {
        fpsReadings.push(fps);
      }
    }
    
    const avgFps = fpsReadings.reduce((a, b) => a + b, 0) / fpsReadings.length;
    console.log(`FPS readings: ${fpsReadings.join(', ')}`);
    console.log(`Average FPS: ${avgFps.toFixed(1)}`);
    
    expect(avgFps).toBeGreaterThanOrEqual(30);
  });
  
  test('should take screenshots at key locations', async ({ page }) => {
    await page.goto(`${BASE_URL}/proto3d.html`);
    
    // Start game
    await page.locator('#tap-to-start').click();
    await page.waitForTimeout(2000);
    
    // Screenshot 1: Start position
    await page.screenshot({ path: 'screenshots/proto3d-start.png', fullPage: true });
    console.log('✓ Screenshot: start position');
    
    // Move forward to corridor
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/proto3d-corridor.png', fullPage: true });
    console.log('✓ Screenshot: corridor');
    
    // Turn left and move toward lit sconce
    await page.locator('#btn-left').click();
    await page.waitForTimeout(300);
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/proto3d-sconce.png', fullPage: true });
    console.log('✓ Screenshot: near lit sconce');
    
    // Navigate to water hall
    for (let i = 0; i < 3; i++) {
      await page.locator('#btn-forward').click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: 'screenshots/proto3d-water-hall.png', fullPage: true });
    console.log('✓ Screenshot: water hall');
    
    // Navigate to slime location (x:7, y:2)
    await page.locator('#btn-right').click();
    await page.waitForTimeout(300);
    for (let i = 0; i < 4; i++) {
      await page.locator('#btn-forward').click();
      await page.waitForTimeout(300);
    }
    await page.locator('#btn-left').click();
    await page.waitForTimeout(300);
    for (let i = 0; i < 3; i++) {
      await page.locator('#btn-forward').click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: 'screenshots/proto3d-slime.png', fullPage: true });
    console.log('✓ Screenshot: facing slime');
  });
  
  test('should test palette toggle', async ({ page }) => {
    // Test with palette disabled
    await page.goto(`${BASE_URL}/proto3d.html?palette=0`);
    await page.locator('#tap-to-start').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/proto3d-no-palette.png', fullPage: true });
    console.log('✓ Screenshot: palette disabled');
    
    // Test with palette enabled (default)
    await page.goto(`${BASE_URL}/proto3d.html`);
    await page.locator('#tap-to-start').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/proto3d-with-palette.png', fullPage: true });
    console.log('✓ Screenshot: palette enabled');
  });
});
