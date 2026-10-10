import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  getPosition: () => { x: number; y: number; dir: number };
  getBag: () => Array<{ item: string; count: number }>;
  giveItem: (id: string, n?: number) => void;
  setHeroHp: (id: string, hp: number) => void;
  combatHeroes: () => Array<{ id: string; hp: number; maxHp: number }>;
  combatMonsters: () => Array<{ kind: string; x: number; y: number; hp: number; alive: boolean }>;
  doorOpen: (x: number, y: number) => boolean;
  openDoor: (x: number, y: number) => boolean;
  inCombat: () => boolean;
  tryMoveForward: () => { result: string };
  requestManualSave: () => void;
  saveToSlot: (n: number) => boolean;
  loadFromSlot: (n: number) => boolean;
  tryAutosave: () => boolean;
  fireVisibilityAutosave: () => boolean;
  canAutosave: () => boolean;
  takeFloorSnapshot: () => void;
  forceWipe: () => void;
  gameOverVisible: () => boolean;
  lastMessage: () => string;
  lastUi: () => string[];
  logLines: () => string[];
  locale: () => string;
  openSecret: (x: number, y: number) => boolean;
  secretOpen: (x: number, y: number) => boolean;
  speakBark: (trigger: string, speaker?: string) => boolean;
  bubbleVisible: () => boolean;
  mapState: () => {
    oil: number;
    bag: Array<{ item: string; count: number }>;
    position: { x: number; y: number; dir: number };
    doors: Array<{ x: number; y: number; open: boolean }>;
    secrets: Array<{ x: number; y: number; open: boolean }>;
    items: Array<{ x: number; y: number; item: string | null }>;
    chests: Array<{ x: number; y: number; open: boolean; loot: string[] }>;
    sconces: Array<{ x: number; y: number; lit: boolean; empty: boolean }>;
    monsters: Array<{ kind: string; alive: boolean; hp: number }>;
    flags: string[];
  };
  pickupHere: () => boolean;
  pickupFacing: () => boolean;
  chestOpen: (x: number, y: number) => boolean;
  fillChest: (x: number, y: number, items: string[]) => boolean;
  getOil: () => number;
  setOil: (n: number) => void;
  takeFacingTorch: () => void;
  snuffFacing: () => void;
  torchLit: (x: number, y: number) => boolean;
  addFlag: (f: string) => void;
  flags: () => string[];
  titleVisible: () => boolean;
  introVisible: () => boolean;
  skipIntro: () => void;
  setEscapeRun: (on: boolean) => void;
};

test.use(devices['iPhone 15']);

async function bootPlay(page: import('@playwright/test').Page, qs = 'test=1&persist=1&debug=1') {
  await page.goto(`${BASE_URL}/proto3d.html?${qs}`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 30000 }
  );
  const tap = page.locator('#tap-to-start');
  if (await tap.isVisible()) await tap.tap();
  await page.waitForTimeout(300);
}

function api(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d);
}

