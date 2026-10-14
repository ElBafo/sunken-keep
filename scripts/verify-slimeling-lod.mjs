import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
});
const context = await browser.newContext({
  ...devices['iPhone 15'],
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

async function boot() {
  await page.goto(`${BASE}/proto3d.html?test=1&debug=1&persist=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__proto3d?.ready === true, null, { timeout: 30000 });
  await page.locator('#tap-to-start').tap();
  await page.waitForFunction(() => window.__proto3d?.combatAwake?.() === true, { timeout: 15000 });
  await page.waitForFunction(
    () => window.__proto3d?.combatMonsters?.().some((m) => m.kind === 'slime'),
    null,
    { timeout: 20000 }
  );
}

await boot();

const reveal = await page.evaluate(() => {
  const p = window.__proto3d;
  p.snapDoor?.(19, 5, true);
  p.setPosition(19, 3, 2);
  const far = {
    trigger: p.lastBarkTrigger?.() ?? null,
    visible: p.sprites().filter((s) => s.monsterKind === 'slime' && s.visible && !s.hidden && !s.disposed).length
  };
  p.setPosition(19, 6, 2);
  const near = {
    trigger: p.lastBarkTrigger?.() ?? null,
    visible: p.sprites().filter((s) => s.monsterKind === 'slime' && s.visible && !s.hidden && !s.disposed).length,
    message: p.lastMessage?.() ?? ''
  };
  return { far, near };
});
console.log('REVEAL', JSON.stringify(reveal));
if (reveal.far.trigger === 'slime_reveal') throw new Error('slime_reveal fired on eyes-only view');
if (reveal.far.visible !== 0) throw new Error('slime body drawn in the dark at 4 squares');
if (reveal.near.trigger !== 'slime_reveal') throw new Error('slime_reveal did not fire when the body drew at (19,6)');

const split = await page.evaluate(async () => {
  const proto = window.__proto3d;
  const slime = proto.combatMonsters().find((m) => m.kind === 'slime' && m.alive);
  if (!slime) return { ok: false };
  proto.setMonsterHp(slime.id, Math.floor(slime.hp / 2));
  await proto.whenMonstersSynced();
  proto.setPosition(slime.x, slime.y - 1, 2);
  const sprites = proto.sprites().filter((s) => s.kind === 'monster' && s.x === slime.x && s.y === slime.y);
  return {
    ok: true,
    parentId: slime.id,
    kids: proto.combatMonsters().filter((m) => m.kind === 'slime_small' && m.alive),
    sprites,
    parent: proto.sprites().filter((s) => s.monsterId === slime.id),
    eyes: proto.darkFx().eyes.filter((e) => e.monster === 'slime_small')
  };
});
console.log('SPLIT', JSON.stringify(split, null, 2));
if (!split.ok || split.kids.length !== 2) throw new Error(`split failed: ${JSON.stringify(split)}`);
const slimelings = split.sprites.filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
if (slimelings.length !== 2) throw new Error(`expected 2 slimelings, got ${slimelings.length}`);
const liveParent = split.parent.filter((s) => !s.disposed && s.visible && !s.hidden);
if (liveParent.length) throw new Error(`live parent leftover: ${JSON.stringify(split.parent)}`);
if (split.eyes.length !== 2) throw new Error(`expected 2 slimeling eye pairs, got ${split.eyes.length}`);

const lodExpect = { 1: 'close', 2: 'near', 3: 'mid', 4: 'far' };
for (const dist of [1, 2, 3, 4]) {
  const info = await page.evaluate((n) => {
    const proto = window.__proto3d;
    const kid = proto.combatMonsters().find((m) => m.kind === 'slime_small' && m.alive);
    proto.setPosition(kid.x, kid.y - n, 2);
    const sprites = proto.sprites().filter((s) => s.monsterKind === 'slime_small' && !s.disposed);
    const liveSlime = proto
      .sprites()
      .filter((s) => s.monsterKind === 'slime' && s.visible && !s.hidden && !s.disposed);
    return {
      count: sprites.length,
      visible: sprites.filter((s) => s.visible && !s.hidden).length,
      lods: sprites.map((s) => s.lod),
      liveSlime: liveSlime.length,
      ids: sprites.map((s) => s.monsterId)
    };
  }, dist);
  console.log(`DIST ${dist}`, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/slimeling-lod-${dist}.png` });
  if (info.count !== 2) throw new Error(`expected 2 slimeling sprites at ${dist}, got ${info.count}`);
  if (info.liveSlime) throw new Error(`visible slime-7 leftover at ${dist}`);
  if (dist === 1 && info.visible !== 2) throw new Error(`adjacent slimelings should draw, got ${info.visible}`);
  if (dist > 1 && info.visible !== 0) throw new Error(`unlit slimelings drew at ${dist}: ${info.visible}`);
  if (dist > 1 && info.lods.some((l) => l !== lodExpect[dist])) {
    throw new Error(`expected ${lodExpect[dist]} at ${dist}, got ${info.lods}`);
  }
}

const rat = await page.evaluate(() => {
  const proto = window.__proto3d;
  proto.setPosition(10, 3, 0);
  const sprite = proto
    .sprites()
    .find((s) => s.monsterId === 'keep_rat-1' || (s.monsterKind === 'keep_rat' && s.x === 10 && s.y === 1));
  return {
    visible: !!(sprite && sprite.visible && !sprite.hidden && !sprite.disposed),
    id: sprite?.monsterId ?? null
  };
});
console.log('RAT', JSON.stringify(rat));
await page.screenshot({ path: `${OUT}/keep-rat-from-10-3.png` });
if (rat.visible) throw new Error('keep_rat-1 was drawn from (10,3)');

if (errors.length) console.log('PAGE_ERRORS', errors);
console.log('OK');
await browser.close();
