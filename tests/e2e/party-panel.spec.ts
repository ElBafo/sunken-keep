import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  interact: () => void;
  setHeroHp: (id: string, hp: number) => void;
  setHand: (id: string, hand: 'main' | 'off', item: string) => void;
  getHands: () => Array<{ id: string; main: string; off: string; hp: number; maxHp: number }>;
  useHand: (id: string, hand: 'main' | 'off') => boolean;
  handTapCount: () => number;
  lastHand: () => { hero: string; hand: string } | null;
  lastMessage: () => string;
  torchLit: (x: number, y: number) => boolean;
  torchChoiceVisible: () => boolean;
  layout: () => {
    view: number[];
    panelTop: number;
    oilBar: number[];
    log: number[];
    heroes: Array<{ name: string; hand_main: number[]; hand_off: number[] }>;
  };
  takeFacingTorch: () => void;
  snuffFacing: () => void;
  carriedTorch: () => { hero: string; hand: string; lit: boolean } | null;
  hasCarriedTorchLight: () => boolean;
  sourceLight: (x: number, y: number) => number;
  tryMoveForward: () => { result: string; after: { x: number; y: number; dir: number } };
  getOil: () => number;
  setOil: (n: number) => void;
  getBag: () => Array<{ item: string; count: number; from?: { hero: string; hand: string } }>;
  swapArmed: () => boolean;
  swapHighlightCount: () => number;
  lastUi: () => string[];
  lanternLoop: () => { mode: string; playing: boolean };
};

test.use(devices['iPhone 15']);

