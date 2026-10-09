import { test, expect, devices } from 'playwright/test';

const BASE_URL = 'http://localhost:4173/sunken-keep';

test.use(devices['iPhone 15 Pro']);

test('verify canvas renders at 270px width', async ({ page }) => {
  await page.goto(`${BASE_URL}/proto3d.html`);
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(2000);
  
  // Check canvas internal dimensions
  const canvasDims = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    return {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight
    };
  });
  
  console.log('Canvas dimensions:', JSON.stringify(canvasDims, null, 2));
  
  // Canvas internal width should be 270
  expect(canvasDims.width).toBe(270);
  
  // Canvas should have pixel rendering CSS
  const imageRendering = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    return window.getComputedStyle(canvas).imageRendering;
  });
  
  console.log('image-rendering:', imageRendering);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshots/canvas-test.png' });
  
  // Check that scene is visible
  const hasContent = await page.evaluate(() => {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Check if there are non-black pixels
    let nonBlackCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 20 || g > 20 || b > 20) {
        nonBlackCount++;
      }
    }
    
    const totalPixels = canvas.width * canvas.height;
    const nonBlackPercent = (nonBlackCount / totalPixels) * 100;
    
    return { nonBlackCount, totalPixels, nonBlackPercent };
  });
  
  console.log('Canvas content check:', hasContent);
  console.log(`Non-black pixels: ${hasContent.nonBlackPercent.toFixed(2)}%`);
  
  // Should have at least some visible content (>5% non-black)
  expect(hasContent.nonBlackPercent).toBeGreaterThan(5);
});
