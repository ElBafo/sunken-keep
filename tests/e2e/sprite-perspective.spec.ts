import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type ScreenRect = {
  height: number;
  idleBodyHeight?: number;
  feetY: number;
  topY: number;
  width: number;
  worldX: number;
  worldZ: number;
  scaleY: number;
  lod: string | null;
  canvas?: [number, number];
  renderTarget?: [number, number];
};

type IdleBodyRange = { min: number; max: number; frameH: number };

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  spriteScreen: (kind: 'monster' | 'item', x: number, y: number) => ScreenRect | null;
  sprites: () => Array<{
    monsterKind?: string;
    itemId?: string;
    kind: string;
    x: number;
    y: number;
    worldX: number;
    worldZ: number;
    scaleY: number;
    baseH: number;
    lod?: string | null;
    visible?: boolean;
    renderOrder?: number;
  }>;
  cameraSpec: () => {
    eyeHeight: number;
    backOffsetTiles: number;
    pitchDeg: number;
    fov: number;
    view: [number, number];
    monsterOffsetTowardParty: number;
    wallSpriteHeightPx: Record<string, number>;
  };
  canvasSize: () => { canvas: [number, number]; renderTarget: [number, number] };
  gameStage: () => {
    stage: {
      width: number;
      height: number;
      x: number;
      y: number;
      top: number;
      left: number;
      right: number;
      bottom: number;
    } | null;
    oil: {
      width: number;
      height: number;
      x: number;
      y: number;
      top: number;
      left: number;
      right: number;
      bottom: number;
    } | null;
    oilInside: boolean;
    toastInside: boolean;
    fpsInside: boolean;
    titleInside?: boolean;
    introInside?: boolean;
    bubbleInside?: boolean;
  };
  listenerPose: () => { x: number; y: number; z: number };
  snapDoor?: (x: number, y: number, open: boolean) => void;
  showMonster?: (x: number, y: number) => void;
  adjacentMonster: () => { kind: string; x: number; y: number } | null;
  facingMonster: () => { kind: string; x: number; y: number } | null;
  interact: () => void;
  getBag: () => Array<{ item: string; count: number }>;
  lastMessage: () => string;
  lastUi: () => string[];
  logLines: () => string[];
  killMonsterAt: (x: number, y: number) => void;
};

const LOD_BY_SQUARES = ['close', 'near', 'mid', 'far'] as const;

test.use(devices['iPhone 15']);

