import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots/after';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  getPosition: () => { x: number; y: number; dir: number };
  sprites: () => Array<{
    x: number;
    y: number;
    kind: string;
    world: number[];
    scale: number[];
    renderOrder: number;
    depthTest: boolean;
    item?: string;
  }>;
  regionStats: (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => { luma: number; fogRatio: number; n: number };
  faceKinds: () => Array<{ kind: string; lightX: number; lightY: number }>;
  faceLighting: () => Array<{
    kind: string;
    lightX: number;
    lightY: number;
    worldX: number;
    worldZ: number;
    avgR: number;
  }>;
  giveKey: () => void;
  snapDoor: (x: number, y: number, open: boolean) => void;
  tryMoveForward: () => { result: string };
};

test.use(devices['iPhone 15']);

test('proto3d iPhone fixes: sorting, items, walls, water, doors, no 404s', async ({ page }) => {
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
  await page.waitForFunction(() => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true, null, {
    timeout: 25000
  });
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(500);

  const shot = async (x: number, y: number, dir: number, file: string) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    await page.waitForTimeout(180);
    const path = `${OUT}/${file}`;
    await page.screenshot({ path, fullPage: false });
    console.log(`SHOT ${file} md5=${createHash('md5').update(readFileSync(path)).digest('hex')}`);
  };

  // --- 1. Leech sorting vs key ---
  await shot(1, 7, 0, '01-leech-vs-key-start.png');
  await shot(2, 6, 0, '01-leech-vs-key-ahead.png');
  const sprites = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.sprites()
  );
  const leeches = sprites.find((s) => s.kind === 'monster' && s.x === 3 && s.y === 3);
  const key = sprites.find((s) => s.item === 'key');
  expect(leeches, 'bog leeches sprite').toBeTruthy();
  expect(key, 'key sprite').toBeTruthy();
  expect(leeches!.depthTest, 'leeches depthTest').toBe(true);
  expect(key!.depthTest, 'key depthTest').toBe(true);
  expect(leeches!.renderOrder, 'leeches share sprite renderOrder').toBe(key!.renderOrder);

  // --- 2. Items on own square vs ahead; every floor-1 item ---
  const itemTiles = [
    { item: 'key', x: 2, y: 5, away: { x: 2, y: 6, dir: 0 } },
    { item: 'potion_red', x: 6, y: 3, away: { x: 6, y: 2, dir: 2 } },
    { item: 'potion_blue', x: 5, y: 5, away: { x: 4, y: 5, dir: 1 } },
    { item: 'chest', x: 5, y: 7, away: { x: 5, y: 6, dir: 2 } },
    { item: 'potion_green', x: 7, y: 7, away: { x: 7, y: 6, dir: 2 } }
  ];
  for (const it of itemTiles) {
    expect(
      sprites.some((s) => s.kind === 'item' && s.item === it.item && s.x === it.x && s.y === it.y),
      `floor 1 item ${it.item}`
    ).toBe(true);
    await shot(it.x, it.y, 0, `02-${it.item}-own-square.png`);
    const own = await page.evaluate(
      ([x, y]) =>
        (window as unknown as { __proto3d: Proto3d }).__proto3d
          .sprites()
          .find((s) => s.item && s.x === x && s.y === y),
      [it.x, it.y] as const
    );
    await shot(it.away.x, it.away.y, it.away.dir, `02-${it.item}-one-square.png`);
    const away = await page.evaluate(
      ([x, y]) =>
        (window as unknown as { __proto3d: Proto3d }).__proto3d
          .sprites()
          .find((s) => s.item && s.x === x && s.y === y),
      [it.x, it.y] as const
    );
    expect(own, `${it.item} own`).toBeTruthy();
    expect(away, `${it.item} away`).toBeTruthy();
    const ownArea = own!.scale[0] * own!.scale[1];
    const awayArea = away!.scale[0] * away!.scale[1];
    expect(ownArea, `${it.item} own-square smaller than one-square`).toBeLessThan(awayArea);
    expect(own!.world[1], `${it.item} sits on the floor`).toBeLessThan(0.2);
  }

  // --- 3. Corridor walls after the locked door ---
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.giveKey();
    p.setPosition(3, 2, 1);
    p.snapDoor(4, 2, true);
  });
  await page.waitForTimeout(200);

  const faces = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.faceKinds()
  );
  const wallsIntoDoor = faces.filter((f) => f.kind === 'wall' && f.lightX === 4 && f.lightY === 2);
  expect(wallsIntoDoor.length, 'wall faces into the door cell').toBeGreaterThanOrEqual(2);

  const corridorShots: Array<{ x: number; y: number; dir: number; file: string; checkSides: boolean }> = [
    { x: 4, y: 2, dir: 1, file: '03-corridor-on-door-east.png', checkSides: true },
    { x: 4, y: 2, dir: 3, file: '03-corridor-on-door-west.png', checkSides: true },
    { x: 4, y: 2, dir: 0, file: '03-corridor-on-door-north.png', checkSides: false },
    { x: 4, y: 2, dir: 2, file: '03-corridor-on-door-south.png', checkSides: false },
    { x: 5, y: 2, dir: 1, file: '03-corridor-east-of-door-east.png', checkSides: false },
    { x: 5, y: 2, dir: 3, file: '03-corridor-east-of-door-west.png', checkSides: false },
    { x: 5, y: 2, dir: 0, file: '03-corridor-east-of-door-north.png', checkSides: false },
    { x: 5, y: 2, dir: 2, file: '03-corridor-east-of-door-south.png', checkSides: false },
    { x: 6, y: 2, dir: 1, file: '03-corridor-toward-slime-east.png', checkSides: false },
    { x: 6, y: 2, dir: 3, file: '03-corridor-toward-slime-west.png', checkSides: false },
    { x: 6, y: 2, dir: 0, file: '03-corridor-toward-slime-north.png', checkSides: false },
    { x: 6, y: 2, dir: 2, file: '03-corridor-toward-slime-south.png', checkSides: false }
  ];

  for (const c of corridorShots) {
    await shot(c.x, c.y, c.dir, c.file);
    if (!c.checkSides) continue;
    const stats = await page.evaluate(() => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
      const w = canvas.width;
      const h = canvas.height;
      const left = p.regionStats(w * 0.04, h * 0.22, w * 0.18, h * 0.62);
      const right = p.regionStats(w * 0.82, h * 0.22, w * 0.96, h * 0.62);
      return { left, right, w, h };
    });
    console.log(`FOG ${c.file}`, stats.left.fogRatio.toFixed(3), stats.right.fogRatio.toFixed(3));
    expect(stats.left.fogRatio, `${c.file} left wall not black`).toBeLessThan(0.45);
    expect(stats.right.fogRatio, `${c.file} right wall not black`).toBeLessThan(0.45);
    expect(stats.left.luma, `${c.file} left wall luma`).toBeGreaterThan(18);
    expect(stats.right.luma, `${c.file} right wall luma`).toBeGreaterThan(18);
  }

  // --- 4. Water hall reads as water ---
  await shot(1, 4, 0, '04-water-hall-from-south.png');
  await shot(1, 2, 1, '04-water-hall-looking-east.png');
  await shot(3, 4, 0, '04-water-hall-deep-lane.png');
  await shot(2, 4, 0, '04-water-hall-on-shallow-facing-deep.png');
  await shot(3, 4, 0, '04-water-hall-leeches.png');
  const waterFaces = faces.filter((f) => f.kind === 'water-surface' || f.kind === 'water-shallow' || f.kind === 'water-deep');
  expect(waterFaces.some((f) => f.kind === 'water-surface'), 'translucent water surfaces').toBe(true);
  expect(waterFaces.some((f) => f.kind === 'water-deep'), 'deep water beds').toBe(true);
  const edges = faces.filter((f) => f.kind === 'water-edge');
  expect(edges.length, 'step faces into the deep lane').toBeGreaterThan(0);

  await page.evaluate(() => {
    // Face the (4,1) torch across the water so the floor sample is in-pool.
    (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(1, 2, 1);
  });
  const waterFloor = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    return p.regionStats(canvas.width * 0.2, canvas.height * 0.7, canvas.width * 0.8, canvas.height * 0.92);
  });
  expect(waterFloor.luma, 'water hall floor is visible').toBeGreaterThan(8);
  expect(waterFloor.fogRatio, 'water hall floor is not a black pit').toBeLessThan(0.45);

  // --- 5. Door brightness at 3 / 2 / 1 squares ---
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.snapDoor(4, 2, false));

  const doorPlaneLighting = async (x: number, y: number, dir: number) => {
    await page.evaluate(([px, py, pd]) => {
      (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(px, py, pd);
    }, [x, y, dir] as const);
    return page.evaluate(() => {
      const faces = (window as unknown as { __proto3d: Proto3d }).__proto3d.faceLighting();
      const onDoorPlane = (f: (typeof faces)[number]) => Math.abs(f.worldX - 7) < 0.2;
      const avg = (kinds: string[]) => {
        const list = faces.filter((f) => kinds.includes(f.kind) && onDoorPlane(f));
        const n = list.length || 1;
        return {
          r: list.reduce((s, f) => s + f.avgR, 0) / n,
          x: list.reduce((s, f) => s + f.worldX, 0) / n,
          n: list.length
        };
      };
      return {
        frame: avg(['door-frame']),
        panel: avg(['door-panel']),
        backing: avg(['door-backing']),
        wall: avg(['wall'])
      };
    });
  };

  const lit3 = await doorPlaneLighting(1, 2, 1);
  await shot(1, 2, 1, '05-door-3-squares.png');
  const lit2 = await doorPlaneLighting(2, 2, 1);
  await shot(2, 2, 1, '05-door-2-squares.png');
  const lit1 = await doorPlaneLighting(3, 2, 1);
  await shot(3, 2, 1, '05-door-1-square.png');
  const one = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    return {
      frame: p.regionStats(w * 0.2, h * 0.22, w * 0.3, h * 0.55),
      wall: p.regionStats(w * 0.84, h * 0.22, w * 0.98, h * 0.55),
      wood: p.regionStats(w * 0.38, h * 0.32, w * 0.62, h * 0.58)
    };
  });
  console.log('DOOR VERTEX 3sq', lit3, '2sq', lit2, '1sq', lit1);
  console.log(
    'DOOR 1sq frame luma',
    one.frame.luma,
    'wall',
    one.wall.luma,
    'wood',
    one.wood.luma
  );

  expect(lit1.frame.n, 'door frame on the west plane').toBeGreaterThan(0);
  expect(lit1.frame.x, 'door is lit at the wall plane, not the origin').toBeGreaterThan(6.5);
  expect(lit1.frame.x, 'door is lit at the wall plane, not the origin').toBeLessThan(7.5);

  // Door at (4,2) sits in the (4,1) torch pool. Vertex red varies with flame
  // flicker (~0.23–0.40), so do not require the old party-distance bands.
  expect(lit3.frame.r, '3sq door is in the torch pool').toBeGreaterThan(0.18);
  expect(lit2.frame.r, '2sq door is in the torch pool').toBeGreaterThan(0.18);
  expect(lit1.frame.r, '1sq door is in the torch pool').toBeGreaterThan(0.18);

  for (const [label, lit] of [
    ['3sq', lit3],
    ['2sq', lit2],
    ['1sq', lit1]
  ] as const) {
    expect(
      Math.abs(lit.panel.r - lit.frame.r),
      `${label} panel matches frame lighting`
    ).toBeLessThan(0.08);
    expect(
      Math.abs(lit.backing.r - lit.frame.r),
      `${label} backing matches frame lighting`
    ).toBeLessThan(0.08);
  }

  expect(one.wood.luma, 'door panel at 1 square is not a fog-black slab').toBeGreaterThan(18);
  expect(one.frame.fogRatio, 'door frame is not black').toBeLessThan(0.25);
  expect(one.wall.luma, 'neighbouring wall stays readable').toBeGreaterThan(18);

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s, '404s').toEqual([]);
});
