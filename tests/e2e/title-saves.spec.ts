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
  bubbleText: () => string;
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
  setLocale?: (locale: string) => Promise<void>;
  setEscapeRun: (on: boolean) => void;
  persistCalled: () => boolean;
  killKind: (kind: string) => boolean;
  carriedTorch: () => { hero: string; hand: string; lit: boolean } | null;
  frostHint: () => { armed: boolean; dismissed: boolean };
  armFrostHint: () => void;
  dismissFrostHint: () => void;
  playStarted: () => boolean;
  menuPlaying: () => boolean;
  gameOverPlaying: () => boolean;
  playingLoopNames: () => string[];
  handleDoor: (x: number, y: number) => void;
  floorSnapshotGoals: () => Record<string, string>;
  startNewGame: () => void;
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
    await page.goto(`${BASE_URL}/proto3d.html`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    await expect(page.locator('#fps-counter')).toHaveCount(0);
    const chrome = await page.evaluate(() => {
      const stage = document.getElementById('game-stage');
      return {
        titleInside: !!stage?.contains(document.getElementById('title-overlay')),
        introInside: !!stage?.contains(document.getElementById('intro-overlay')),
        bubbleInside: !!stage?.contains(document.getElementById('speech-bubble'))
      };
    });
    expect(chrome.titleInside, 'title/load screens live in the 270×585 stage').toBe(true);
    expect(chrome.introInside).toBe(true);
    expect(chrome.bubbleInside, 'speech bubble lives in the 270×585 stage').toBe(true);
    await expect(page.locator('#title-hint')).toContainText(/Add to Home Screen first/i);
    await expect(page.locator('#title-hint')).toContainText(/Safari can lose saves/i);
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
    await expect(page.locator('#title-hint')).toContainText(/Αφετηρίας|Home Screen/);
    const locale = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.locale());
    expect(locale).toBe('el');
    await page.locator('#title-toast').evaluate((el) => el.classList.remove('show'));
    await page.waitForTimeout(100);
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
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameOverVisible())).toBe(
      false
    );
    expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameOverPlaying())).toBe(
      false
    );
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.forceWipe());
    await page.waitForTimeout(150);
    await page.locator('#btn-go-floor').tap();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameOverPlaying())).toBe(
      false
    );
    const floorRestored = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { over: p.gameOverVisible(), pos: p.getPosition(), logs: p.logLines() };
    });
    expect(floorRestored.over).toBe(false);
    expect(floorRestored.pos).toMatchObject({ x: 1, y: 7 });
    expect(floorRestored.logs.some((l) => /water takes you|βράχ/i.test(l))).toBe(false);

    await bootPlay(page, 'test=1&persist=1');
    await expect(page.locator('#fps-counter')).toHaveCount(0);
    const freshLog = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.logLines());
    expect(freshLog.some((l) => /water takes you/i.test(l))).toBe(false);
    await page.screenshot({ path: `${OUT}/log-after-restart.png`, fullPage: false });
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.speakBark('secret_wall', 'wren'));
    await page.waitForTimeout(100);
    const bark = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { logs: p.logLines(), bubble: p.bubbleVisible(), bubbleText: p.bubbleText() };
    });
    expect(bark.logs.some((l) => /Wren:/.test(l))).toBe(true);
    expect(bark.bubble).toBe(true);
    expect(bark.bubbleText).toMatch(/^Wren:/);
    await page.screenshot({ path: `${OUT}/speech-bubble.png`, fullPage: false });

    await page.evaluate(async () => {
      const p = (window as unknown as { __proto3d: Proto3d & { setLocale?: (l: string) => Promise<void> } }).__proto3d;
      await p.setLocale?.('el');
      p.speakBark('secret_wall', 'brannoc');
    });
    await page.waitForTimeout(150);
    const barkEl = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return p.bubbleText();
    });
    expect(barkEl).toMatch(/^Μπράννοκ:/);
    expect(barkEl).not.toMatch(/brannoc/i);
    await page.screenshot({ path: `${OUT}/speech-bubble-el.png`, fullPage: false });

    expect(errors, 'page errors').toEqual([]);
  });

  test('old save version shows wet-slot copy, not a blank slot', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await page.goto(`${BASE_URL}/proto3d.html`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await rememberSaves(page);
    await page.evaluate(() => {
      localStorage.setItem(
        'proto3d.save.v1.slot.2',
        JSON.stringify({ version: 1, party: [], monsters: [], position: { x: 1, y: 7, dir: 0 } })
      );
    });
    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await page.locator('.title-hit[data-id="Load"]').tap();
    await page.waitForTimeout(250);
    const slot = page.locator('#title-canvas');
    await expect(page.locator('#title-overlay')).toHaveClass(/show/);
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById('title-canvas') as HTMLCanvasElement | null;
      return !!canvas;
    });
    expect(painted).toBe(true);
    await page.screenshot({ path: `${OUT}/corrupt-slot.png`, fullPage: false });
    await page.locator('.title-hit[data-id="slot-2"]').tap();
    await expect(page.locator('#title-toast')).toContainText(/got wet|βράχηκε/i);
    void slot;
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
      p.fireOnce('guard_hall_enter');
      p.fireOnce('water_shallow');
      p.fireOnce('journal_page_1');
      p.fireOnce('door_locked');
      p.fireOnce('door_unlocked');
    });
    const beforeOnce = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { fired: p.firedOnce(), goals: p.goals(), loops: p.loopNames() };
    });
    expect(beforeOnce.fired).toEqual(
      expect.arrayContaining(['enter_floor1', 'guard_hall_enter', 'water_shallow', 'journal_page_1', 'door_unlocked'])
    );
    expect(beforeOnce.fired).not.toContain('door_locked');
    expect(beforeOnce.goals.g_why).toBe('active');
    expect(beforeOnce.goals.g_f1_down).toBe('active');
    expect(beforeOnce.goals.g_f1_door).toBe('done');
    await saveReloadLoad(page);
    const afterOnce = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return {
        fired: p.firedOnce(),
        goals: p.goals(),
        loops: p.loopNames(),
        againBark: p.fireOnce('guard_hall_enter'),
        againLog: p.fireOnce('water_shallow'),
        againNote: p.fireOnce('journal_page_1'),
        againUnlock: p.fireOnce('door_unlocked'),
        againEvery: p.fireOnce('door_locked')
      };
    });
    expect(afterOnce.fired).toEqual(
      expect.arrayContaining(['enter_floor1', 'guard_hall_enter', 'water_shallow', 'journal_page_1', 'door_unlocked'])
    );
    expect(afterOnce.goals.g_why).toBe('active');
    expect(afterOnce.goals.g_f1_down).toBe('active');
    expect(afterOnce.goals.g_f1_door).toBe('done');
    expect(afterOnce.againBark).toBe(false);
    expect(afterOnce.againLog).toBe(false);
    expect(afterOnce.againNote).toBe(false);
    expect(afterOnce.againUnlock).toBe(false);
    expect(afterOnce.againEvery).toBe(true);
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

  test('frost hint dismissed survives reload and resets on New Game', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await bootPlay(page, 'test=1&persist=1&debug=1');
    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.dismissFrostHint();
    });
    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.frostHint().dismissed)
    ).toBe(true);
    await saveReloadLoad(page);
    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.frostHint().dismissed)
    ).toBe(true);
    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.startNewGame();
      p.skipIntro();
    });
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.frostHint().dismissed)
    ).toBe(false);
  });

  test('title music never starts after play and Continue goes to act1', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await page.goto(`${BASE_URL}/proto3d.html`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await page.locator('.title-hit[data-id="New Game"]').tap();
    await page.waitForTimeout(150);
    if (await page.locator('#intro-overlay').evaluate((el) => el.classList.contains('show'))) {
      await page.locator('#intro-overlay').tap();
    }
    await page.waitForTimeout(1600);
    const afterNew = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { started: p.playStarted(), menu: p.menuPlaying(), loops: p.playingLoopNames() };
    });
    expect(afterNew.started).toBe(true);
    expect(afterNew.menu).toBe(false);
    expect(afterNew.loops).not.toContain('menu');

    await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.saveToSlot(1);
    });
    await rememberSaves(page);
    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(2200);
    await page.locator('.title-hit[data-id="Continue"]').tap();
    await page.waitForTimeout(1200);
    const afterContinue = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { started: p.playStarted(), menu: p.menuPlaying(), loops: p.playingLoopNames() };
    });
    expect(afterContinue.started).toBe(true);
    expect(afterContinue.menu).toBe(false);
    expect(afterContinue.loops).not.toContain('menu');
  });

  test('unlocking the locked door completes g_f1_door', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await bootPlay(page, 'test=1&persist=1&debug=1');
    const unlocked = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(5, 2, 3);
      p.giveItem('key');
      p.fireOnce('door_locked');
      p.handleDoor(4, 2);
      return { fired: p.firedOnce(), goals: p.goals() };
    });
    expect(unlocked.fired).toEqual(expect.arrayContaining(['door_unlocked']));
    expect(unlocked.goals.g_f1_door).toBe('done');
  });

  test('start-of-floor snapshot keeps arrival goals after Floor 1 restart', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await bootPlay(page, 'test=1&persist=1&debug=1');
    const snap = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return p.floorSnapshotGoals();
    });
    expect(snap.g_why).toBe('active');
    expect(snap.g_tam).toBe('active');
    expect(snap.g_f1_down).toBe('active');
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.forceWipe());
    await page.waitForTimeout(200);
    await page.locator('#btn-go-floor').tap();
    await page.waitForTimeout(250);
    const restored = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      return { over: p.gameOverVisible(), goals: p.goals(), gameOver: p.gameOverPlaying() };
    });
    expect(restored.over).toBe(false);
    expect(restored.goals.g_why).toBe('active');
    expect(restored.goals.g_tam).toBe('active');
    expect(restored.goals.g_f1_down).toBe('active');
    expect(restored.gameOver).toBe(false);
  });

  test('non-JSON slot is wet and needs overwrite confirm', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await keepSavesAcrossReload(page);
    await page.goto(`${BASE_URL}/proto3d.html`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await rememberSaves(page);
    await page.evaluate(() => {
      localStorage.setItem('proto3d.save.v1.slot.3', 'not-json{{{');
    });
    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 30000 }
    );
    await page.locator('.title-hit[data-id="Load"]').tap();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/corrupt-nonjson-slot.png`, fullPage: false });
    await page.locator('.title-hit[data-id="slot-3"]').tap();
    await expect(page.locator('#title-toast')).toContainText(/got wet|βράχηκε/i);

    await bootPlay(page, 'test=1&persist=1&debug=1');
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.requestManualSave());
    await page.waitForTimeout(200);
    await page.locator('.title-hit[data-id="slot-3"]').tap();
    await expect(page.locator('.title-hit[data-id="Overwrite"]')).toBeVisible();
    await page.screenshot({ path: `${OUT}/corrupt-overwrite-confirm.png`, fullPage: false });
  });
});
