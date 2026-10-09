import { webkit, devices } from 'playwright';

async function testAllFloors() {
  const iPhone15 = devices['iPhone 15 Pro'];
  const browser = await webkit.launch({ headless: true });
  
  const errors: string[] = [];
  const failed404s: string[] = [];
  
  // Test floor 1
  console.log('\n=== Testing Floor 1 ===');
  await testFloor(browser, iPhone15, 1, errors, failed404s);
  
  // Test floor 2
  console.log('\n=== Testing Floor 2 ===');
  await testFloor(browser, iPhone15, 2, errors, failed404s);
  
  // Test floor 3
  console.log('\n=== Testing Floor 3 ===');
  await testFloor(browser, iPhone15, 3, errors, failed404s);
  
  // Test floor 4
  console.log('\n=== Testing Floor 4 ===');
  await testFloor(browser, iPhone15, 4, errors, failed404s);
  
  await browser.close();
  
  // Results
  console.log('\n=== Final Results ===');
  console.log(`Errors: ${errors.length}`);
  errors.forEach(e => console.log(`  - ${e}`));
  console.log(`404s: ${failed404s.length}`);
  failed404s.forEach(e => console.log(`  - ${e}`));
  
  if (errors.length === 0 && failed404s.length === 0) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Tests failed!');
    process.exit(1);
  }
}

async function testFloor(browser: any, device: any, floorNum: number, errors: string[], failed404s: string[]) {
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  
  // Capture errors
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      console.log(`[ERROR] ${msg.text()}`);
      errors.push(`Floor ${floorNum}: ${msg.text()}`);
    }
  });
  
  page.on('pageerror', (error: any) => {
    console.log(`[PAGE ERROR] ${error.message}`);
    console.log(`[STACK] ${error.stack || 'No stack'}`);
    errors.push(`Floor ${floorNum}: ${error.message}`);
  });
  
  page.on('response', (response: any) => {
    if (response.status() === 404) {
      console.log(`[404] ${response.url()}`);
      failed404s.push(`Floor ${floorNum}: ${response.url()}`);
    }
  });
  
  try {
    // Navigate
    const url = `http://localhost:5173/sunken-keep/?floor=${floorNum}&debug=1`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Wait for init
    await page.waitForTimeout(2000);
    
    // Click TAP TO START
    try {
      await page.click('text=TAP TO START', { timeout: 2000 });
      await page.waitForTimeout(2000);
    } catch {
      console.log('No TAP TO START (already in game)');
    }
    
    // Check canvas
    const canvasCheck = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No 2d context' };
      
      // Check view region (270x380)
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
        colorCount: colors.size,
        wallsVisible: colors.size > 3
      };
    });
    
    console.log(`Canvas: ${canvasCheck.width}x${canvasCheck.height}, ${canvasCheck.colorCount} colors`);
    
    if (!canvasCheck.wallsVisible) {
      errors.push(`Floor ${floorNum}: View appears flat (only ${canvasCheck.colorCount} colors)`);
    }
    
    // Screenshot
    await page.screenshot({ path: `floor-${floorNum}-test.png`, fullPage: false });
    console.log(`Screenshot saved: floor-${floorNum}-test.png`);
    
    // Test a tap
    await page.click('canvas', { position: { x: 135, y: 300 } });
    await page.waitForTimeout(500);
    console.log('Tap tested');
    
    // Test a swipe (simulate)
    await page.mouse.move(100, 300);
    await page.mouse.down();
    await page.mouse.move(200, 300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    console.log('Swipe tested');
    
  } catch (e: any) {
    console.error(`Floor ${floorNum} failed:`, e.message);
    errors.push(`Floor ${floorNum}: ${e.message}`);
  } finally {
    await context.close();
  }
}

testAllFloors().catch(console.error);
