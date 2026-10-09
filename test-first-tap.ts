import { chromium, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/sunken-keep/';

async function testFirstTap() {
  console.log('Testing first tap interaction...\n');
  
  const browser = await chromium.launch({ headless: true }); // headless for CI
  
  const context = await browser.newContext({
    ...devices['iPhone 15'],
    viewport: { width: 390, height: 844 },
    hasTouch: true
  });
  
  const page = await context.newPage();
  
  // Capture all console messages
  const logs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('→', text);
  });
  
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
  });
  
  console.log('Loading title screen...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // Wait for assets
  
  console.log('\nClicking New Game button at (135, 457) in canvas coordinates...');
  console.log('(Button should be at x=65-205, y=442-472)\n');
  
  // Get canvas bounding rect
  const canvasRect = await page.evaluate(() => {
    const canvas = document.querySelector('#game') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  });
  
  console.log('Canvas rect:', canvasRect);
  
  // Calculate device coordinates for canvas center of New Game button
  // Button is at canvas coords [65, 442, 140, 30], so center is (135, 457)
  // Canvas is 270×585 logical pixels
  const canvasScale = canvasRect.width / 270;
  const buttonCenterX = 135 * canvasScale + canvasRect.left;
  const buttonCenterY = 457 * canvasScale + canvasRect.top;
  
  console.log(`Tapping at device coords (${buttonCenterX.toFixed(1)}, ${buttonCenterY.toFixed(1)})...\n`);
  
  await page.touchscreen.tap(buttonCenterX, buttonCenterY);
  await page.waitForTimeout(2000);
  
  // Check if game started
  const newGameStarted = logs.some(log => log.includes('New game started'));
  const audioUnlocked = logs.some(log => log.includes('Audio unlocked'));
  
  console.log('\n--- RESULTS ---');
  console.log('Audio unlocked:', audioUnlocked ? '✓' : '✗');
  console.log('New game started:', newGameStarted ? '✓' : '✗');
  
  if (!newGameStarted) {
    console.log('\n⚠️  First tap did not start game - investigating...');
    
    // Check if title screen rendered
    const titleRendered = logs.some(log => 
      log.includes('title') || log.includes('Title')
    );
    console.log('Title screen logs found:', titleRendered);
    
    // Try a second tap
    console.log('\nTrying second tap...');
    await page.touchscreen.tap(buttonCenterX, buttonCenterY);
    await page.waitForTimeout(1000);
    
    const secondTapWorked = logs.some(log => log.includes('New game started'));
    console.log('Second tap worked:', secondTapWorked ? '✓' : '✗');
  }
  
  console.log('\nWaiting 5 seconds before closing (view the browser)...');
  await page.waitForTimeout(5000);
  
  await browser.close();
}

testFirstTap().catch(console.error);
