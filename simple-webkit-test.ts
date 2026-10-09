import { webkit } from 'playwright';

async function simpleWebKitTest() {
  console.log('Launching WebKit...');
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 15 Pro dimensions
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();
  
  console.log('Setting up error handler...');
  page.on('console', msg => console.log(`[${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
  page.on('crash', () => console.log('[CRASH] Page crashed'));
  
  console.log('Loading page...');
  try {
    await page.goto('http://localhost:5173/sunken-keep/', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    console.log('Page loaded successfully');
    
    await page.waitForTimeout(5000);
    console.log('Waiting complete');
    
    const title = await page.title();
    console.log('Title:', title);
    
    await page.screenshot({ path: '/workspace/webkit-simple-test.png' });
    console.log('Screenshot saved');
    
    await browser.close();
    console.log('✓ Test passed');
  } catch (e: any) {
    console.error('✗ Test failed:', e.message);
    await page.screenshot({ path: '/workspace/webkit-error.png' }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

simpleWebKitTest();
