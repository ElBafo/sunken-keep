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
    sconces: Array<{ x: number; y: number; face?: string; lit: boolean; empty: boolean }>;
    monsters: Array<{ kind: string; alive: boolean; hp: number }>;
    flags: string[];
    firedOnce?: string[];
    goals?: Record<string, string>;
    carried?: { hero: string; hand: string; lit: boolean } | null;
  };
  fireOnce: (id: string) => boolean;
  firedOnce: () => string[];
  goals: () => Record<string, string>;
  setGoal: (id: string, status: string) => void;
  loopNames: () => string[];
  setHand: (id: string, hand: string, item: string) => void;
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
  persistCalled: () => boolean;
  killKind: (kind: string) => boolean;
  carriedTorch: () => { hero: string; hand: string; lit: boolean } | null;
};

test.use(devices['iPhone 15']);

async function keepSavesAcrossReload(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('proto3d-keep-saves')) localStorage.clear();
  });
}

async function rememberSaves(page: import('@playwright/test').Page) {
  await page.evaluate(() => sessionStorage.setItem('proto3d-keep-saves', '1'));
}

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

async function saveReloadLoad(page: import('@playwright/test').Page, slot = 2) {
  await rememberSaves(page);
  await page.evaluate((n) => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.saveToSlot(n);
  }, slot);
  await page.reload();
  await bootPlay(page, 'test=1&persist=1&debug=1');
  await page.evaluate((n) => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.loadFromSlot(n);
  }, slot);
  await page.waitForTimeout(400);
}

