import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { chromium, webkit, devices } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_OUT || join(__dirname, '..', 'screenshots', 'iphone-fixes', 'shots');
const BASE = process.env.BASE_URL || 'http://localhost:4173/sunken-keep';
const engine = process.env.BROWSER === 'chromium' ? chromium : webkit;

mkdirSync(OUT, { recursive: true });

const iphone = devices['iPhone 15'];
const browser = await engine.launch();
const context = await browser.newContext({
  ...iphone,
  viewport: iphone.viewport
});
const page = await context.newPage();
const errors = [];
const failed404s = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('response', (res) => {
  if (res.status() === 404) failed404s.push(res.url());
});

await page.goto(`${BASE}/proto3d.html?test=1&debug=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__proto3d?.ready === true, null, { timeout: 30000 });
await page.locator('#tap-to-start').click();
await page.waitForTimeout(400);

async function shot(x, y, dir, file) {
  await page.evaluate(([px, py, pd]) => window.__proto3d.setPosition(px, py, pd), [x, y, dir]);
  await page.waitForTimeout(350);
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  const md5 = createHash('md5').update(readFileSync(path)).digest('hex');
  console.log(`SHOT ${file} md5=${md5}`);
}

// 1. Leeches vs key from the start
await shot(1, 7, 0, '01-leech-vs-key-start.png');
await shot(2, 6, 0, '01-leech-vs-key-ahead.png');

// 2. Items on own square + one square away (floor 1)
await shot(2, 5, 0, '02-key-own-square.png');
await shot(2, 6, 0, '02-key-one-square.png');
await shot(6, 3, 3, '02-potion-red-own-square.png');
await shot(6, 2, 2, '02-potion-red-one-square.png');
await shot(5, 5, 1, '02-potion-blue-own-square.png');
await shot(4, 5, 1, '02-potion-blue-one-square.png');
await shot(6, 5, 1, '02-chest-own-square.png');
await shot(5, 5, 1, '02-chest-one-square.png');
await shot(7, 7, 0, '02-potion-green-own-square.png');
await shot(7, 6, 2, '02-potion-green-one-square.png');

// 3. Corridor after locked door (open it first)
await page.evaluate(() => {
  window.__proto3d.giveKey();
  window.__proto3d.setPosition(3, 2, 1);
  window.__proto3d.snapDoor(4, 2, true);
});
await page.waitForTimeout(200);
await shot(4, 2, 1, '03-corridor-on-door-east.png');
await shot(4, 2, 0, '03-corridor-on-door-north.png');
await shot(4, 2, 2, '03-corridor-on-door-south.png');
await shot(5, 2, 1, '03-corridor-east-of-door-east.png');
await shot(5, 2, 3, '03-corridor-east-of-door-west.png');
await shot(5, 2, 0, '03-corridor-east-of-door-north.png');
await shot(5, 2, 2, '03-corridor-east-of-door-south.png');
await shot(6, 2, 1, '03-corridor-toward-slime-east.png');
await shot(6, 2, 3, '03-corridor-toward-slime-west.png');
await shot(6, 2, 0, '03-corridor-toward-slime-north.png');
await shot(6, 2, 2, '03-corridor-toward-slime-south.png');

// 4. Water hall
await shot(1, 4, 0, '04-water-hall-from-south.png');
await shot(1, 2, 1, '04-water-hall-looking-east.png');
await shot(3, 4, 0, '04-water-hall-deep-lane.png');
await shot(2, 4, 0, '04-water-hall-on-shallow-facing-deep.png');
await shot(3, 3, 3, '04-water-hall-leeches.png');

// 5. Door approach 3 / 2 / 1 squares (closed)
await page.evaluate(() => window.__proto3d.snapDoor(4, 2, false));
await shot(1, 2, 1, '05-door-3-squares.png');
await shot(2, 2, 1, '05-door-2-squares.png');
await shot(3, 2, 1, '05-door-1-square.png');

writeFileSync(join(OUT, 'console.json'), JSON.stringify({ errors, failed404s }, null, 2));
console.log('errors', errors);
console.log('404s', failed404s);

await browser.close();
if (errors.length || failed404s.length) process.exit(2);
