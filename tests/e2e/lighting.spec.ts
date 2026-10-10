import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  interact: () => void;
  getOil: () => number;
  setOil: (n: number) => void;
  setFlickerFrame: (frame: number) => void;
  getBright: () => number;
  getAmbientFloor: () => number;
  getAmbient: () => number;
  isSquareLit: (x: number, y: number) => boolean;
  darkFx: () => {
    eyes: Array<{ x: number; y: number; monster: string; tint: string; visible: boolean }>;
    glints: Array<{ x: number; y: number; item: string; visible: boolean }>;
    stairs: number;
  };
  lastMessage: () => string;
  lastNote: () => { title: string; text: string };
  noteOpen: () => boolean;
  meanLuma: () => number;
  tryMoveForward: () => { result: string; after: { x: number; y: number; dir: number } };
  doorOpen: (x: number, y: number) => boolean;
  getPosition: () => { x: number; y: number; dir: number };
  torchStates: () => Array<{ x: number; y: number; face: string; lit: boolean; capped: boolean }>;
  tileBrightness: (x: number, y: number) => number;
  regionStats: (x0: number, y0: number, x1: number, y1: number) => { luma: number; fogRatio: number; n: number };
  sprites: () => Array<{ item?: string; x: number; y: number; kind: string }>;
};

test.use(devices['iPhone 15']);