test('proto3d party panel: portraits, hands, take/snuff, dunk, 44pt targets', async ({ page }) => {
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
  await page.waitForTimeout(400);

  const hud = page.locator('#party-hud');
  const view = page.locator('#render-canvas');
  const arrows = page.locator('#controls');
  await expect(hud).toBeVisible();
  await expect(view).toBeVisible();
  await expect(arrows).toBeVisible();

  const boxes = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return {
      view: box(document.getElementById('render-canvas')),
      hud: box(document.getElementById('party-hud')),
      controls: box(document.getElementById('controls'))
    };
  });
  expect(boxes.view, '3D view present').toBeTruthy();
  expect(boxes.hud, 'party panel present').toBeTruthy();
  expect(boxes.controls, 'arrows present').toBeTruthy();
  expect(boxes.hud!.top, 'panel sits below the view').toBeGreaterThanOrEqual(boxes.view!.bottom - 1);
  expect(boxes.controls!.top, 'arrows sit below the panel').toBeGreaterThanOrEqual(boxes.hud!.bottom - 1);

  const handBoxes = await page.locator('.hand-btn').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, hero: (el as HTMLElement).dataset.hero, hand: (el as HTMLElement).dataset.hand };
    })
  );
  expect(handBoxes.length, 'eight hand buttons').toBe(8);
  for (const hand of handBoxes) {
    expect(hand.w, `${hand.hero} ${hand.hand} width >= 44pt`).toBeGreaterThanOrEqual(44);
    expect(hand.h, `${hand.hero} ${hand.hand} height >= 44pt`).toBeGreaterThanOrEqual(44);
  }

  const layout = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.layout());
  expect(layout.oilBar, 'oil row from layout585.json').toEqual([70, 442, 65, 4]);
  expect(layout.log, '3-line log from layout585.json').toEqual([4, 479, 262, 28]);
  expect(layout.view, '3D view from layout585.json').toEqual([0, 0, 270, 380]);
  expect(layout.panelTop).toBe(380);
  for (const hero of layout.heroes) {
    expect(hero.hand_main[1], `${hero.name} main hand y`).toBe(447);
    expect(hero.hand_off[1], `${hero.name} off hand y`).toBe(447);
    expect(hero.hand_main.slice(2), `${hero.name} main hand size`).toEqual([31, 31]);
    expect(hero.hand_off.slice(2), `${hero.name} off hand size`).toEqual([31, 31]);
    expect(hero.hand_main[1] + hero.hand_main[3], `${hero.name} main hand ends at 478`).toBe(478);
  }

  await page.screenshot({ path: `${OUT}/party-panel-full.png`, fullPage: false });

  const beforeHp = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getHands());
  expect(beforeHp.find((h) => h.id === 'brannoc')?.hp).toBe(45);
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setHeroHp('brannoc', 10));
  const wounded = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getHands());
  expect(wounded.find((h) => h.id === 'brannoc')?.hp).toBe(10);
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setHeroHp('brannoc', 5));
  const near = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getHands());
  expect(near.find((h) => h.id === 'brannoc')?.hp).toBe(5);

  const tapsBefore = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.handTapCount());
  await page.locator('.hand-btn[data-hero="brannoc"][data-hand="main"]').tap();
  await page.waitForTimeout(80);
  const tapsAfter = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.handTapCount());
  expect(tapsAfter, 'hand tap fires once').toBe(tapsBefore + 1);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastHand())).toMatchObject({
    hero: 'brannoc',
    hand: 'main'
  });

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.interact();
  });
  await expect(page.locator('#torch-choice')).toHaveClass(/show/);
  const take = page.locator('#btn-torch-take');
  const snuff = page.locator('#btn-torch-snuff');
  await expect(take).toBeVisible();
  await expect(snuff).toBeVisible();
  const choiceSize = await take.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = (el.nextElementSibling as HTMLElement)?.getBoundingClientRect();
    return { take: { w: r.width, h: r.height }, snuff: s ? { w: s.width, h: s.height } : null };
  });
  expect(choiceSize.take.w, 'Take width >= 44pt').toBeGreaterThanOrEqual(44);
  expect(choiceSize.take.h, 'Take height >= 44pt').toBeGreaterThanOrEqual(44);
  expect(choiceSize.snuff!.w, 'Snuff width >= 44pt').toBeGreaterThanOrEqual(44);
  expect(choiceSize.snuff!.h, 'Snuff height >= 44pt').toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${OUT}/party-panel-take-snuff.png`, fullPage: false });

  const handsAtStart = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.getHands()
  );
  expect(
    handsAtStart.every((h) => h.main !== 'empty_hand' && h.off !== 'empty_hand'),
    'every starting hand is full'
  ).toBe(true);

  await take.tap();
  await page.waitForTimeout(80);
  const armed = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      armed: p.swapArmed(),
      highlights: p.swapHighlightCount(),
      lit: p.torchLit(0, 6),
      carried: p.carriedTorch(),
      choice: p.torchChoiceVisible(),
      msg: p.lastMessage()
    };
  });
  expect(armed.choice, 'choice closes after Take with full hands').toBe(false);
  expect(armed.lit, 'wall torch stays until a hand is chosen').toBe(true);
  expect(armed.carried, 'no torch taken yet').toBeNull();
  expect(armed.armed, 'swap mode armed').toBe(true);
  expect(armed.highlights, 'seven hands highlighted; lantern excluded').toBe(7);
  expect(
    await page.locator('.hand-btn[data-hero="wren"][data-hand="off"]').evaluate((el) =>
      el.classList.contains('swap-armed')
    ),
    "Wren's lantern hand is not highlighted"
  ).toBe(false);
  expect(armed.msg.toLowerCase(), 'hands-full prompt').toMatch(/no free hand|tap a hand to swap/);
  await page.screenshot({ path: `${OUT}/party-panel-swap-armed.png`, fullPage: false });

  await page.waitForTimeout(3200);
  const timedOut = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { armed: p.swapArmed(), highlights: p.swapHighlightCount() };
  });
  expect(timedOut.armed, 'swap disarms after 3s').toBe(false);
  expect(timedOut.highlights, 'hand highlight clears after 3s').toBe(0);

  const tapsAfterTimeout = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.handTapCount()
  );
  await page.locator('.hand-btn[data-hero="brannoc"][data-hand="main"]').tap();
  await page.waitForTimeout(80);
  const usedAfterTimeout = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      taps: p.handTapCount(),
      last: p.lastHand(),
      carried: p.carriedTorch(),
      lit: p.torchLit(0, 6)
    };
  });
  expect(usedAfterTimeout.taps, 'after 3s a hand tap uses the hand').toBe(tapsAfterTimeout + 1);
  expect(usedAfterTimeout.last).toMatchObject({ hero: 'brannoc', hand: 'main' });
  expect(usedAfterTimeout.carried, 'timeout tap does not swap').toBeNull();
  expect(usedAfterTimeout.lit, 'wall torch still there after timeout').toBe(true);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interact());
  await expect(page.locator('#torch-choice')).toHaveClass(/show/);
  await take.tap();
  await page.waitForTimeout(80);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.swapArmed()),
    'swap re-arms'
  ).toBe(true);
  const moved = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const step = p.tryMoveForward();
    return {
      step,
      armed: p.swapArmed(),
      highlights: p.swapHighlightCount(),
      carried: p.carriedTorch(),
      lit: p.torchLit(0, 6)
    };
  });
  expect(moved.armed, 'moving disarms swap').toBe(false);
  expect(moved.highlights, 'move clears hand highlight').toBe(0);
  expect(moved.carried, 'move does not complete a swap').toBeNull();
  expect(moved.lit, 'wall torch still there after move-disarm').toBe(true);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 3);
    p.interact();
  });
  await expect(page.locator('#torch-choice')).toHaveClass(/show/);
  await take.tap();
  await page.waitForTimeout(80);
  const tapsBeforeWren = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.handTapCount()
  );
  await page.locator('.hand-btn[data-hero="wren"][data-hand="main"]').tap();
  await page.waitForTimeout(120);
  const wrenSwap = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const wren = p.getHands().find((h) => h.id === 'wren');
    return {
      hands: p.getHands(),
      wren,
      bag: p.getBag(),
      taps: p.handTapCount(),
      last: p.lastHand(),
      lit: p.torchLit(0, 6),
      carried: p.carriedTorch(),
      pool: p.hasCarriedTorchLight(),
      source: p.sourceLight(1, 6),
      armed: p.swapArmed(),
      highlights: p.swapHighlightCount(),
      msg: p.lastMessage(),
      ui: p.lastUi(),
      lantern: p.lanternLoop()
    };
  });
  expect(wrenSwap.taps, 'swap tap must not use the hand').toBe(tapsBeforeWren);
  expect(wrenSwap.last, 'swap tap does not record a hand use').toMatchObject({
    hero: 'brannoc',
    hand: 'main'
  });
  expect(wrenSwap.lit, 'Wren take removes the wall torch').toBe(false);
  expect(wrenSwap.carried, 'back-row Wren can carry the torch').toMatchObject({
    hero: 'wren',
    hand: 'main',
    lit: true
  });
  expect(wrenSwap.wren?.main, 'torch replaces Wren mace').toBe('torch_lit');
  expect(wrenSwap.wren?.off, 'Wren lantern stays in hand').toBe('prayer_lantern');
  expect(wrenSwap.bag, 'Wren mace stowed in the bag').toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        item: 'mace',
        count: 1,
        from: { hero: 'wren', hand: 'main' }
      })
    ])
  );
  expect(wrenSwap.bag.find((s) => s.item === 'prayer_lantern' || s.item === 'prayer_lantern_ember')).toBeUndefined();
  expect(wrenSwap.pool, 'back-row torch still lights the party square').toBe(true);
  expect(wrenSwap.source, 'party square has a torch pool').toBeGreaterThan(0.2);
  expect(wrenSwap.lantern.mode, 'lantern loop keeps running').toBe('oil');
  expect(wrenSwap.armed, 'swap ends after the hand is chosen').toBe(false);
  expect(wrenSwap.highlights).toBe(0);
  expect(wrenSwap.msg.toLowerCase(), 'take log line').toMatch(/takes the torch/);
  const takeAt = wrenSwap.ui.lastIndexOf('torch_take');
  const moveAt = wrenSwap.ui.lastIndexOf('ui_inventory_move');
  expect(takeAt, 'swap plays torch_take').toBeGreaterThanOrEqual(0);
  expect(moveAt, 'swap then plays inventory_move').toBeGreaterThan(takeAt);
  await page.screenshot({ path: `${OUT}/party-panel-carried-torch.png`, fullPage: false });

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interact());
  await page.waitForTimeout(80);
  const placed = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const wren = p.getHands().find((h) => h.id === 'wren');
    return {
      lit: p.torchLit(0, 6),
      carried: p.carriedTorch(),
      wren,
      bag: p.getBag(),
      ui: p.lastUi(),
      lantern: p.lanternLoop()
    };
  });
  expect(placed.lit, 'place puts the torch back').toBe(true);
  expect(placed.carried).toBeNull();
  expect(placed.wren?.main, 'place restores Wren mace').toBe('mace');
  expect(placed.wren?.off, 'lantern never left Wren').toBe('prayer_lantern');
  expect(placed.bag.find((s) => s.item === 'mace')).toBeUndefined();
  expect(placed.lantern.mode, 'lantern loop still running after place').toBe('oil');
  const placeAt = placed.ui.lastIndexOf('torch_place');
  const placeMove = placed.ui.lastIndexOf('ui_inventory_move');
  expect(placeAt, 'place plays torch_place').toBeGreaterThanOrEqual(0);
  expect(placeMove, 'place then plays inventory_move').toBeGreaterThan(placeAt);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 5, 0);
    p.interact();
  });
  await expect(page.locator('#torch-choice')).toHaveClass(/show/);
  await take.tap();
  await page.waitForTimeout(80);
  const tapsBeforeBrannoc = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.handTapCount()
  );
  await page.locator('.hand-btn[data-hero="brannoc"][data-hand="off"]').tap();
  await page.waitForTimeout(120);
  const brannocSwap = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return {
      hands: p.getHands(),
      bag: p.getBag(),
      taps: p.handTapCount(),
      carried: p.carriedTorch(),
      lit: p.torchLit(6, 4),
      pool: p.hasCarriedTorchLight(),
      msg: p.lastMessage()
    };
  });
  expect(brannocSwap.taps, 'Brannoc swap does not use the hand').toBe(tapsBeforeBrannoc);
  expect(brannocSwap.lit, 'Brannoc take removes the wall torch').toBe(false);
  expect(brannocSwap.carried).toMatchObject({ hero: 'brannoc', hand: 'off', lit: true });
  expect(brannocSwap.hands.find((h) => h.id === 'brannoc')?.off).toBe('torch_lit');
  expect(brannocSwap.bag).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        item: 'shield',
        count: 1,
        from: { hero: 'brannoc', hand: 'off' }
      })
    ])
  );
  expect(brannocSwap.pool).toBe(true);
  expect(brannocSwap.msg.toLowerCase()).toMatch(/takes the torch/);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(3, 1, 1);
    p.interact();
  });
  await expect(page.locator('#torch-choice')).toHaveClass(/show/);
  await snuff.tap();
  await page.waitForTimeout(80);
  const snuffed = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { lit: p.torchLit(4, 1), msg: p.lastMessage() };
  });
  expect(snuffed.lit, 'Snuff still puts the wall torch out').toBe(false);
  expect(snuffed.msg, 'snuff names the acting hero, not always Wren').toMatch(/Brannoc snuffs the torch/i);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 5, 0);
  });
  const shallow = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const moved = p.tryMoveForward();
    return { moved, carried: p.carriedTorch(), pool: p.hasCarriedTorchLight(), msg: p.lastMessage() };
  });
  expect(shallow.moved.after, 'step onto shallow water').toMatchObject({ x: 1, y: 4 });
  expect(shallow.carried, 'shallow water keeps the carried torch lit').toMatchObject({ lit: true });
  expect(shallow.pool, 'carried torch still lights the party square in shallow water').toBe(true);
  expect(shallow.msg.toLowerCase(), 'shallow water does not dunk').not.toMatch(/dunks the torch/);

  const dunk = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 3, 1);
    const moved = p.tryMoveForward();
    return { moved, carried: p.carriedTorch(), pool: p.hasCarriedTorchLight(), msg: p.lastMessage() };
  });
  expect(dunk.moved.after, 'step onto deep water').toMatchObject({ x: 2, y: 3 });
  expect(dunk.carried, 'deep water dunks the torch').toMatchObject({ lit: false });
  expect(dunk.pool, 'burnt torch no longer lights the square').toBe(false);
  expect(dunk.msg.toLowerCase(), 'dunk log line').toMatch(/dunks the torch/);

  expect(errors, 'page/console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
