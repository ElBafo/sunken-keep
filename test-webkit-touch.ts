import { webkit, devices } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';

async function testWebKitTouch() {
  console.log('=== WebKit Touch Test (iPhone 15) ===\n');
  
  const iPhone15 = devices['iPhone 15']; // Not Pro, has touch
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...iPhone15 });
  const page = await context.newPage();
  
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const missingImages: string[] = [];
  
  // Capture console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    } else if (msg.text().includes('Missing or broken image')) {
      missingImages.push(msg.text());
      console.log(`[IMAGE] ${msg.text()}`);
    } else {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });
  
  // Capture page errors
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
    console.log(error.stack);
  });
  
  try {
    // Navigate
    console.log('\n1. Navigating to title screen...');
    await page.goto('http://localhost:5173/sunken-keep/', { 
      waitUntil: 'load',
      timeout: 15000 
    });
    await page.waitForTimeout(3000);
    
    // Screenshot title
    await page.screenshot({ path: 'webkit-touch-title.png' });
    console.log('   Screenshot: webkit-touch-title.png');
    
    // Tap TAP TO START
    console.log('\n2. Tapping TAP TO START...');
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    
    // Tap New Game button (center of screen, roughly)
    console.log('\n3. Tapping New Game...');
    await page.touchscreen.tap(135, 442); // New Game button
    await page.waitForTimeout(3000); // Wait for game to initialize
    
    // Screenshot game
    await page.screenshot({ path: 'webkit-touch-game.png' });
    console.log('   Screenshot: webkit-touch-game.png');
    
    // Test a tap (hand button)
    console.log('\n4. Tapping hand button...');
    await page.touchscreen.tap(29, 425);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'webkit-touch-after-tap.png' });
    console.log('   Screenshot: webkit-touch-after-tap.png');
    
    // Test a swipe (turn)
    console.log('\n5. Swiping to turn...');
    await page.touchscreen.tap(50, 300);
    await page.mouse.down();
    await page.mouse.move(220, 300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'webkit-touch-after-swipe.png' });
    console.log('   Screenshot: webkit-touch-after-swipe.png');
    
    // Test floor 2
    console.log('\n6. Loading floor 2...');
    await page.goto('http://localhost:5173/sunken-keep/?floor=2', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'webkit-touch-floor2.png' });
    console.log('   Screenshot: webkit-touch-floor2.png');
    
    // Test floor 3
    console.log('\n7. Loading floor 3...');
    await page.goto('http://localhost:5173/sunken-keep/?floor=3', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'webkit-touch-floor3.png' });
    console.log('   Screenshot: webkit-touch-floor3.png');
    
    // Test floor 4
    console.log('\n8. Loading floor 4...');
    await page.goto('http://localhost:5173/sunken-keep/?floor=4', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.tap('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'webkit-touch-floor4.png' });
    console.log('   Screenshot: webkit-touch-floor4.png');
    
  } catch (e: any) {
    console.error(`\n[TEST ERROR] ${e.message}`);
    errors.push(e.message);
  }
  
  await browser.close();
  
  // Compute MD5s
  console.log('\n=== Screenshot MD5s ===');
  const screenshots = [
    'webkit-touch-game.png',
    'webkit-touch-after-tap.png',
    'webkit-touch-after-swipe.png',
    'webkit-touch-floor2.png',
    'webkit-touch-floor3.png',
    'webkit-touch-floor4.png'
  ];
  
  const md5s: Record<string, string> = {};
  for (const file of screenshots) {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file);
      const hash = crypto.createHash('md5').update(data).digest('hex');
      md5s[file] = hash;
      console.log(`${file}: ${hash}`);
    } else {
      console.log(`${file}: MISSING`);
    }
  }
  
  // Check uniqueness
  const hashes = Object.values(md5s);
  const uniqueHashes = new Set(hashes);
  console.log(`\nUnique screenshots: ${uniqueHashes.size}/${hashes.length}`);
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Page errors: ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log(`  - ${e}`));
  }
  console.log(`Missing images: ${missingImages.length}`);
  if (missingImages.length > 0) {
    missingImages.forEach(e => console.log(`  - ${e}`));
  }
  
  if (errors.length === 0 && consoleErrors.length === 0 && missingImages.length === 0 && uniqueHashes.size === hashes.length) {
    console.log('\n✓ All tests PASSED');
    process.exit(0);
  } else {
    console.log('\n✗ Tests FAILED');
    process.exit(1);
  }
}

testWebKitTouch().catch(console.error);
