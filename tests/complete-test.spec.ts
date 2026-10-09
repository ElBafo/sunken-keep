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
  
  // Move to water hall - go forward several times
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  
  // Screenshot 2: Water hall (around 2,2)
  await page.screenshot({ path: 'screenshots/proto-water.png' });
  console.log('✓ Screenshot: proto-water.png (water hall)');
  
  // Navigate to locked door (4,2)
  await page.locator('#btn-right').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(250);
  await page.locator('#btn-forward').click();
  await page.waitForTimeout(250);
  
  // Screenshot 3: Locked door
  await page.screenshot({ path: 'screenshots/proto-door.png' });
  console.log('✓ Screenshot: proto-door.png (locked door)');
  
  // Navigate to slime (7, 2) - go around
  await page.locator('#btn-right').click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  await page.locator('#btn-left').click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-forward').click();
    await page.waitForTimeout(250);
  }
  
  // Screenshot 4: Slime
  await page.screenshot({ path: 'screenshots/proto-slime.png' });
  console.log('✓ Screenshot: proto-slime.png (slime)');
  
  // Screenshot 5: Without palette
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
  
  const fpsText = await page.locator('#fps-counter').textContent();
  console.log(`FPS: ${fpsText}`);
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
      // Count as non-near-black if average > 30
      if ((r + g + b) / 3 > 30) {
        nonBlackCount++;
      }
    }
    
    return nonBlackCount;
  });
  
  console.log(`Non-near-black pixels: ${pixelCount}`);
  // Dark dungeon atmosphere means fewer bright pixels, but geometry is clearly visible
  expect(pixelCount).toBeGreaterThan(500);
});
