import { chromium, webkit, devices } from 'playwright';

async function testWebKit() {
  const iPhone15 = devices['iPhone 15 Pro'];
  const browser = await webkit.launch({ headless: true }); // Use WebKit for Safari testing
  const context = await browser.newContext({
    ...iPhone15,
  });
  const page = await context.newPage();

  const errors: string[] = [];
  const warnings: string[] = [];
  const failed404s: string[] = [];

  // Capture console errors
  page.on('console', (msg) => {
    const text = msg.text();
    console.log(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    } else if (msg.type() === 'warning') {
      warnings.push(text);
    }
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    console.log('[PAGE ERROR]', error.message);
    errors.push(`Page Error: ${error.message}`);
  });

  // Capture failed network requests (404s)
  page.on('requestfailed', (request) => {
    failed404s.push(`${request.url()} - ${request.failure()?.errorText}`);
  });

  page.on('response', (response) => {
    if (response.status() === 404) {
      failed404s.push(`404: ${response.url()}`);
    }
  });

  // Navigate to the game
  console.log('Navigating to http://localhost:5173/sunken-keep/');
  try {
    await page.goto('http://localhost:5173/sunken-keep/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (e: any) {
    console.error('Navigation failed:', e.message);
    throw e;
  }

  // Wait for game to initialize
  console.log('Waiting for game to initialize...');
  await page.waitForTimeout(2000);

  // Click "TAP TO START" button
  const startButton = page.locator('text=TAP TO START');
  try {
    await startButton.waitFor({ timeout: 2000 });
    console.log('Clicking TAP TO START...');
    await startButton.click();
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('No TAP TO START button found');
  }

  // Skip intro if button is available
  const skipButton = page.locator('text=Skip Intro');
  try {
    await skipButton.waitFor({ timeout: 2000 });
    console.log('Skipping intro...');
    await skipButton.click();
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('No skip button found, continuing...');
  }

  // Take screenshot
  await page.screenshot({ path: '/workspace/webkit-test-screenshot.png', fullPage: true });
  console.log('Screenshot saved to webkit-test-screenshot.png');

  // Log what's on the page
  const bodyText = await page.locator('body').textContent();
  console.log('Page text:', bodyText?.slice(0, 200));

  // Check canvas is rendering (not black)
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible()) {
    const canvasData = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      // Count non-black pixels
      let nonBlackPixels = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        if (r > 10 || g > 10 || b > 10) {
          nonBlackPixels++;
        }
      }
      return { width: el.width, height: el.height, nonBlackPixels };
    });
    console.log('Canvas data:', canvasData);
    if (canvasData && canvasData.nonBlackPixels === 0) {
      errors.push('Canvas is completely black!');
    }
  } else {
    errors.push('Canvas not visible!');
  }

  await browser.close();

  // Print results
  console.log('\n=== Test Results ===');
  console.log(`Errors: ${errors.length}`);
  errors.forEach((err) => console.log(`  - ${err}`));

  console.log(`\n404s/Failed Requests: ${failed404s.length}`);
  failed404s.forEach((err) => console.log(`  - ${err}`));

  console.log(`\nWarnings: ${warnings.length}`);
  if (warnings.length > 0 && warnings.length < 20) {
    warnings.forEach((warn) => console.log(`  - ${warn}`));
  }

  if (errors.length === 0 && failed404s.length === 0) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Tests failed!');
    process.exit(1);
  }
}

testWebKit().catch(console.error);
