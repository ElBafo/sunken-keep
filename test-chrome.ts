import { chromium } from 'playwright';

async function testChrome() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[ERROR] ${msg.text()}`);
      errors.push(msg.text());
    } else {
      console.log(`[log] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', (error) => {
    console.log(`[PAGE ERROR] ${error.message}`);
    console.log(error.stack);
    errors.push(error.message);
  });
  
  try {
    await page.goto('http://localhost:5173/sunken-keep/?debug=1', { waitUntil: 'networkidle' });
    console.log('Page loaded');
    
    // Wait and click TAP TO START
    await page.waitForTimeout(1000);
    await page.click('text=TAP TO START');
    await page.waitForTimeout(1000);
    
    // Screenshot
    await page.screenshot({ path: 'chrome-test.png' });
    console.log('Screenshot saved: chrome-test.png');
    
    // Check canvas
    const canvasCheck = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas' };
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No 2d context' };
      
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
    
    console.log(`Canvas: ${canvasCheck.width}x${canvasCheck.height}, ${canvasCheck.colorCount} colors`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length === 0 && canvasCheck.colorCount > 3) {
      console.log('✓ Chrome test passed');
      process.exit(0);
    } else {
      console.log('✗ Chrome test failed');
      process.exit(1);
    }
    
  } catch (e: any) {
    console.error('Test failed:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testChrome().catch(console.error);
