import { webkit, devices } from 'playwright';

async function testSimple() {
  const iPhone15 = devices['iPhone 15 Pro'];
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...iPhone15 });
  const page = await context.newPage();
  
  const errors: string[] = [];
  
  page.on('console', (msg) => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => {
    console.log(`[ERROR] ${error.message}`);
    errors.push(error.message);
  });
  
  try {
    // Test without ?floor parameter
    console.log('Testing without ?floor parameter...');
    await page.goto('http://localhost:5173/sunken-keep/', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'webkit-no-floor.png' });
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length === 0) {
      console.log('✓ Test passed');
      process.exit(0);
    } else {
      console.log('✗ Test failed');
      errors.forEach(e => console.log(`  ${e}`));
      process.exit(1);
    }
  } catch (e: any) {
    console.error('Failed:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testSimple().catch(console.error);