test('proto3d lighting: pools, relight, oil, no 404s', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const failed404s: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('[ERROR]', msg.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() === 404) {
      failed404s.push(response.url());
      console.log('[404]', response.url());
    }
  });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
    console.log('SHOT', file);
  };

  const oilHud = page.locator('#oil-readout');
  await expect(oilHud).toHaveText('Oil 2/4');

  const startOil = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil());
  expect(startOil).toBe(2);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getBright()),
    'default ?bright= is 1'
  ).toBe(1);

  const states = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates());
  expect(states.find((s) => s.x === 0 && s.y === 6)?.lit).toBe(true);
  expect(states.find((s) => s.x === 4 && s.y === 6)?.lit).toBe(false);
  expect(states.find((s) => s.x === 0 && s.y === 3)?.capped).toBe(true);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(5, 7, 0));
  const poolBefore = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(1, 6)
  );
  const darkBefore = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(3, 6)
  );
  // (7,7) is outside lit torches, the lantern at (5,7), and the (2,6) sunbeam.
  const unlit = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return { tile: p.tileBrightness(7, 7), fill: p.getAmbient() };
  });
  console.log(
    'BRIGHTNESS before relight pool',
    poolBefore.toFixed(3),
    'dark',
    darkBefore.toFixed(3),
    'unlit tile',
    unlit.tile.toFixed(3),
    'ambient fill',
    unlit.fill.toFixed(3)
  );
  expect(poolBefore, 'lit pool brighter than dark stretch').toBeGreaterThan(darkBefore + 0.12);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getAmbientFloor()),
    'default ambient table is floor 1'
  ).toBe(1);
  expect(unlit.fill, 'floor 1 ambient fill is low but readable').toBeGreaterThan(0.04);
  expect(unlit.fill, 'floor 1 ambient fill is low but readable').toBeLessThan(0.085);
  expect(unlit.tile, 'floor 1 unlit stone stays faintly readable').toBeGreaterThan(0.035);
  expect(unlit.tile, 'floor 1 unlit stone stays a low ambient').toBeLessThan(0.1);

  const lantern = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setOil(2);
    p.setPosition(7, 1, 3);
    return {
      oil: p.getOil(),
      pos: p.getPosition(),
      own: p.tileBrightness(7, 1),
      ahead: p.tileBrightness(6, 1)
    };
  });
  console.log('LANTERN oil', lantern);
  expect(lantern.oil, 'oil lantern test has oil').toBe(2);
  expect(lantern.pos.x, 'oil lantern test at 7,1').toBe(7);
  expect(lantern.pos.y, 'oil lantern test at 7,1').toBe(1);
  expect(lantern.own, 'oil lantern keeps the party square readable').toBeGreaterThan(0.3);
  expect(lantern.ahead, 'oil lantern is near-ambient by the next square').toBeLessThan(0.2);
  expect(lantern.ahead, 'oil lantern still a little above ambient on the next square').toBeGreaterThan(
    unlit.fill * 0.8
  );
  expect(lantern.ahead, 'oil lantern next square is well below the party square').toBeLessThan(
    lantern.own * 0.45
  );
  // East along the south strip — own floor + next square, then near-black. Avoids the slime.
  await shot(1, 7, 1, 'lighting_lantern_oil_east.png');

  const ember = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setOil(0);
    p.setPosition(7, 1, 3);
    return {
      oil: p.getOil(),
      own: p.tileBrightness(7, 1),
      ahead: p.tileBrightness(6, 1)
    };
  });
  console.log('LANTERN ember', ember);
  expect(ember.oil, 'ember lantern test has no oil').toBe(0);
  expect(ember.own, 'ember lantern keeps the party square readable').toBeGreaterThan(0.18);
  expect(ember.ahead, 'ember lantern is near-ambient by the next square').toBeLessThan(0.14);
  expect(ember.ahead, 'ember circle is smaller / dimmer than oil').toBeLessThan(lantern.ahead + 0.005);
  await shot(1, 7, 1, 'lighting_lantern_ember_east.png');
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setOil(2));

  await shot(1, 7, 0, 'torch-side-profile.png');
  await shot(6, 7, 0, 'oil-flask.png');
  const oilSprites = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.sprites().filter((s) => s.item === 'oil')
  );
  expect(oilSprites, 'two oil flasks').toHaveLength(2);
  expect(oilSprites.some((s) => s.x === 6 && s.y === 6), 'pantry oil').toBe(true);
  expect(oilSprites.some((s) => s.x === 12 && s.y === 8), 'lamp-room oil').toBe(true);

  await shot(3, 6, 1, 'dead-torch-before.png');
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(3, 6, 1);
    p.interact();
  });
  await page.waitForTimeout(700);
  await shot(3, 6, 1, 'dead-torch-after.png');

  const afterLit = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 4 && s.y === 6)
  );
  expect(afterLit?.lit, 'west-corridor torch relit').toBe(true);
  const oilAfterLight = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil()
  );
  expect(oilAfterLight).toBe(1);
  await expect(oilHud).toHaveText('Oil 1/4');

  await shot(1, 7, 0, 'lighting_dark_corridor_pools.png');

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(5, 7, 0));
  const pool = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(1, 6)
  );
  const dark = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.tileBrightness(2, 6)
  );
  console.log('BRIGHTNESS lit pool', pool.toFixed(3), 'mid-corridor', dark.toFixed(3));
  expect(pool, 'lit pool stays brighter than the mid-corridor').toBeGreaterThan(dark);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(6, 6, 0);
    p.interact();
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil())).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toContain(
    'Oil flask'
  );
  await expect(oilHud).toHaveText('Oil 2/4');

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setOil(0);
    p.setPosition(7, 1, 1);
    p.interact();
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toBe(
    'No oil left. The ember will have to do.'
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 8 && s.y === 1)?.lit
    )
  ).toBe(false);

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 3, 3);
    p.interact();
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toBe(
    'Sealed. Dwarves don\'t do "temporary".'
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 0 && s.y === 3)?.lit
    )
  ).toBe(false);

  const region = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(1, 6, 1);
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    return {
      near: p.regionStats(w * 0.12, h * 0.28, w * 0.32, h * 0.7),
      mid: p.regionStats(w * 0.42, h * 0.32, w * 0.62, h * 0.68)
    };
  });
  console.log('REGION near luma', region.near.luma.toFixed(1), 'mid luma', region.mid.luma.toFixed(1));

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});

