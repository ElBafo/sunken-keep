import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  tryMoveForward: () => { result: string; after: { x: number; y: number } };
  useHand: (id: string, hand: 'main' | 'off') => boolean;
  inCombat: () => boolean;
  combatHeroes: () => Array<{ id: string; hp: number; maxHp: number; downed: boolean; level: number; xp: number }>;
  combatMonsters: () => Array<{ id: string; kind: string; x: number; y: number; hp: number; alive: boolean; windup: string | null }>;
  pendingPerks: () => Array<{ hero: string; level: number }>;
  perkHooks: () => Array<{ hero: string; level: number }>;
  perkScreenOpen: () => boolean;
  heroVoices: () => boolean;
  lastHeroVoice: () => string | null;
  forceWipe: () => void;
  restartFloor: () => void;
  lastHitType: () => string | null;
  playingLoops: () => { count: number; kinds: string[] };
  playHitFx: (id: string, kind: 'resist' | 'weak' | 'crit' | 'hit') => void;
  hitFxPlaying: () => Array<{ hostId: string; frames: number }>;
  addXp: (n: number) => void;
  finishFight: () => void;
  forceWindup: () => boolean;
  gameOverVisible: () => boolean;
  setHeroHp: (id: string, hp: number) => void;
  logLines: () => string[];
  lastMessage: () => string;
};

test.use(devices['iPhone 15']);