async function mapState(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.mapState());
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

    await keepSavesAcrossReload(page);
    await page.goto(`${BASE_URL}/proto3d.html?debug=1`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await expect(page.locator('#title-hint')).toContainText(/Always play from the Home Screen/i);
    const persist = await page.evaluate(() => ({
      available: typeof navigator.storage?.persist === 'function',
      called: (window as unknown as { __proto3d: Proto3d }).__proto3d.persistCalled()
    }));
    if (persist.available) expect(persist.called).toBe(true);
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
      p.killKind('slime');
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      (p as unknown as { finishFight?: () => void }).finishFight?.();
      p.setPosition(1, 7, 0);
      p.saveToSlot(1);
    });
    await rememberSaves(page);

    await page.locator('#btn-save').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await page.screenshot({ path: `${OUT}/load-slots.png`, fullPage: false });
    await page.locator('.title-hit[data-id="slot-1"]').tap();
    await expect(page.locator('.title-hit[data-id="Overwrite"]')).toBeVisible();
    await page.screenshot({ path: `${OUT}/overwrite-confirm.png`, fullPage: false });
    await page.locator('.title-hit[data-id="Overwrite"]').tap();

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
      return {
        msg: p.lastMessage(),
        ui: p.lastUi(),
        logs: p.logLines(),
        combat: p.inCombat(),
        title: p.titleVisible()
      };
    });
    expect(blocked.combat).toBe(true);
    expect(blocked.title).toBe(false);
    expect(
      blocked.logs.some((l) => /No time to save|Τρέξε/.test(l)) || /No time to save|Τρέξε/.test(blocked.msg)
    ).toBe(true);
    expect(blocked.ui.some((n) => /denied/.test(n))).toBe(true);
    await page.screenshot({ path: `${OUT}/save-blocked-combat.png`, fullPage: false });

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      (p as unknown as { finishFight?: () => void }).finishFight?.();
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

  test('map state survives a reload after each Levie-list mutation', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await bootPlay(page, 'test=1&persist=1&debug=1');

    const aliveKinds = async () =>
      (await mapState(page)).monsters.filter((m) => m.alive).map((m) => m.kind).sort();
    const startAlive = await aliveKinds();
    const startOil = (await mapState(page)).oil;

    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.openDoor(4, 2));
    await saveReloadLoad(page);
    expect((await mapState(page)).doors.find((d) => d.x === 4 && d.y === 2)?.open).toBe(true);
    expect(await aliveKinds()).toEqual(startAlive);

    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.openSecret(5, 1));
    await saveReloadLoad(page);
    const afterSecret = await mapState(page);
    expect(afterSecret.secrets.find((s) => s.x === 5 && s.y === 1)?.open).toBe(true);
    expect(afterSecret.doors.find((d) => d.x === 4 && d.y === 2)?.open).toBe(true);
    expect(afterSecret.flags).toEqual(expect.arrayContaining(['secret_found']));

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(1, 6, 3);
      p.snuffFacing();
    });
    await saveReloadLoad(page);
    const afterSnuff = await mapState(page);
    const snuffed = afterSnuff.sconces.find((s) => s.x === 0 && s.y === 6);
    expect(snuffed?.lit).toBe(false);
    expect(snuffed?.empty).toBe(false);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setHand('brannoc', 'off', 'empty_hand');
      p.setPosition(6, 5, 0);
      p.takeFacingTorch();
    });
    await saveReloadLoad(page);
    const afterTake = await mapState(page);
    const emptied = afterTake.sconces.find((s) => s.x === 6 && s.y === 4);
    expect(emptied?.lit).toBe(false);
    expect(emptied?.empty).toBe(true);
    expect(afterTake.carried?.lit || afterTake.bag.some((s) => s.item === 'torch_lit')).toBeTruthy();
    expect(snuffed && afterTake.sconces.find((s) => s.x === 0 && s.y === 6)?.lit).toBe(false);

    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.killKind('keep_rat'));
    await saveReloadLoad(page);
    const afterKill = await mapState(page);
    expect(afterKill.monsters.filter((m) => m.kind === 'keep_rat').some((m) => !m.alive)).toBe(true);
    expect(afterKill.monsters.filter((m) => m.kind === 'keep_rat' && m.alive).length).toBeLessThan(
      startAlive.filter((k) => k === 'keep_rat').length
    );
    expect(afterKill.monsters.find((m) => m.kind === 'slime')?.alive).toBe(true);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.fillChest(5, 7, ['potion_red']);
      p.setPosition(5, 6, 2);
      p.pickupFacing();
    });
    await saveReloadLoad(page);
    const afterChest = await mapState(page);
    expect(afterChest.chests.find((c) => c.x === 5 && c.y === 7)?.open).toBe(true);
    expect(afterChest.chests.find((c) => c.x === 5 && c.y === 7)?.loot ?? []).toEqual([]);
    expect(afterChest.bag.some((s) => s.item === 'potion_red')).toBe(true);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(6, 6, 0);
      p.pickupHere();
    });
    await saveReloadLoad(page);
    const afterItem = await mapState(page);
    expect(afterItem.items.find((i) => i.x === 6 && i.y === 6)?.item ?? null).toBeNull();
    expect(afterItem.bag.some((s) => s.item === 'oil_flask')).toBe(true);

    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setOil(3));
    await saveReloadLoad(page);
    const afterOil = await mapState(page);
    expect(afterOil.oil).toBe(3);
    expect(afterOil.oil).not.toBe(startOil);

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.addFlag('note_lampkeeper');
      p.fireOnce('door_locked');
      p.fireOnce('guard_hall_enter');
      p.fireOnce('note_lampkeeper');
      p.setGoal('g_f1_door', 'active');
      p.setGoal('g_why', 'active');
    });
    const beforeOnce = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { fired: p.firedOnce(), goals: p.goals(), loops: p.loopNames() };
    });
    await saveReloadLoad(page);
    const afterOnce = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return {
        fired: p.firedOnce(),
        goals: p.goals(),
        loops: p.loopNames(),
        againDoor: p.fireOnce('door_locked'),
        againBark: p.fireOnce('guard_hall_enter'),
        againNote: p.fireOnce('note_lampkeeper')
      };
    });
    expect(afterOnce.fired).toEqual(expect.arrayContaining(['door_locked', 'guard_hall_enter', 'note_lampkeeper']));
    expect(afterOnce.goals.g_f1_door).toBe('active');
    expect(afterOnce.goals.g_why).toBe('active');
    expect(afterOnce.againDoor).toBe(false);
    expect(afterOnce.againBark).toBe(false);
    expect(afterOnce.againNote).toBe(false);
    expect(afterOnce.loops.filter((n) => n.startsWith('torch:0,6')).length).toBe(0);
    expect(afterOnce.loops.sort()).toEqual(beforeOnce.loops.sort());
    const afterFlags = await mapState(page);
    expect(afterFlags.flags).toEqual(expect.arrayContaining(['secret_found', 'note_lampkeeper']));
    expect(afterFlags.doors.find((d) => d.x === 4 && d.y === 2)?.open).toBe(true);
    expect(afterFlags.secrets.find((s) => s.x === 5 && s.y === 1)?.open).toBe(true);
    expect(afterFlags.chests.find((c) => c.x === 5 && c.y === 7)?.open).toBe(true);
    expect(afterFlags.items.find((i) => i.x === 6 && i.y === 6)?.item ?? null).toBeNull();
    expect(afterFlags.sconces.find((s) => s.x === 0 && s.y === 6)?.lit).toBe(false);
    expect(afterFlags.sconces.find((s) => s.x === 6 && s.y === 4)?.empty).toBe(true);
    expect(afterFlags.monsters.filter((m) => m.kind === 'keep_rat').some((m) => !m.alive)).toBe(true);
    expect(afterFlags.oil).toBe(3);
  });
});
