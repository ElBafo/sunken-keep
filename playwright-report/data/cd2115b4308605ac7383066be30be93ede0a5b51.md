# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-polish.spec.ts >> Visual polish verification >> capture screenshots and measure FPS
- Location: tests/e2e/visual-polish.spec.ts:4:3

# Error details

```
Error: page.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('#tap-to-start')
    - locator resolved to <div id="tap-to-start">…</div>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Visual polish verification', () => {
  4   |   test('capture screenshots and measure FPS', async ({ page }) => {
  5   |     await page.goto('/sunken-keep/');
  6   |     await page.waitForSelector('canvas#game');
  7   |     
  8   |     // Start game
> 9   |     await page.click('#tap-to-start');
      |                ^ Error: page.click: Target page, context or browser has been closed
  10  |     await page.waitForTimeout(1000);
  11  |     await page.keyboard.press('Escape');
  12  |     await page.waitForTimeout(1000);
  13  |     
  14  |     // Measure FPS over 3 seconds
  15  |     const fpsData = await page.evaluate(() => {
  16  |       return new Promise<{ fps: number; frameCount: number }>((resolve) => {
  17  |         let frameCount = 0;
  18  |         const startTime = performance.now();
  19  |         const duration = 3000; // 3 seconds
  20  |         
  21  |         function countFrame() {
  22  |           frameCount++;
  23  |           if (performance.now() - startTime < duration) {
  24  |             requestAnimationFrame(countFrame);
  25  |           } else {
  26  |             const elapsed = (performance.now() - startTime) / 1000;
  27  |             resolve({ fps: frameCount / elapsed, frameCount });
  28  |           }
  29  |         }
  30  |         
  31  |         requestAnimationFrame(countFrame);
  32  |       });
  33  |     });
  34  |     
  35  |     console.log(`FPS: ${fpsData.fps.toFixed(2)} (${fpsData.frameCount} frames in 3s)`);
  36  |     
  37  |     // Position 1: Start position with lit carving sconce
  38  |     await page.screenshot({ 
  39  |       path: 'screenshots/visual-start-lit-carving.png',
  40  |       fullPage: false 
  41  |     });
  42  |     
  43  |     // Navigate to locked door
  44  |     await page.keyboard.press('ArrowUp');
  45  |     await page.waitForTimeout(300);
  46  |     await page.keyboard.press('ArrowUp');
  47  |     await page.waitForTimeout(300);
  48  |     await page.keyboard.press('q'); // Turn left to face west
  49  |     await page.waitForTimeout(300);
  50  |     await page.keyboard.press('ArrowUp');
  51  |     await page.waitForTimeout(300);
  52  |     await page.keyboard.press('ArrowUp');
  53  |     await page.waitForTimeout(300);
  54  |     await page.keyboard.press('ArrowUp');
  55  |     await page.waitForTimeout(300);
  56  |     await page.keyboard.press('ArrowUp');
  57  |     await page.waitForTimeout(300);
  58  |     await page.keyboard.press('q'); // Turn left to face south
  59  |     await page.waitForTimeout(300);
  60  |     await page.keyboard.press('ArrowUp');
  61  |     await page.waitForTimeout(300);
  62  |     await page.keyboard.press('ArrowUp');
  63  |     await page.waitForTimeout(300);
  64  |     
  65  |     // Position 2: Locked door with lit sconce
  66  |     await page.screenshot({ 
  67  |       path: 'screenshots/visual-locked-door-lit.png',
  68  |       fullPage: false 
  69  |     });
  70  |     
  71  |     // Go to flooded hall with dead sconce
  72  |     await page.keyboard.press('q'); // Turn left to face east
  73  |     await page.waitForTimeout(300);
  74  |     await page.keyboard.press('ArrowUp');
  75  |     await page.waitForTimeout(300);
  76  |     
  77  |     // Position 3: Flooded hall with deep water
  78  |     await page.screenshot({ 
  79  |       path: 'screenshots/visual-flooded-hall.png',
  80  |       fullPage: false 
  81  |     });
  82  |     
  83  |     // Navigate to dead sconce corridor
  84  |     await page.keyboard.press('e'); // Turn right to face south
  85  |     await page.waitForTimeout(300);
  86  |     await page.keyboard.press('ArrowUp');
  87  |     await page.waitForTimeout(300);
  88  |     await page.keyboard.press('ArrowUp');
  89  |     await page.waitForTimeout(300);
  90  |     await page.keyboard.press('ArrowUp');
  91  |     await page.waitForTimeout(300);
  92  |     await page.keyboard.press('ArrowUp');
  93  |     await page.waitForTimeout(300);
  94  |     
  95  |     // Position 4: Dead sconce corridor
  96  |     await page.screenshot({ 
  97  |       path: 'screenshots/visual-dead-sconce.png',
  98  |       fullPage: false 
  99  |     });
  100 |     
  101 |     // Verify FPS is at least 30
  102 |     expect(fpsData.fps).toBeGreaterThan(30);
  103 |   });
  104 | });
  105 | 
```