test('proto3d combat: block square, first swing, voices, perks, game over', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const failed404s: string[] = [];
  const isHostAudioNoise = (text: string) =>
    /failed to start the audio device|autoaudiosink|gstreamer element/i.test(text);
  page.on('pageerror', (err) => {
    if (!isHostAudioNoise(err.message)) errors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isHostAudioNoise(msg.text())) errors.push(msg.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) failed404s.push(response.url());
  });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { __proto3d?: Proto3d }).__proto3d;
      return (p?.playingLoops().count ?? 0) >= 10;
    },
    null,
    { timeout: 15000 }
  );
  const freshLoops = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.playingLoops()
  );

  const voicesOn = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.heroVoices());
  expect(voicesOn, 'HERO_VOICES is the single on-switch').toBe(true);
  expect(await page.locator('#perk-screen').count(), 'no perk screen in the document').toBe(0);

  const slimeBump = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d & { sprites?: () => Array<{ kind: string; x: number; y: number; visible: boolean; monsterKind?: string }> } }).__proto3d;
    p.setPosition(6, 2, 1);
    const moved = p.tryMoveForward();
    const sprites = p.sprites?.() ?? [];
    return {
      result: moved.result,
      after: moved.after,
      fighting: p.inCombat(),
      slime: p.combatMonsters().find((m) => m.kind === 'slime'),
      slimeSprite: sprites.find((s) => s.kind === 'monster' && s.x === 7 && s.y === 2)
    };
  });
  expect(slimeBump.result, 'slime square is blocked').toBe('monster');
  expect(slimeBump.after).toMatchObject({ x: 6, y: 2 });
  expect(slimeBump.fighting, 'bump starts the fight').toBe(true);
  expect(slimeBump.slime?.alive).toBe(true);
  expect(slimeBump.slime?.x).toBe(7);
  expect(slimeBump.slime?.y).toBe(2);
  expect(slimeBump.slimeSprite?.visible, 'slime is lit and visible one square ahead').toBe(true);

  const resistShot = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.useHand('brannoc', 'main');
    const slime = p.combatMonsters().find((m) => m.kind === 'slime');
    if (slime) p.playHitFx(slime.id, 'resist');
    return { hit: p.lastHitType(), fx: p.hitFxPlaying() };
  });
  expect(resistShot.fx.length, 'resist goo plays on the slime').toBeGreaterThan(0);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${OUT}/combat-slime-resist.png`, fullPage: false });

  const frostShot = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.useHand('ilsevar', 'main');
    const slime = p.combatMonsters().find((m) => m.kind === 'slime');
    if (slime) p.playHitFx(slime.id, 'weak');
    return { hit: p.lastHitType(), fx: p.hitFxPlaying() };
  });
  expect(frostShot.fx.length, 'weak frost plays on the slime').toBeGreaterThan(0);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${OUT}/combat-slime-frost.png`, fullPage: false });

  const startHp = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.combatHeroes().reduce((s, h) => s + h.hp, 0)
  );
  await page.waitForTimeout(350);
  const stillEarly = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return p.logLines().some((l) => /hits|dodges/i.test(l));
  });
  expect(stillEarly, 'first monster swing waits ~0.5s').toBe(false);
  await page.screenshot({ path: `${OUT}/combat-slime-fight.png`, fullPage: false });
  await page.waitForTimeout(280);
  const afterSwing = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      hp: p.combatHeroes().reduce((s, h) => s + h.hp, 0),
      logs: p.logLines()
    };
  });
  expect(
    afterSwing.logs.some((l) => /hits|dodges/i.test(l)) || afterSwing.hp < startHp,
    'first swing lands after ~0.5s'
  ).toBe(true);

  const hands = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const axe = p.useHand('brannoc', 'main');
    const back = p.useHand('wren', 'main');
    return { axe, back, logs: p.logLines(), msg: p.lastMessage() };
  });
  expect(hands.axe, 'front-row axe is usable').toBe(true);
  expect(hands.back, 'back-row melee is denied').toBe(false);
  expect(hands.logs.some((l) => /can't reach|out of reach|reach/i.test(l) || /Can't reach/i.test(hands.msg))).toBe(
    true
  );

  const perk = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.addXp(220);
    return {
      pending: p.pendingPerks(),
      hooks: p.perkHooks(),
      screen: p.perkScreenOpen(),
      fighting: p.inCombat(),
      overlay: !!document.getElementById('perk-screen')
    };
  });
  expect(perk.fighting, 'level-up mid-fight keeps the fight open').toBe(true);
  expect(perk.pending.length, 'perk is only flagged pending').toBeGreaterThan(0);
  expect(perk.hooks.length, 'perk hook is not released mid-fight').toBe(0);
  expect(perk.screen, 'no perk screen mid-fight').toBe(false);
  expect(perk.overlay, 'no perk overlay node').toBe(false);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.finishFight());
  const afterFight = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { hooks: p.perkHooks(), screen: p.perkScreenOpen(), fighting: p.inCombat() };
  });
  expect(afterFight.fighting).toBe(false);
  expect(afterFight.hooks.length, 'perk hook fires only after the fight').toBeGreaterThan(0);
  expect(afterFight.screen, 'hook still does not open a screen').toBe(false);

  const crab = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(5, 2, 2);
    const moved = p.tryMoveForward();
    const wind = p.forceWindup();
    return { result: moved.result, fighting: p.inCombat(), wind, monsters: p.combatMonsters() };
  });
  expect(crab.result).toBe('monster');
  expect(crab.fighting).toBe(true);
  expect(crab.wind || crab.monsters.some((m) => m.windup === 'pinch'), 'crab wind-up on the 3rd swing').toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/combat-crab-windup.png`, fullPage: false });

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setHeroHp('wren', 0);
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/combat-hero-downed.png`, fullPage: false });
  const downed = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return p.combatHeroes().find((h) => h.id === 'wren');
  });
  expect(downed?.downed || downed?.hp === 0).toBe(true);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.forceWipe());
  await page.waitForTimeout(200);
  await expect(page.locator('#gameover')).toHaveClass(/show/);
  await expect(page.locator('#gameover-body')).toContainText(/keep/i);
  await expect(page.locator('#btn-go-floor')).toHaveText(/Floor 1/);
  await expect(page.locator('#btn-go-autosave')).toBeHidden();
  await page.screenshot({ path: `${OUT}/combat-game-over.png`, fullPage: false });

  await page.locator('#btn-go-floor').tap();
  await page.waitForTimeout(200);
  const restarted = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      overlay: p.gameOverVisible(),
      heroes: p.combatHeroes(),
      fighting: p.inCombat()
    };
  });
  expect(restarted.overlay, 'restart hides game over').toBe(false);
  expect(restarted.fighting).toBe(false);
  expect(restarted.heroes.every((h) => h.hp === h.maxHp && !h.downed), 'party is restored').toBe(true);
  const restartedLoops = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.playingLoops()
  );
  expect(restartedLoops.count, `restart loops ${restartedLoops.kinds} vs fresh ${freshLoops.kinds}`).toBe(
    freshLoops.count
  );

  const rat = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(9, 1, 1);
    const moved = p.tryMoveForward();
    p.useHand('brannoc', 'main');
    return { result: moved.result, fighting: p.inCombat(), logs: p.logLines() };
  });
  expect(rat.result, 'rat square is blocked').toBe('monster');
  expect(rat.fighting).toBe(true);
  expect(rat.logs.some((l) => /hit|miss|crit|Can't reach|hits/i.test(l))).toBe(true);

  expect(errors, 'page/console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
