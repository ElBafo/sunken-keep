import { chromium, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:5173/sunken-keep/';

async function test() {
  console.log('Starting visual test in Chrome...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security']
  });
  
  const context = await browser.newContext({
    ...devices['iPhone 15'],
    viewport: { width: 390, height: 844 },
    hasTouch: true
  });
  
  const page = await context.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('SvelteKit') && !text.includes('DevTools')) {
      console.log('→', text);
    }
  });
  
  // Listen for errors
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
  });
  
  console.log('\n1. Loading title screen...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Wait for all assets to load
  await page.waitForFunction(() => {
    const logs = (window as any).__consoleLogs || [];
    return logs.some((log: string) => log.includes('All assets loaded'));
  }, { timeout: 10000 }).catch(() => {
    console.log('Assets may still be loading...');
  });
  
  console.log('\n2. Tapping New Game...');
  // Tap on "New Game" button (center of screen, lower third)
  await page.touchscreen.tap(195, 450);
  await page.waitForTimeout(1000);
  
  // Check if game started by looking for "New game started" in console
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));
  
  await page.waitForTimeout(2000);
  
  const gameStarted = logs.some(log => log.includes('New game started'));
  
  if (gameStarted) {
    console.log('✓ Game started on first tap (audio unlock + button action)');
  } else {
    console.log('✗ Game did not start immediately');
    console.log('Console logs:', logs.slice(-5).join('\n  '));
  }
  
  await page.waitForTimeout(1000);
  
  console.log('\n3. Taking screenshots...');
  
  // Screenshot floor 1
  const ss1Path = '/workspace/screenshot-floor1-view.png';
  await page.screenshot({ path: ss1Path });
  console.log(`Saved: ${ss1Path}`);
  
  // Navigate to floor 2
  console.log('\n4. Loading floor 2...');
  await page.goto(`${BASE_URL}?floor=2`);
  await page.waitForTimeout(3000);
  const ss2Path = '/workspace/screenshot-floor2-view.png';
  await page.screenshot({ path: ss2Path });
  console.log(`Saved: ${ss2Path}`);
  
  // Navigate to floor 3
  console.log('\n5. Loading floor 3...');
  await page.goto(`${BASE_URL}?floor=3`);
  await page.waitForTimeout(3000);
  const ss3Path = '/workspace/screenshot-floor3-view.png';
  await page.screenshot({ path: ss3Path });
  console.log(`Saved: ${ss3Path}`);
  
  // Navigate to floor 4
  console.log('\n6. Loading floor 4...');
  await page.goto(`${BASE_URL}?floor=4`);
  await page.waitForTimeout(3000);
  const ss4Path = '/workspace/screenshot-floor4-view.png';
  await page.screenshot({ path: ss4Path });
  console.log(`Saved: ${ss4Path}`);
  
  // Compute MD5 hashes
  console.log('\n7. Computing MD5 hashes...');
  const files = [ss1Path, ss2Path, ss3Path, ss4Path];
  for (const file of files) {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file);
      const hash = crypto.createHash('md5').update(data).digest('hex');
      console.log(`${path.basename(file)}: ${hash}`);
    }
  }
  
  await browser.close();
  console.log('\nTest complete!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