async function boot(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/proto3d.html?test=1&bright=1.6`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForTimeout(400);
  await expect(page.locator('#fps-counter')).toHaveCount(0);
}

async function measure(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  dir: number,
  kind: 'monster' | 'item',
  sx: number,
  sy: number
) {
  return page.evaluate(
    ({ x, y, dir, kind, sx, sy }) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      p.setPosition(x, y, dir);
      if (kind === 'monster') p.showMonster?.(sx, sy);
      return p.spriteScreen(kind, sx, sy);
    },
    { x, y, dir, kind, sx, sy }
  );
}

function expectIdleBody(height: number, range: IdleBodyRange, label: string) {
  expect(height, `${label} idle body >= min-1`).toBeGreaterThanOrEqual(range.min - 1);
  expect(height, `${label} idle body <= max+1`).toBeLessThanOrEqual(range.max + 1);
}

test('fixed 270x380 view; idle body heights; slime 3/2/1; no jump', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const size = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.canvasSize());
  expect(size.canvas, 'drawing buffer is camera.json view').toEqual([270, 380]);
  expect(size.renderTarget, 'render target never resizes').toEqual([270, 380]);

  const cam = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.cameraSpec());
  expect(cam.fov).toBe(80);
  expect(cam.view).toEqual([270, 380]);
  expect(cam.monsterOffsetTowardParty).toBe(0.25);

  const ranges = await page.evaluate(async () => {
    const res = await fetch('art/dungeon/monster_anchor.json');
    const json = (await res.json()) as {
      idleBodyHeightPx?: Record<string, Record<string, IdleBodyRange>>;
      distanceFrames?: { idleBodyHeightPx?: Record<string, Record<string, IdleBodyRange>> };
    };
    return json.distanceFrames?.idleBodyHeightPx ?? json.idleBodyHeightPx ?? {};
  });

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.snapDoor?.(4, 2, true);
  });

  const far = await measure(page, 4, 2, 1, 'monster', 7, 2);
  const mid = await measure(page, 5, 2, 1, 'monster', 7, 2);
  const near = await measure(page, 6, 2, 1, 'monster', 7, 2);
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-1-square.png` });

  expect(far!.lod).toBe('mid');
  expect(mid!.lod).toBe('near');
  expect(near!.lod).toBe('close');
  expect(mid!.height, 'height grows 3 → 2').toBeGreaterThan(far!.height);
  expect(near!.height, 'height grows 2 → 1').toBeGreaterThan(mid!.height);
  expect(near!.height / mid!.height, 'no 2× jump from 2 to 1').toBeLessThan(2);
  expect(near!.worldX, 'quarter-square toward the party').toBeCloseTo(13.5, 5);
  expect(near!.scaleY).toBeCloseTo(mid!.scaleY, 5);

  const backToTwo = await measure(page, 5, 2, 1, 'monster', 7, 2);
  expect(backToTwo!.height, 'size at 2 squares is the same after stepping away').toBeCloseTo(mid!.height, 1);

  const series = [
    {
      name: 'keep_rat',
      poses: [
        [6, 5, 1, 7, 5],
        [5, 5, 1, 7, 5],
        [4, 5, 1, 7, 5],
        [3, 5, 1, 7, 5]
      ] as Array<[number, number, number, number, number]>
    },
    {
      name: 'rust_crab',
      poses: [
        [6, 3, 3, 5, 3],
        [7, 3, 3, 5, 3],
        [8, 3, 3, 5, 3],
        [9, 3, 3, 5, 3]
      ] as Array<[number, number, number, number, number]>
    },
    {
      name: 'slime',
      poses: [
        [6, 2, 1, 7, 2],
        [5, 2, 1, 7, 2],
        [4, 2, 1, 7, 2],
        [3, 2, 1, 7, 2]
      ] as Array<[number, number, number, number, number]>
    },
    {
      name: 'bog_leeches',
      poses: [
        [3, 4, 0, 3, 3],
        [3, 5, 0, 3, 3],
        [3, 6, 0, 3, 3],
        [3, 7, 0, 3, 3]
      ] as Array<[number, number, number, number, number]>
    }
  ];

  for (const kind of series) {
    const bodies: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [x, y, dir, sx, sy] = kind.poses[i];
      const rect = await measure(page, x, y, dir, 'monster', sx, sy);
      expect(rect, `${kind.name} at ${i + 1} square`).toBeTruthy();
      expect(rect!.lod, `${kind.name}@${i + 1} lod`).toBe(LOD_BY_SQUARES[i]);
      const range = ranges[kind.name][LOD_BY_SQUARES[i]];
      const onScreen = rect!.idleBodyHeight ?? rect!.height;
      const comparable = rect!.height > 0 ? onScreen * (range.frameH / rect!.height) : onScreen;
      bodies.push(onScreen);
      expectIdleBody(comparable, range, `${kind.name}@${i + 1}`);
    }
    console.log(
      'IDLE_BODY_1_2_3_4',
      kind.name,
      bodies.map((n) => Math.round(n * 100) / 100),
      ranges[kind.name]
    );
  }
});

test('phone stage fills width at 393x852 and height at 393x659; HUD stays inside', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await boot(page);
  const short = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameStage());
  expect(short.oilInside, 'oil gauge is inside the 270×585 stage').toBe(true);
  expect(short.toastInside, 'toasts are inside the 270×585 stage').toBe(true);
  expect(short.fpsInside, 'debug FPS lives inside the stage when present').toBe(true);
  expect(short.titleInside, 'title/load screens live in the 270×585 stage').toBe(true);
  expect(short.bubbleInside, 'speech bubble lives in the 270×585 stage').toBe(true);
  expect(short.stage!.height, '393×659 is height-limited').toBeGreaterThanOrEqual(657);
  expect(short.stage!.height).toBeLessThanOrEqual(660);
  expect(short.stage!.width, 'short Safari letterboxes the sides').toBeLessThan(360);
  expect(short.oil!.right).toBeLessThanOrEqual(short.stage!.right + 1);
  expect(short.oil!.top).toBeGreaterThanOrEqual(short.stage!.top - 1);

  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const tall = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.gameStage());
  expect(tall.stage!.width, '393×852 fills the width').toBeGreaterThanOrEqual(390);
  expect(tall.stage!.width).toBeLessThanOrEqual(394);
  expect(tall.oilInside).toBe(true);
  expect(tall.fpsInside).toBe(true);
  expect(tall.oil!.right).toBeLessThanOrEqual(tall.stage!.right + 1);
  expect(tall.oil!.top).toBeGreaterThanOrEqual(tall.stage!.top - 1);
});

