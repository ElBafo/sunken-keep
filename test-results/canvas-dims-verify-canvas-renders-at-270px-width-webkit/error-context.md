# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-dims.spec.ts >> verify canvas renders at 270px width
- Location: tests/canvas-dims.spec.ts:7:1

# Error details

```
TypeError: Cannot read properties of undefined (reading 'toFixed')
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - button "↑" [ref=e5] [cursor=pointer]
  - button "←" [ref=e6] [cursor=pointer]
  - button "↓" [ref=e7] [cursor=pointer]
  - button "→" [ref=e8] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect, devices } from 'playwright/test';
  2  | 
  3  | const BASE_URL = 'http://localhost:4173/sunken-keep';
  4  | 
  5  | test.use(devices['iPhone 15 Pro']);
  6  | 
  7  | test('verify canvas renders at 270px width', async ({ page }) => {
  8  |   await page.goto(`${BASE_URL}/proto3d.html`);
  9  |   await page.locator('#tap-to-start').click();
  10 |   await page.waitForTimeout(2000);
  11 |   
  12 |   // Check canvas internal dimensions
  13 |   const canvasDims = await page.evaluate(() => {
  14 |     const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  15 |     return {
  16 |       width: canvas.width,
  17 |       height: canvas.height,
  18 |       styleWidth: canvas.style.width,
  19 |       styleHeight: canvas.style.height,
  20 |       offsetWidth: canvas.offsetWidth,
  21 |       offsetHeight: canvas.offsetHeight
  22 |     };
  23 |   });
  24 |   
  25 |   console.log('Canvas dimensions:', JSON.stringify(canvasDims, null, 2));
  26 |   
  27 |   // Canvas internal width should be 270
  28 |   expect(canvasDims.width).toBe(270);
  29 |   
  30 |   // Canvas should have pixel rendering CSS
  31 |   const imageRendering = await page.evaluate(() => {
  32 |     const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  33 |     return window.getComputedStyle(canvas).imageRendering;
  34 |   });
  35 |   
  36 |   console.log('image-rendering:', imageRendering);
  37 |   
  38 |   // Take screenshot
  39 |   await page.screenshot({ path: 'screenshots/canvas-test.png' });
  40 |   
  41 |   // Check that scene is visible
  42 |   const hasContent = await page.evaluate(() => {
  43 |     const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  44 |     const ctx = canvas.getContext('2d');
  45 |     if (!ctx) return false;
  46 |     
  47 |     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  48 |     const data = imageData.data;
  49 |     
  50 |     // Check if there are non-black pixels
  51 |     let nonBlackCount = 0;
  52 |     for (let i = 0; i < data.length; i += 4) {
  53 |       const r = data[i];
  54 |       const g = data[i + 1];
  55 |       const b = data[i + 2];
  56 |       if (r > 20 || g > 20 || b > 20) {
  57 |         nonBlackCount++;
  58 |       }
  59 |     }
  60 |     
  61 |     const totalPixels = canvas.width * canvas.height;
  62 |     const nonBlackPercent = (nonBlackCount / totalPixels) * 100;
  63 |     
  64 |     return { nonBlackCount, totalPixels, nonBlackPercent };
  65 |   });
  66 |   
  67 |   console.log('Canvas content check:', hasContent);
> 68 |   console.log(`Non-black pixels: ${hasContent.nonBlackPercent.toFixed(2)}%`);
     |                                                               ^ TypeError: Cannot read properties of undefined (reading 'toFixed')
  69 |   
  70 |   // Should have at least some visible content (>5% non-black)
  71 |   expect(hasContent.nonBlackPercent).toBeGreaterThan(5);
  72 | });
  73 | 
```