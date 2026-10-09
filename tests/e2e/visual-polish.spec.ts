import { test, expect } from '@playwright/test';

test.describe('Visual polish verification', () => {
  test('capture screenshots and measure FPS', async ({ page }) => {
    await page.goto('/sunken-keep/');
    await page.waitForSelector('canvas#game');
    
    // Start game
    await page.click('#tap-to-start');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // Measure FPS over 3 seconds
    const fpsData = await page.evaluate(() => {
      return new Promise<{ fps: number; frameCount: number }>((resolve) => {
        let frameCount = 0;
        const startTime = performance.now();
        const duration = 3000; // 3 seconds
        
        function countFrame() {
          frameCount++;
          if (performance.now() - startTime < duration) {
            requestAnimationFrame(countFrame);
          } else {
            const elapsed = (performance.now() - startTime) / 1000;
            resolve({ fps: frameCount / elapsed, frameCount });
          }
        }
        
        requestAnimationFrame(countFrame);
      });
    });
    
    console.log(`FPS: ${fpsData.fps.toFixed(2)} (${fpsData.frameCount} frames in 3s)`);
    
    // Position 1: Start position with lit carving sconce
    await page.screenshot({ 
      path: 'screenshots/visual-start-lit-carving.png',
      fullPage: false 
    });
    
    // Navigate to locked door
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('q'); // Turn left to face west
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('q'); // Turn left to face south
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    
    // Position 2: Locked door with lit sconce
    await page.screenshot({ 
      path: 'screenshots/visual-locked-door-lit.png',
      fullPage: false 
    });
    
    // Go to flooded hall with dead sconce
    await page.keyboard.press('q'); // Turn left to face east
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    
    // Position 3: Flooded hall with deep water
    await page.screenshot({ 
      path: 'screenshots/visual-flooded-hall.png',
      fullPage: false 
    });
    
    // Navigate to dead sconce corridor
    await page.keyboard.press('e'); // Turn right to face south
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    
    // Position 4: Dead sconce corridor
    await page.screenshot({ 
      path: 'screenshots/visual-dead-sconce.png',
      fullPage: false 
    });
    
    // Verify FPS is at least 30
    expect(fpsData.fps).toBeGreaterThan(30);
  });
});