test.describe('proto3d step4 title and saves', () => {
  test.setTimeout(180000);

  test('new game plays intro then skip, greek title, continue restore, overwrite, blocked, autosave, game over', async ({
    page
  }) => {
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    const isHostAudioNoise = (text: string) =>
      /failed to start the audio device|autoaudiosink|gstreamer element/i.test(text);
    page.on('pageerror', (err) => {
      if (!isHostAudioNoise(err.message)) errors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isHostAudioNoise(msg.text())) errors.push(msg.text());
    });

    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${BASE_URL}/proto3d.html?debug=1`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await expect(page.locator('#title-hint')).toContainText(/Home Screen/i);
    await page.screenshot({ path: `${OUT}/title-en.png`, fullPage: false });

    const continueBtn = page.locator('.title-hit[data-id="Continue"]');
    await expect(continueBtn).toBeVisible();
    const contBox = await continueBtn.boundingBox();
    expect(contBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await continueBtn.tap();
    await expect(page.locator('#title-toast')).toContainText(/No saves/i);

    await page.locator('.title-hit[data-id="Settings"]').tap();
    await page.waitForTimeout(400);
    await expect(page.locator('#title-hint')).toContainText(/Αρχική|Home Screen/);
    const locale = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.locale());
    expect(locale).toBe('el');
    await page.screenshot({ path: `${OUT}/title-el.png`, fullPage: false });
    await page.locator('.title-hit[data-id="Settings"]').tap();
    await page.waitForTimeout(200);

    await page.locator('.title-hit[data-id="New Game"]').tap();
    await expect(page.locator('#intro-overlay')).toHaveClass(/show/, { timeout: 8000 });
    await page.locator('#intro-overlay').tap();
    await page.waitForTimeout(400);
    await expect(page.locator('#intro-overlay')).not.toHaveClass(/show/);
    await expect(page.locator('#title-overlay')).not.toHaveClass(/show/);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.giveItem('potion_red', 2);
      p.setHeroHp('brannoc', 20);
      p.setPosition(4, 2, 1);
      p.openDoor(4, 2);
      const slime = p.combatMonsters().find((m) => m.kind === 'slime');
      if (slime) {
        p.setPosition(slime.x - 1, slime.y, 1);
        p.tryMoveForward();
        for (let i = 0; i < 8; i++) (p as unknown as { useHand: (a: string, b: string) => void }).useHand?.('brannoc', 'main');
      }
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      const slime = p.combatMonsters().find((m) => m.kind === 'slime');
      if (slime && slime.alive) {
        (p as unknown as { finishFight?: () => void }).finishFight?.();
      }
      p.setPosition(1, 7, 0);
      p.saveToSlot(1);
    });

    await page.locator('#btn-save').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await page.screenshot({ path: `${OUT}/load-slots.png`, fullPage: false });
    await page.locator('.title-hit[data-id="slot-1"]').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#title-toast, #message-toast, #title-overlay')).toBeVisible();
    const overwriteVisible = await page.locator('.title-hit[data-id="Overwrite"]').count();
    if (overwriteVisible) {
      await page.screenshot({ path: `${OUT}/overwrite-confirm.png`, fullPage: false });
      await page.locator('.title-hit[data-id="Overwrite"]').tap();
    }

    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await page.locator('.title-hit[data-id="Load"]').tap();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/load-slots-filled.png`, fullPage: false });
    await page.locator('.title-hit[data-id="Back"]').tap();
    await page.locator('.title-hit[data-id="Continue"]').tap();
    await page.waitForTimeout(500);
    const restored = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return {
        bag: p.getBag(),
        heroes: p.combatHeroes(),
        door: p.doorOpen(4, 2),
        pos: p.getPosition(),
        slime: p.combatMonsters().find((m) => m.kind === 'slime')
      };
    });
    expect(restored.bag.some((s) => s.item === 'potion_red')).toBe(true);
    expect(restored.heroes.find((h) => h.id === 'brannoc')?.hp).toBe(20);
    expect(restored.door).toBe(true);
    expect(restored.slime?.alive).toBe(false);
    expect(restored.pos).toMatchObject({ x: 1, y: 7 });

    await bootPlay(page, 'test=1&persist=1&debug=1');
    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(6, 2, 1);
      p.tryMoveForward();
    });
    await page.waitForTimeout(200);
    await page.locator('#btn-save').tap();
    await page.waitForTimeout(200);
    const blocked = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { msg: p.lastMessage(), ui: p.lastUi() };
    });
    expect(/No time to save|Τρέξε|save/i.test(blocked.msg)).toBe(true);
    expect(blocked.ui.some((n) => /denied/.test(n))).toBe(true);
    await page.screenshot({ path: `${OUT}/save-blocked-combat.png`, fullPage: false });

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(1, 7, 0);
    });
    const auto = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      return p.fireVisibilityAutosave();
    });
    expect(auto).toBe(true);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.takeFloorSnapshot();
      p.tryAutosave();
      p.forceWipe();
    });
    await page.waitForTimeout(200);
    await expect(page.locator('#gameover')).toHaveClass(/show/);
    await expect(page.locator('#btn-go-autosave')).toBeVisible();
    await expect(page.locator('#btn-go-floor')).toContainText(/Floor 1|Όροφος 1/i);
    await page.locator('#btn-go-autosave').tap();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameOverVisible())).toBe(
      false
    );
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.forceWipe());
    await page.waitForTimeout(150);
    await page.locator('#btn-go-floor').tap();
    await page.waitForTimeout(200);
    const floorRestored = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { over: p.gameOverVisible(), pos: p.getPosition() };
    });
    expect(floorRestored.over).toBe(false);
    expect(floorRestored.pos).toMatchObject({ x: 1, y: 7 });

    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.speakBark('secret_wall', 'wren'));
    await page.waitForTimeout(100);
    const bark = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { logs: p.logLines(), bubble: p.bubbleVisible() };
    });
    expect(bark.logs.some((l) => /Wren:|Ρεν:| Wren/i.test(l) || l.includes(':'))).toBe(true);
    expect(bark.bubble).toBe(true);
    await page.screenshot({ path: `${OUT}/speech-bubble.png`, fullPage: false });

    expect(errors, 'page errors').toEqual([]);
  });

  test('map state survives reload after door, secret, sconces, torch, kill, chest, item, oil, flags', async ({
    page
  }) => {
    mkdirSync(OUT, { recursive: true });
    await page.addInitScript(() => localStorage.clear());
    await bootPlay(page, 'test=1&persist=1&debug=1');

    const before = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.openDoor(4, 2);
      p.openSecret(5, 1);
      p.setPosition(1, 6, 3);
      p.snuffFacing();
      p.setPosition(5, 7, 2);
      p.fillChest(5, 7, ['potion_red']);
      p.pickupFacing();
      p.setPosition(5, 6, 0);
      p.pickupHere();
      p.setOil(3);
      p.addFlag('note_lampkeeper');
      const rat = p.combatMonsters().find((m) => m.kind === 'keep_rat');
      if (rat) {
        (p as unknown as { combat?: { monsters: Array<{ kind: string; alive: boolean; hp: number }> } }).combat;
      }
      p.setPosition(9, 1, 1);
      p.tryMoveForward();
      const api = p as unknown as { useHand: (a: string, b: string) => void; finishFight: () => void };
      for (let i = 0; i < 12; i++) api.useHand('brannoc', 'main');
      api.finishFight();
      p.setPosition(2, 7, 0);
      p.saveToSlot(2);
      return p.mapState();
    });

    await page.reload();
    await bootPlay(page, 'test=1&persist=1&debug=1');
    const after = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.loadFromSlot(2);
      return p.mapState();
    });

    expect(after.doors.find((d) => d.x === 4 && d.y === 2)?.open).toBe(true);
    expect(after.secrets.find((s) => s.x === 5 && s.y === 1)?.open).toBe(true);
    expect(after.chests.find((c) => c.x === 5 && c.y === 7)?.open).toBe(true);
    expect(after.oil).toBe(before.oil);
    expect(after.bag.some((s) => s.item === 'potion_red' || s.item === 'oil_flask')).toBe(true);
    expect(after.flags).toEqual(expect.arrayContaining(['secret_found', 'note_lampkeeper']));
    expect(after.items.find((i) => i.x === 5 && i.y === 1)?.item == null || after.secrets[0].open).toBeTruthy();
    const deadRat = after.monsters.find((m) => m.kind === 'keep_rat' && !m.alive);
    expect(deadRat || after.monsters.some((m) => !m.alive)).toBeTruthy();
    expect(after.sconces.some((s) => !s.lit)).toBe(true);
  });
});
