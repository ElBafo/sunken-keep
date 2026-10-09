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
  await page.waitForFunction(() => (window as any).__proto3d?.ready === true, null, { timeout: 15000 });
  
  // Click to start
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(1000);
  
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
  
  // From (3,2) facing west, go to door at (4,2)
  // Turn around and go east
  await page.locator('#btn-right').click(); // face north from west
  await page.waitForTimeout(250);
  await page.locator('#btn-right').click(); // face east
  await page.waitForTimeout(250);
  // Now at (3,2) facing east, move to (5,2) to view door at (4,2) from 1 square away
  await page.locator('#btn-forward').click(); // to (4,2) - at the door
  await page.waitForTimeout(250);
  await page.locator('#btn-forward').click(); // to (5,2) - 1 square past door
  await page.waitForTimeout(250);
  await page.locator('#btn-back').click(); // back to (4,2)
  await page.waitForTimeout(250);
  await page.locator('#btn-back').click(); // to (3,2)
  await page.waitForTimeout(250);
  await page.locator('#btn-back').click(); // to (2,2)
  await page.waitForTimeout(250);
  
  // Screenshot 4: Door from 2 squares away (from 2,2 facing east toward 4,2)
  await page.screenshot({ path: 'screenshots/proto-door.png' });
  console.log('✓ Screenshot: proto-door.png (door from 2 squares away)');
  
  // Slime is at tiles[2][7] = (x=7, y=2), behind the locked door at (4,2).
  // Teleport so the shot is actually facing the monster (button nav previously
  // used swapped coordinates and stopped at the door).
  await page.waitForFunction(() => (window as any).__proto3d?.ready === true);
  await page.evaluate(() => (window as any).__proto3d.setPosition(5, 2, 1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/proto-slime-2sq.png' });
  console.log('✓ Screenshot: proto-slime-2sq.png (slime from 2 squares away at 5,2 facing east)');

  await page.evaluate(() => (window as any).__proto3d.setPosition(6, 2, 1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/proto-slime.png' });
  await page.screenshot({ path: 'screenshots/proto-slime-1sq.png' });
  console.log('✓ Screenshot: proto-slime.png (slime from 1 square away at 6,2 facing east)');
  
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

test('3D prototype - pixel count and measurement', async ({ page }) => {
  await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(3000);
  
  // Measure pixel values
  const measurement = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const gl = (canvas as any).getContext('webgl2') || (canvas as any).getContext('webgl');
    if (!gl) return { mean: 0, nonBlackCount: 0, totalPixels: 0 };
    
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    let sum = 0;
    let nonBlackCount = 0;
    const totalPixels = canvas.width * canvas.height;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const avg = (r + g + b) / 3;
      sum += avg;
      
      // Count as non-near-black if any channel > 20
      if (r > 20 || g > 20 || b > 20) {
        nonBlackCount++;
      }
    }
    
    return {
      mean: sum / totalPixels,
      nonBlackCount,
      totalPixels
    };
  });
  
  console.log(`Mean pixel value: ${measurement.mean.toFixed(2)}/255`);
  console.log(`Non-near-black pixels: ${measurement.nonBlackCount} / ${measurement.totalPixels} (${((measurement.nonBlackCount / measurement.totalPixels) * 100).toFixed(2)}%)`);
  
  // Target: mean 35-60/255 for readable corridor
  expect(measurement.mean).toBeGreaterThan(35);
  expect(measurement.mean).toBeLessThan(100);
});