test('proto3d lighting: ?ambientFloor=3 is near-black beyond the lantern', async ({ page }) => {
  test.setTimeout(60000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const failed404s: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) failed404s.push(response.url());
  });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1&ambientFloor=3`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getAmbientFloor())
  ).toBe(3);

  const deep = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setOil(2);
    p.setPosition(5, 7, 0);
    const unlit = p.tileBrightness(7, 7);
    const fill = p.getAmbient();
    p.setPosition(7, 1, 3);
    return {
      unlit,
      fill,
      own: p.tileBrightness(7, 1),
      ahead: p.tileBrightness(6, 1)
    };
  });
  console.log('AMBIENT floor3', deep);
  expect(deep.fill, 'floor 3+ ambient fill is ~2–3%').toBeGreaterThan(0.014);
  expect(deep.fill, 'floor 3+ ambient fill is ~2–3%').toBeLessThan(0.035);
  expect(deep.unlit, 'floor 3+ beyond lights is near-black (not 0)').toBeGreaterThan(0.014);
  expect(deep.unlit, 'floor 3+ beyond lights is near-black (not 0)').toBeLessThan(0.045);
  expect(deep.own, 'lantern still reads the party square on floor 3 ambient').toBeGreaterThan(0.3);
  expect(deep.ahead, 'lantern is near-ambient by the next square on floor 3').toBeLessThan(0.2);

  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(1, 7, 1));
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/lighting_ambient_floor3_preview.png`, fullPage: false });

  const fx = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(13, 1, 3);
    return {
      slimeLit: p.isSquareLit(7, 3),
      ratLit: p.isSquareLit(10, 1),
      fx: p.darkFx()
    };
  });
  console.log('DARK FX', fx);
  expect(fx.slimeLit, 'slime at (7,3) is behind the (6,4) torch wall').toBe(false);
  expect(fx.ratLit, 'beam-hall rat is outside torch and lantern').toBe(false);
  const ratEyes = fx.fx.eyes.find((e) => e.x === 10 && e.y === 1);
  expect(ratEyes, 'dark rat has eye glints').toBeTruthy();
  expect(ratEyes!.tint, 'rat eyes are green').toBe('green');
  expect(ratEyes!.visible, 'rat eyes show in the dark').toBe(true);
  expect(fx.fx.stairs, 'stairs-down glow is placed').toBeGreaterThan(0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/lighting_eye_glints_dark.png`, fullPage: false });

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});

test('proto3d floor1v2: start-key-door-hall-stairs and pantry-lamp room', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const failed404s: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
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
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  const pose = async (x: number, y: number, dir: number) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
  };
  const step = async (expectResult = 'ok') => {
    const moved = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.tryMoveForward());
    expect(moved.result).toBe(expectResult);
    return moved;
  };
  const tap = async () => {
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interact());
  };

  await pose(1, 7, 0);
  expect((await step()).after).toMatchObject({ x: 1, y: 6 });
  await pose(1, 6, 0);
  expect((await step()).after).toMatchObject({ x: 1, y: 5 });
  await pose(1, 5, 1);
  expect((await step()).after).toMatchObject({ x: 2, y: 5 });
  await pose(2, 5, 0);
  await tap();
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage())).toBe(
    'Found a rusty key.'
  );

  await pose(2, 5, 0);
  expect((await step()).after).toMatchObject({ x: 2, y: 4 });
  await pose(2, 4, 0);
  expect((await step()).after).toMatchObject({ x: 2, y: 3 });
  await pose(2, 3, 0);
  expect((await step()).after).toMatchObject({ x: 2, y: 2 });
  await pose(2, 2, 1);
  expect((await step()).after).toMatchObject({ x: 3, y: 2 });
  await pose(3, 2, 1);
  await tap();
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2))
  ).toBe(true);

  for (const [x, y] of [
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 2],
    [8, 2],
    [9, 2],
    [10, 2]
  ] as const) {
    await pose(x, y, 1);
    expect((await step()).after).toMatchObject({ x: x + 1, y: 2 });
  }
  await pose(11, 2, 1);
  await step('wall');
  await pose(11, 3, 0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/floor1_guard_hall_beams_sunbeam.png`, fullPage: false });

  await pose(11, 2, 2);
  expect((await step()).after).toMatchObject({ x: 11, y: 3 });
  await pose(11, 3, 1);
  expect((await step()).after).toMatchObject({ x: 12, y: 3 });
  await pose(12, 3, 1);
  expect((await step()).after).toMatchObject({ x: 13, y: 3 });
  await pose(13, 3, 2);
  expect((await step()).after).toMatchObject({ x: 13, y: 4 });
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.darkFx().stairs),
    'stairs glow at (13,4)'
  ).toBeGreaterThan(0);

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  await pose(1, 7, 1);
  expect((await step()).after).toMatchObject({ x: 2, y: 7 });
  await pose(2, 7, 1);
  expect((await step()).after).toMatchObject({ x: 3, y: 7 });
  await pose(3, 7, 0);
  expect((await step()).after).toMatchObject({ x: 3, y: 6 });
  await pose(3, 6, 0);
  expect((await step()).after).toMatchObject({ x: 3, y: 5 });
  await pose(3, 5, 1);
  expect((await step()).after).toMatchObject({ x: 4, y: 5 });
  await pose(4, 5, 1);
  expect((await step()).after).toMatchObject({ x: 5, y: 5 });
  await pose(5, 5, 1);
  expect((await step()).after).toMatchObject({ x: 6, y: 5 });
  await pose(6, 5, 2);
  expect((await step()).after).toMatchObject({ x: 6, y: 6 });
  await pose(6, 6, 1);
  expect((await step()).after).toMatchObject({ x: 7, y: 6 });
  await pose(7, 6, 1);
  expect((await step()).after).toMatchObject({ x: 8, y: 6 });

  await pose(11, 9, 1);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/floor1_lamp_room_unlit.png`, fullPage: false });

  await pose(8, 6, 0);
  await tap();
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(
      () => (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates().find((s) => s.x === 8 && s.y === 5)?.lit
    ),
    'lamp-room dead torch relit'
  ).toBe(true);

  await pose(8, 6, 1);
  expect((await step()).after).toMatchObject({ x: 9, y: 6 });
  await pose(9, 6, 1);
  expect((await step()).after).toMatchObject({ x: 10, y: 6 });
  await pose(10, 6, 1);
  expect((await step()).after).toMatchObject({ x: 11, y: 6 });
  await pose(11, 6, 2);
  expect((await step()).after).toMatchObject({ x: 11, y: 7 });
  await pose(11, 7, 2);
  expect((await step()).after).toMatchObject({ x: 11, y: 8 });

  await pose(11, 9, 1);
  await tap();
  const note = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage());
  expect(note).toContain('They took the lamps first');
  expect(note).toContain('Pell');
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
    'first desk tap opens Pell\'s note'
  ).toBe(true);
  await tap();
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
    'second desk tap closes Pell\'s note'
  ).toBe(false);
  await tap();
  expect(
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
    'third desk tap opens Pell\'s note again'
  ).toBe(true);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/floor1_lamp_room_lit.png`, fullPage: false });

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});

