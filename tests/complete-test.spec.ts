import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']); // Use iPhone 15, not Pro

test('3D prototype - complete visual test', async ({ page }) => {
  const errors: string[] = [];
  const failed404s: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('[ERROR]', msg.text());
    }
  });
  
  page.on('response', response => {
    if (response.status() === 404) {
      failed404s.push(response.url());
      console.log('[404]', response.url());
    }
  });
  
  // Go to prototype with test flag for preserveDrawingBuffer
  await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  await page.waitForTimeout(1000);
  
  // Click to start
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Screenshot 1: Start position (1, 7) facing north - wall on LEFT
  await page.screenshot({ path: 'screenshots/proto-start.png', fullPage: false });
  console.log('✓ Screenshot: proto-start.png (1,7 facing north)');
  
  // Move forward once
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(250);
  
  // Screenshot 2: One step forward
  await page.screenshot({ path: 'screenshots/proto-forward.png' });
  console.log('✓ Screenshot: proto-forward.png (one step forward)');
  
  // Move to water hall - continue forward
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  
  // Screenshot 3: Water hall (around 2,2)
  await page.screenshot({ path: 'screenshots/proto-water.png' });
  console.log('✓ Screenshot: proto-water.png (water hall)');
  
  // Navigate to locked door - but stop 2 squares away
  await page.locator('#btn-right').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(250);
  // Now facing door from 2 squares away
  
  // Screenshot 4: Door from 2 squares away
  await page.screenshot({ path: 'screenshots/proto-door.png' });
  console.log('✓ Screenshot: proto-door.png (door from 2 squares)');
  
  // Navigate toward slime - go around
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-right').click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  await page.locator('#btn-left').click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  // Now 2 squares from slime
  
  // Screenshot 5: Slime from 2 squares
  await page.screenshot({ path: 'screenshots/proto-slime.png' });
  console.log('✓ Screenshot: proto-slime.png (slime from 2 squares)');
  
  // Screenshot 6: Without palette
  await page.goto(`${BASE_URL}/proto3d.html?palette=0&test=1`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/proto-no-palette.png' });
  console.log('✓ Screenshot: proto-no-palette.png (palette disabled)');
  
  // Check canvas dimensions
  const canvasDims = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });
  
  console.log(`Canvas dimensions: ${canvasDims.width}x${canvasDims.height}`);
  expect(canvasDims.width).toBe(270);
  
  // Check errors
  console.log(`Console errors: ${errors.length}`);
  console.log(`404 errors: ${failed404s.length}`);
  
  expect(errors.length).toBe(0);
  expect(failed404s.length).toBe(0);
});

test('3D prototype - pixel count assertion', async ({ page }) => {
  await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Count non-near-black pixels using canvas inspection
  const pixelCount = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const gl = (canvas as any).getContext('webgl2') || (canvas as any).getContext('webgl');
    if (!gl) return 0;
    
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    let nonBlackCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      // Count as non-near-black if any channel > 20 (dungeon atmosphere)
      if (r > 20 || g > 20 || b > 20) {
        nonBlackCount++;
      }
    }
    
    return nonBlackCount;
  });
  
  const totalPixels = 270 * 453;
  const percentage = ((pixelCount / totalPixels) * 100).toFixed(2);
  console.log(`Non-near-black pixels: ${pixelCount} / ${totalPixels} (${percentage}%)`);
  
  // Dark dungeon atmosphere: require visible geometry (minimum 8% lit pixels)
  const minPixels = Math.floor(totalPixels * 0.08);
  console.log(`Minimum required: ${minPixels} pixels (8%)`);
  expect(pixelCount).toBeGreaterThan(minPixels);
});
