import { webkit, devices } from 'playwright';

async function testWebKitComprehensive() {
  console.log('Starting comprehensive WebKit test...\n');
  
  const iPhone15 = devices['iPhone 15']; // Not Pro
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...iPhone15 });
  const page = await context.newPage();
  
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  let crashed = false;
  
  // Capture ALL console messages
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    console.log(text);
  });
  
  // Capture page errors (JavaScript errors)
  page.on('pageerror', (error) => {
    const msg = `[PAGE ERROR] ${error.message}`;
    console.log(msg);
    console.log(`[STACK]\n${error.stack || 'No stack'}`);
    errors.push(error.message);
  });
  
  // Capture page crash
  page.on('crash', () => {
    crashed = true;
    console.log('[CRASH] Page crashed!');
  });
  
  // Capture failed requests (404s)
  page.on('response', (response) => {
    if (response.status() === 404) {
      const msg = `[404] ${response.url()}`;
      console.log(msg);
      errors.push(msg);
    }
  });
  
  try {
    console.log('Navigating to http://localhost:5173/sunken-keep/');
    await page.goto('http://localhost:5173/sunken-keep/', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    console.log('Page loaded (domcontentloaded)');
    
    // Wait for initialization
    console.log('Waiting 3 seconds...');
    await page.waitForTimeout(3000);
    
    // Try to click TAP TO START
    try {
      await page.click('text=TAP TO START', { timeout: 2000 });
      console.log('Clicked TAP TO START');
      await page.waitForTimeout(2000);
    } catch {
      console.log('No TAP TO START found or could not click');
    }
    
    // Screenshot
    await page.screenshot({ path: 'webkit-comprehensive-test.png' });
    console.log('Screenshot saved: webkit-comprehensive-test.png');
    
    // Check canvas
    const canvasCheck = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No 2d context' };
      
      // Check view region
      const viewData = ctx.getImageData(0, 0, Math.min(270, canvas.width), Math.min(380, canvas.height));
      const colors = new Set<string>();
      for (let i = 0; i < viewData.data.length; i += 40) {
        const r = viewData.data[i];
        const g = viewData.data[i + 1];
        const b = viewData.data[i + 2];
        if (r > 10 || g > 10 || b > 10) {
          colors.add(`${r},${g},${b}`);
        }
      }
      
      return { 
        width: canvas.width, 
        height: canvas.height,
        colorCount: colors.size
      };
    });
    
    console.log(`\nCanvas: ${canvasCheck.width}x${canvasCheck.height}, ${canvasCheck.colorCount} colors`);
    
  } catch (e: any) {
    console.error(`\n[TEST ERROR] ${e.message}`);
    errors.push(e.message);
  }
  
  await browser.close();
  
  // Summary
  console.log('\n========== SUMMARY ==========');
  console.log(`Crashed: ${crashed}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nError list:');
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log(`\nConsole messages: ${consoleMessages.length}`);
  console.log('Last 10 console messages:');
  consoleMessages.slice(-10).forEach(m => console.log(`  ${m}`));
  
  if (crashed || errors.length > 0) {
    console.log('\n✗ Test FAILED');
    process.exit(1);
  } else {
    console.log('\n✓ Test PASSED');
    process.exit(0);
  }
}

testWebKitComprehensive().catch(console.error);
