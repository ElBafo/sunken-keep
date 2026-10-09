# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: iphone-rendering.spec.ts >> iPhone Safari rendering >> game loads and fills full viewport after intro
- Location: tests/e2e/iphone-rendering.spec.ts:4:3

# Error details

```
Error: page.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('#tap-to-start')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('iPhone Safari rendering', () => {
  4   |   test('game loads and fills full viewport after intro', async ({ page }) => {
  5   |     await page.goto('/sunken-keep/');
  6   |     
  7   |     // Wait for game to load
  8   |     await page.waitForSelector('canvas#game', { timeout: 10000 });
  9   |     
  10  |     // Take screenshot of tap-to-start screen
  11  |     await page.screenshot({ path: 'screenshots/iphone-tap-to-start.png', fullPage: false });
  12  |     
  13  |     // Tap to start
> 14  |     await page.click('#tap-to-start');
      |                ^ Error: page.click: Target page, context or browser has been closed
  15  |     
  16  |     // Wait a moment for intro to start
  17  |     await page.waitForTimeout(1000);
  18  |     
  19  |     // Take screenshot during intro
  20  |     await page.screenshot({ path: 'screenshots/iphone-intro.png', fullPage: false });
  21  |     
  22  |     // Skip intro (tap or press space)
  23  |     await page.keyboard.press('Escape');
  24  |     await page.waitForTimeout(500);
  25  |     
  26  |     // Now we should be in gameplay
  27  |     await page.waitForTimeout(1000);
  28  |     
  29  |     // Take screenshot of full game UI
  30  |     await page.screenshot({ path: 'screenshots/iphone-gameplay-full.png', fullPage: false });
  31  |     
  32  |     // Verify canvas is visible and properly sized
  33  |     const canvas = await page.$('canvas#game');
  34  |     expect(canvas).not.toBeNull();
  35  |     
  36  |     const canvasBox = await canvas!.boundingBox();
  37  |     expect(canvasBox).not.toBeNull();
  38  |     
  39  |     // Canvas should be visible and have reasonable dimensions
  40  |     expect(canvasBox!.width).toBeGreaterThan(200);
  41  |     expect(canvasBox!.height).toBeGreaterThan(400);
  42  |     
  43  |     console.log(`Canvas dimensions: ${canvasBox!.width}x${canvasBox!.height}`);
  44  |   });
  45  |   
  46  |   test('control panel is visible and interactive', async ({ page }) => {
  47  |     await page.goto('/sunken-keep/');
  48  |     await page.waitForSelector('canvas#game');
  49  |     
  50  |     // Start game and skip intro
  51  |     await page.click('#tap-to-start');
  52  |     await page.waitForTimeout(1000);
  53  |     await page.keyboard.press('Escape');
  54  |     await page.waitForTimeout(1000);
  55  |     
  56  |     // Take screenshot showing control panel
  57  |     await page.screenshot({ path: 'screenshots/iphone-control-panel.png', fullPage: false });
  58  |     
  59  |     // Move around to verify controls work
  60  |     await page.keyboard.press('ArrowUp');
  61  |     await page.waitForTimeout(300);
  62  |     
  63  |     await page.screenshot({ path: 'screenshots/iphone-after-move.png', fullPage: false });
  64  |     
  65  |     // Turn left
  66  |     await page.keyboard.press('q');
  67  |     await page.waitForTimeout(300);
  68  |     
  69  |     await page.screenshot({ path: 'screenshots/iphone-after-turn.png', fullPage: false });
  70  |   });
  71  |   
  72  |   test('left and right walls are correctly positioned', async ({ page }) => {
  73  |     await page.goto('/sunken-keep/');
  74  |     await page.waitForSelector('canvas#game');
  75  |     
  76  |     // Start game and skip intro
  77  |     await page.click('#tap-to-start');
  78  |     await page.waitForTimeout(1000);
  79  |     await page.keyboard.press('Escape');
  80  |     await page.waitForTimeout(1000);
  81  |     
  82  |     // At start position (1,7) facing north
  83  |     // Wall should be on left (column 0), open on right (column 2)
  84  |     await page.screenshot({ path: 'screenshots/iphone-start-position.png', fullPage: false });
  85  |     
  86  |     // Turn to face the wall on the left
  87  |     await page.keyboard.press('q'); // Turn left (west)
  88  |     await page.waitForTimeout(300);
  89  |     
  90  |     await page.screenshot({ path: 'screenshots/iphone-facing-west.png', fullPage: false });
  91  |     
  92  |     // Turn right twice to face east
  93  |     await page.keyboard.press('e');
  94  |     await page.waitForTimeout(300);
  95  |     await page.keyboard.press('e');
  96  |     await page.waitForTimeout(300);
  97  |     
  98  |     await page.screenshot({ path: 'screenshots/iphone-facing-east.png', fullPage: false });
  99  |   });
  100 | });
  101 | 
```