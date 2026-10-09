import { chromium } from 'playwright';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 270, height: 585 } });
  
  try {
    await page.goto('http://localhost:5173/sunken-keep/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Screenshot 1: TAP TO START
    await page.screenshot({ path: '/workspace/screenshot-tap-to-start.png' });
    console.log('✓ Screenshot 1: TAP TO START');
    
    // Click to start
    await page.click('text=TAP TO START');
    await page.waitForTimeout(1500);
    
    // Screenshot 2: Game view with UI
    await page.screenshot({ path: '/workspace/screenshot-game-ui.png' });
    console.log('✓ Screenshot 2: Game UI with hand buttons');
    
    // Test floor 2
    await page.goto('http://localhost:5173/sunken-keep/?floor=2', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/workspace/screenshot-floor-2.png' });
    console.log('✓ Screenshot 3: Floor 2');
    
    // Test floor 3
    await page.goto('http://localhost:5173/sunken-keep/?floor=3', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/workspace/screenshot-floor-3.png' });
    console.log('✓ Screenshot 4: Floor 3');
    
    // Test floor 4
    await page.goto('http://localhost:5173/sunken-keep/?floor=4', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('text=TAP TO START');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/workspace/screenshot-floor-4.png' });
    console.log('✓ Screenshot 5: Floor 4');
    
    // Test tap (click a hand button)
    await page.click('canvas', { position: { x: 29, y: 425 } });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/screenshot-after-tap.png' });
    console.log('✓ Screenshot 6: After hand button tap');
    
    // Test swipe (turn)
    await page.mouse.move(50, 300);
    await page.mouse.down();
    await page.mouse.move(220, 300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/screenshot-after-swipe.png' });
    console.log('✓ Screenshot 7: After swipe turn');
    
    console.log('\n✓ All screenshots captured');
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
