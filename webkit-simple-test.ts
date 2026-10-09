import { webkit, devices } from 'playwright';

async function testWebKitSimple() {
  const iPhone15 = devices['iPhone 15 Pro'];
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone15,
  });
  const page = await context.newPage();

  const errors: string[] = [];

  // Capture console
  page.on('console', (msg) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    console.log('[PAGE ERROR]', error.message);
    console.log('[STACK]', error.stack);
    errors.push(`${error.message}`);
  });

  // Navigate
  console.log('Navigating...');
  try {
    await page.goto('http://localhost:5173/sunken-keep/', { 
      waitUntil: 'load',
      timeout: 15000 
    });
    console.log('Page loaded');
  } catch (e: any) {
    console.error('Navigation failed:', e.message);
  }

  // Wait a bit
  await page.waitForTimeout(3000);

  // Screenshot
  await page.screenshot({ path: 'webkit-simple-test.png' });
  console.log('Screenshot saved');

  await browser.close();

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  ${e}`));
    process.exit(1);
  }
  
  console.log('\n✓ No errors');
  process.exit(0);
}

testWebKitSimple().catch(console.error);
