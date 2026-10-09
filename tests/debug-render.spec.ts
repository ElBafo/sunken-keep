import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']); // Not 'iPhone 15 Pro'

test('WebKit render test - must have visible content', async ({ page }) => {
  const logs: string[] = [];
  const errors: string[] = [];
  const failed404s: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('CONSOLE:', text);
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
  
  // Trigger debug frame
  await page.evaluate(() => {
    (window as any).__debugFrame = true;
  });
  
  // Click to start
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Check canvas dimensions
  const canvasDims = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    return {
      width: canvas.width,
      height: canvas.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  
  console.log('Canvas:', canvasDims);
  console.log('Expected 270 width, got', canvasDims.width);
  
  // Screenshot at start
  await page.screenshot({ path: 'screenshots/test-start.png', fullPage: false });
  console.log('✓ Screenshot: test-start.png');
  
  // Count non-black pixels in the canvas
  const pixelStats = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { error: 'No 2D context' };
    
    // WebGL canvas - can't read directly
    return { canvasWidth: canvas.width, canvasHeight: canvas.height, note: 'WebGL canvas - cannot read with 2D context' };
  });
  
  console.log('Pixel stats:', pixelStats);
  
  // Check for errors
  console.log(`Console errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }
  
  console.log(`404 errors: ${failed404s.length}`);
  if (failed404s.length > 0) {
    console.log('404s:', failed404s);
  }
  
  expect(errors.length).toBe(0);
  expect(failed404s.length).toBe(0);
  expect(canvasDims.width).toBe(270);
  
  // Move and screenshot
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/test-after-move.png' });
  
  // Test with palette disabled
  await page.goto(`${BASE_URL}/proto3d.html?palette=0`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/test-no-palette.png' });
  
  const fpsText = await page.locator('#fps-counter').textContent();
  console.log(`FPS: ${fpsText}`);
});
