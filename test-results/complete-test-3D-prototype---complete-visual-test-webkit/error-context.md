# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: complete-test.spec.ts >> 3D prototype - complete visual test
- Location: tests/complete-test.spec.ts:7:1

# Error details

```
Error: page.goto: Could not connect to localhost: Connection refused
Call log:
  - navigating to "http://localhost:4173/sunken-keep/proto3d.html?palette=0&test=1", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - button "↑" [active] [ref=e5] [cursor=pointer]
  - button "←" [ref=e6] [cursor=pointer]
  - button "↓" [ref=e7] [cursor=pointer]
  - button "→" [ref=e8] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, devices } from 'playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:4173/sunken-keep';
  4   | 
  5   | test.use(devices['iPhone 15']); // Use iPhone 15, not Pro
  6   | 
  7   | test('3D prototype - complete visual test', async ({ page }) => {
  8   |   const errors: string[] = [];
  9   |   const failed404s: string[] = [];
  10  |   
  11  |   page.on('console', msg => {
  12  |     if (msg.type() === 'error') {
  13  |       errors.push(msg.text());
  14  |       console.log('[ERROR]', msg.text());
  15  |     }
  16  |   });
  17  |   
  18  |   page.on('response', response => {
  19  |     if (response.status() === 404) {
  20  |       failed404s.push(response.url());
  21  |       console.log('[404]', response.url());
  22  |     }
  23  |   });
  24  |   
  25  |   // Go to prototype with test flag for preserveDrawingBuffer
  26  |   await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  27  |   await page.waitForTimeout(1000);
  28  |   
  29  |   // Click to start
  30  |   await page.locator('#tap-to-start').click();
  31  |   await page.waitForTimeout(3000);
  32  |   
  33  |   // Screenshot 1: Start position (1, 7) facing north - wall on LEFT
  34  |   await page.screenshot({ path: 'screenshots/proto-start.png', fullPage: false });
  35  |   console.log('✓ Screenshot: proto-start.png (1,7 facing north)');
  36  |   
  37  |   // Move forward once
  38  |   await page.locator('#btn-forward').click();
  39  |   await page.waitForTimeout(250);
  40  |   
  41  |   // Screenshot 2: One step forward
  42  |   await page.screenshot({ path: 'screenshots/proto-forward.png' });
  43  |   console.log('✓ Screenshot: proto-forward.png (one step forward)');
  44  |   
  45  |   // Move to water hall - continue forward
  46  |   for (let i = 0; i < 4; i++) {
  47  |     await page.locator('#btn-forward').click();
  48  |     await page.waitForTimeout(250);
  49  |   }
  50  |   
  51  |   // Screenshot 3: Water hall (around 2,2)
  52  |   await page.screenshot({ path: 'screenshots/proto-water.png' });
  53  |   console.log('✓ Screenshot: proto-water.png (water hall)');
  54  |   
  55  |   // From (3,2) facing west, go to door at (4,2)
  56  |   // Turn around and go east
  57  |   await page.locator('#btn-right').click(); // face north from west
  58  |   await page.waitForTimeout(250);
  59  |   await page.locator('#btn-right').click(); // face east
  60  |   await page.waitForTimeout(250);
  61  |   // Now at (3,2) facing east, move to (5,2) to view door at (4,2) from 1 square away
  62  |   await page.locator('#btn-forward').click(); // to (4,2) - at the door
  63  |   await page.waitForTimeout(250);
  64  |   await page.locator('#btn-forward').click(); // to (5,2) - 1 square past door
  65  |   await page.waitForTimeout(250);
  66  |   await page.locator('#btn-back').click(); // back to (4,2)
  67  |   await page.waitForTimeout(250);
  68  |   await page.locator('#btn-back').click(); // to (3,2)
  69  |   await page.waitForTimeout(250);
  70  |   await page.locator('#btn-back').click(); // to (2,2)
  71  |   await page.waitForTimeout(250);
  72  |   
  73  |   // Screenshot 4: Door from 2 squares away (from 2,2 facing east toward 4,2)
  74  |   await page.screenshot({ path: 'screenshots/proto-door.png' });
  75  |   console.log('✓ Screenshot: proto-door.png (door from 2 squares away)');
  76  |   
  77  |   // Navigate to slime at (7,2) - from (2,2) facing east
  78  |   // First go to (7,2) area
  79  |   await page.locator('#btn-forward').click(); // to (3,2)
  80  |   await page.waitForTimeout(250);
  81  |   await page.locator('#btn-forward').click(); // to (4,2)
  82  |   await page.waitForTimeout(250);
  83  |   await page.locator('#btn-forward').click(); // to (5,2)
  84  |   await page.waitForTimeout(250);
  85  |   await page.locator('#btn-forward').click(); // to (6,2)
  86  |   await page.waitForTimeout(250);
  87  |   // Now at (6,2) facing east, slime is at (7,2), 1 square ahead
  88  |   
  89  |   // Screenshot 5: Slime from 1 square away
  90  |   await page.screenshot({ path: 'screenshots/proto-slime.png' });
  91  |   console.log('✓ Screenshot: proto-slime.png (slime from 1 square away)');
  92  |   
  93  |   // Screenshot 6: Without palette
> 94  |   await page.goto(`${BASE_URL}/proto3d.html?palette=0&test=1`);
      |              ^ Error: page.goto: Could not connect to localhost: Connection refused
  95  |   await page.locator('#tap-to-start').click();
  96  |   await page.waitForTimeout(2000);
  97  |   await page.screenshot({ path: 'screenshots/proto-no-palette.png' });
  98  |   console.log('✓ Screenshot: proto-no-palette.png (palette disabled)');
  99  |   
  100 |   // Check canvas dimensions
  101 |   const canvasDims = await page.evaluate(() => {
  102 |     const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  103 |     return { width: canvas.width, height: canvas.height };
  104 |   });
  105 |   
  106 |   console.log(`Canvas dimensions: ${canvasDims.width}x${canvasDims.height}`);
  107 |   expect(canvasDims.width).toBe(270);
  108 |   
  109 |   // Check errors
  110 |   console.log(`Console errors: ${errors.length}`);
  111 |   console.log(`404 errors: ${failed404s.length}`);
  112 |   
  113 |   expect(errors.length).toBe(0);
  114 |   expect(failed404s.length).toBe(0);
  115 | });
  116 | 
  117 | test('3D prototype - pixel count and measurement', async ({ page }) => {
  118 |   await page.goto(`${BASE_URL}/proto3d.html?test=1`);
  119 |   await page.locator('#tap-to-start').click();
  120 |   await page.waitForTimeout(3000);
  121 |   
  122 |   // Measure pixel values
  123 |   const measurement = await page.evaluate(() => {
  124 |     const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  125 |     const gl = (canvas as any).getContext('webgl2') || (canvas as any).getContext('webgl');
  126 |     if (!gl) return { mean: 0, nonBlackCount: 0, totalPixels: 0 };
  127 |     
  128 |     const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  129 |     gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  130 |     
  131 |     let sum = 0;
  132 |     let nonBlackCount = 0;
  133 |     const totalPixels = canvas.width * canvas.height;
  134 |     
  135 |     for (let i = 0; i < pixels.length; i += 4) {
  136 |       const r = pixels[i];
  137 |       const g = pixels[i + 1];
  138 |       const b = pixels[i + 2];
  139 |       const avg = (r + g + b) / 3;
  140 |       sum += avg;
  141 |       
  142 |       // Count as non-near-black if any channel > 20
  143 |       if (r > 20 || g > 20 || b > 20) {
  144 |         nonBlackCount++;
  145 |       }
  146 |     }
  147 |     
  148 |     return {
  149 |       mean: sum / totalPixels,
  150 |       nonBlackCount,
  151 |       totalPixels
  152 |     };
  153 |   });
  154 |   
  155 |   console.log(`Mean pixel value: ${measurement.mean.toFixed(2)}/255`);
  156 |   console.log(`Non-near-black pixels: ${measurement.nonBlackCount} / ${measurement.totalPixels} (${((measurement.nonBlackCount / measurement.totalPixels) * 100).toFixed(2)}%)`);
  157 |   
  158 |   // Target: mean 35-60/255 for readable corridor
  159 |   expect(measurement.mean).toBeGreaterThan(35);
  160 |   expect(measurement.mean).toBeLessThan(100);
  161 | });
  162 | 
```