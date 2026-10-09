import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15']);

test('verify layout - no overlap', async ({ page }) => {
  await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(2000);
  
  // Get bounding boxes
  const canvasBox = await page.locator('#render-canvas').boundingBox();
  const controlsBox = await page.locator('#controls').boundingBox();
  
  console.log('Canvas box:', canvasBox);
  console.log('Controls box:', controlsBox);
  
  expect(canvasBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  
  if (canvasBox && controlsBox) {
    // Controls top must be >= canvas bottom (no overlap)
    const canvasBottom = canvasBox.y + canvasBox.height;
    const controlsTop = controlsBox.y;
    
    console.log(`Canvas bottom: ${canvasBottom}, Controls top: ${controlsTop}`);
    expect(controlsTop).toBeGreaterThanOrEqual(canvasBottom);
  }
  
  await page.screenshot({ path: 'screenshots/layout-test.png' });
});