test('monster two squares away is never adjacent', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.snapDoor?.(4, 2, true);
    p.showMonster?.(7, 2);
    p.setPosition(5, 2, 1);
    const two = { adjacent: p.adjacentMonster(), facing: p.facingMonster() };
    p.setPosition(6, 2, 1);
    return {
      two,
      one: { adjacent: p.adjacentMonster(), facing: p.facingMonster() }
    };
  });
  expect(got.two.facing, 'square ahead is empty at 2-square range').toBeNull();
  expect(got.two.adjacent?.kind, 'the slime two squares away is not adjacent').not.toBe('slime');
  expect(got.two.adjacent?.x === 7 && got.two.adjacent?.y === 2, 'slime grid is not adjacent').toBeFalsy();
  expect(got.one.facing?.kind, '1 square is the faced slime').toBe('slime');
  expect(got.one.adjacent?.kind).toBe('slime');
});

test('item under a live monster is guarded, then picked up after the kill', async ({ page }) => {
  await boot(page);
  const first = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(5, 2, 2);
    p.showMonster?.(5, 3);
    const before = p.getBag();
    p.interact();
    const mid = {
      bag: p.getBag(),
      msg: p.lastMessage(),
      ui: p.lastUi(),
      logs: p.logLines().filter((l) => /in the way/i.test(l))
    };
    p.interact();
    return {
      before,
      mid,
      afterSpam: {
        bag: p.getBag(),
        msg: p.lastMessage(),
        logs: p.logLines().filter((l) => /in the way/i.test(l))
      }
    };
  });
  expect(first.mid.msg.toLowerCase()).toContain('rust crab');
  expect(first.mid.msg).toMatch(/in the way\. Fight first/i);
  expect(first.mid.ui).toContain('item_use_fail');
  expect(first.mid.logs.length, 'first tap logs item_guarded').toBe(1);
  expect(first.afterSpam.logs.length, 'repeat taps do not spam the log').toBe(1);
  expect(first.afterSpam.bag).toEqual(first.before);

  const afterKill = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.killMonsterAt(5, 3);
    const before = p.getBag();
    p.interact();
    return { before, bag: p.getBag(), msg: p.lastMessage() };
  });
  const count = (bag: Array<{ item: string; count: number }>, id: string) =>
    bag.filter((s) => s.item === id).reduce((n, s) => n + s.count, 0);
  expect(count(afterKill.bag, 'potion_red'), 'one tap after the kill takes the potion').toBe(
    count(afterKill.before, 'potion_red') + 1
  );
});

test('live monster occludes the item on its square at 1 and 2 squares', async ({ page }) => {
  await boot(page);
  const check = async (x: number, y: number, dir: number) =>
    page.evaluate(
      ({ x, y, dir }) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setPosition(x, y, dir);
        p.showMonster?.(5, 3);
        const sprites = p.sprites();
        const monster = sprites.find((s) => s.kind === 'monster' && s.x === 5 && s.y === 3);
        const item = sprites.find((s) => s.kind === 'item' && s.x === 5 && s.y === 3);
        const cam = p.listenerPose ? undefined : null;
        void cam;
        const dxm = monster!.worldX - x * 2;
        const dzm = monster!.worldZ - y * 2;
        const dxi = item!.worldX - x * 2;
        const dzi = item!.worldZ - y * 2;
        return {
          monster: monster && {
            worldX: monster.worldX,
            worldZ: monster.worldZ,
            renderOrder: monster.renderOrder,
            dist: Math.hypot(dxm, dzm)
          },
          item: item && {
            worldX: item.worldX,
            worldZ: item.worldZ,
            renderOrder: item.renderOrder,
            dist: Math.hypot(dxi, dzi)
          }
        };
      },
      { x, y, dir }
    );

  const near = await check(6, 3, 3);
  const far = await check(7, 3, 3);
  expect(near.monster, 'crab at 1 square').toBeTruthy();
  expect(near.item, 'potion under the crab').toBeTruthy();
  expect(near.item!.worldX, 'item stays at square centre under a live monster').toBeCloseTo(10, 5);
  expect(near.item!.worldZ).toBeCloseTo(6, 5);
  expect(near.monster!.worldX, 'crab is a quarter square toward the party').toBeCloseTo(10.5, 5);
  expect(near.monster!.dist, 'monster is closer than the item at 1 square').toBeLessThan(near.item!.dist);
  expect(near.monster!.renderOrder, 'monster draws in front of the item').toBeGreaterThan(near.item!.renderOrder!);

  expect(far.item!.worldX).toBeCloseTo(10, 5);
  expect(far.monster!.worldX).toBeCloseTo(10.5, 5);
  expect(far.monster!.dist, 'monster is closer than the item at 2 squares').toBeLessThan(far.item!.dist);
  expect(far.monster!.renderOrder).toBeGreaterThan(far.item!.renderOrder!);

  mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(7, 3, 3);
    p.showMonster?.(5, 3);
  });
  await page.screenshot({ path: `${OUT}/item-occluded-by-crab-2sq.png`, fullPage: false });
});
