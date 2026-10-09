import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';

async function testChromeTouch() {
  console.log('=== Chrome Touch Test ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const missingImages: string[] = [];
  
  // Capture console
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`[ERROR] ${msg.text()}`);
    } else if (msg.text().includes('Missing or broken image')) {
      missingImages.push(msg.text());
      console.log(`[IMAGE] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
  });
  
  try {
    // Navigate
    console.log('1. Navigating...');
    await page.goto('http://localhost:5173/sunken-keep/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    //Screenshot title
    await page.screenshot({ path: 'chrome-touch-title.png' });
    console.log('   Screenshot: chrome-touch-title.png');
    
    // Tap TAP TO START
    console.log('\n2. Tapping TAP TO START...');
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    
    // Tap New Game
    console.log('\n3. Tapping New Game...');
    await page.touchscreen.tap(135, 442);
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'chrome-touch-game.png' });
    console.log('   Screenshot: chrome-touch-game.png');
    
    // Tap hand button
    console.log('\n4. Tapping hand button...');
    await page.touchscreen.tap(29, 425);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'chrome-touch-after-tap.png' });
    console.log('   Screenshot: chrome-touch-after-tap.png');
    
    // Test floor 2
    console.log('\n5. Loading floor 2...');
    await page.goto('http://localhost:5173/sunken-keep/?floor=2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'chrome-touch-floor2.png' });
    console.log('   Screenshot: chrome-touch-floor2.png');
    
  } catch (e: any) {
    console.error(`\n[TEST ERROR] ${e.message}`);
    errors.push(e.message);
  }
  
  await browser.close();
  
  // Compute MD5s
  console.log('\n=== Screenshot MD5s ===');
  const screenshots = [
    'chrome-touch-game.png',
    'chrome-touch-after-tap.png',
    'chrome-touch-floor2.png'
  ];
  
  const md5s: Record<string, string> = {};
  for (const file of screenshots) {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file);
      const hash = crypto.createHash('md5').update(data).digest('hex');
      md5s[file] = hash;
      console.log(`${file}: ${hash}`);
    }
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Page errors: ${errors.length}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Missing images: ${missingImages.length}`);
  
  if (errors.length === 0 && consoleErrors.length === 0 && missingImages.length === 0) {
    console.log('\n✓ All tests PASSED');
    process.exit(0);
  } else {
    console.log('\n✗ Tests FAILED');
    process.exit(1);
  }
}

testChromeTouch().catch(console.error);