test('proto3d lighting: screen luma of the 3D view', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });

  const boot = async (qs: string) => {
    await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1${qs}`);
    await page.waitForFunction(
      () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
      null,
      { timeout: 25000 }
    );
    await page.locator('#tap-to-start').click();
    await page.waitForTimeout(400);
  };

  const poseLuma = async (x: number, y: number, dir: number, file?: string) => {
    await page.evaluate(([px, py, pd]) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(px, py, pd);
      // Brightest flame frame so torch-lit luma is not flicker-lucky.
      p.setFlickerFrame(2);
    }, [x, y, dir] as const);
    await page.waitForTimeout(80);
    if (file) await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
    return page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setFlickerFrame(2);
      return p.meanLuma();
    });
  };

  await boot('&ambientFloor=3');
  // Lamp room — no lit torch reaches here, so the lantern is the only pool.
  const floor3 = await poseLuma(10, 9, 1, 'after_ambient_floor3.png');
  const floor3Fill = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.getAmbient()
  );

  await boot('');
  const darkCorridor = await poseLuma(10, 9, 1, 'after_dark_corridor.png');
  // Face the (0,6) torch so the pool fills the 3D view.
  const torchLit = await poseLuma(1, 6, 3, 'after_torch_lit.png');
  const relightBefore = await poseLuma(3, 6, 1, 'after_relight_unlit.png');
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interact());
  await page.waitForTimeout(700);
  const relightAfter = await poseLuma(3, 6, 1, 'after_relight_lit.png');
  const floor1Fill = await page.evaluate(
    () => (window as unknown as { __proto3d: Proto3d }).__proto3d.getAmbient()
  );
  console.log('AMBIENT fill F1', floor1Fill.toFixed(3), 'F3', floor3Fill.toFixed(3));

  const darkRatio = darkCorridor / torchLit;
  const floor3Ratio = floor3 / torchLit;
  const relightGain = relightAfter / relightBefore;

  console.log('SCREEN LUMA dark corridor', darkCorridor.toFixed(2));
  console.log('SCREEN LUMA torch-lit', torchLit.toFixed(2));
  console.log('SCREEN LUMA ambientFloor=3', floor3.toFixed(2));
  console.log('SCREEN LUMA relight before', relightBefore.toFixed(2), 'after', relightAfter.toFixed(2));
  console.log(
    'SCREEN LUMA ratios dark/torch',
    darkRatio.toFixed(3),
    'floor3/torch',
    floor3Ratio.toFixed(3),
    'relight gain',
    relightGain.toFixed(3)
  );

  expect(darkRatio, 'lantern-only dark corridor ≤ 60% of torch-lit').toBeLessThanOrEqual(0.6);
  expect(floor3Ratio, '?ambientFloor=3 ≤ 40% of torch-lit').toBeLessThanOrEqual(0.4);
  expect(relightGain, 'relighting a dead torch raises nearby view luma ≥ 50%').toBeGreaterThanOrEqual(1.5);
});
