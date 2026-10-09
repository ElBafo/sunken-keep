import { test, expect } from '@playwright/test';

test.describe('iPhone Safari rendering', () => {
  test('game loads and fills full viewport after intro', async ({ page }) => {
    await page.goto('/sunken-keep/');
    
    // Wait for game to load
    await page.waitForSelector('canvas#game', { timeout: 10000 });
    
    // Take screenshot of tap-to-start screen
    await page.screenshot({ path: 'screenshots/iphone-tap-to-start.png', fullPage: false });
    
    // Tap to start
    await page.click('#tap-to-start');
    
    // Wait a moment for intro to start
    await page.waitForTimeout(1000);
    
    // Take screenshot during intro
    await page.screenshot({ path: 'screenshots/iphone-intro.png', fullPage: false });
    
    // Skip intro (tap or press space)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Now we should be in gameplay
    await page.waitForTimeout(1000);
    
    // Take screenshot of full game UI
    await page.screenshot({ path: 'screenshots/iphone-gameplay-full.png', fullPage: false });
    
    // Verify canvas is visible and properly sized
    const canvas = await page.$('canvas#game');
    expect(canvas).not.toBeNull();
    
    const canvasBox = await canvas!.boundingBox();
    expect(canvasBox).not.toBeNull();
    
    // Canvas should be visible and have reasonable dimensions
    expect(canvasBox!.width).toBeGreaterThan(200);
    expect(canvasBox!.height).toBeGreaterThan(400);
    
    console.log(`Canvas dimensions: ${canvasBox!.width}x${canvasBox!.height}`);
  });
  
  test('control panel is visible and interactive', async ({ page }) => {
    await page.goto('/sunken-keep/');
    await page.waitForSelector('canvas#game');
    
    // Start game and skip intro
    await page.click('#tap-to-start');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // Take screenshot showing control panel
    await page.screenshot({ path: 'screenshots/iphone-control-panel.png', fullPage: false });
    
    // Move around to verify controls work
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'screenshots/iphone-after-move.png', fullPage: false });
    
    // Turn left
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'screenshots/iphone-after-turn.png', fullPage: false });
  });
  
  test('left and right walls are correctly positioned', async ({ page }) => {
    await page.goto('/sunken-keep/');
    await page.waitForSelector('canvas#game');
    
    // Start game and skip intro
    await page.click('#tap-to-start');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // At start position (1,7) facing north
    // Wall should be on left (column 0), open on right (column 2)
    await page.screenshot({ path: 'screenshots/iphone-start-position.png', fullPage: false });
    
    // Turn to face the wall on the left
    await page.keyboard.press('q'); // Turn left (west)
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'screenshots/iphone-facing-west.png', fullPage: false });
    
    // Turn right twice to face east
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'screenshots/iphone-facing-east.png', fullPage: false });
  });
});
