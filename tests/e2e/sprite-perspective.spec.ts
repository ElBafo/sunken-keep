import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type ScreenRect = {
  height: number;
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

const VIEWPORTS = [
  { name: 'browser 393x659', width: 393, height: 659 },
  { name: 'standalone 393x852', width: 393, height: 852 }
] as const;

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

function idleBand(height: number, target: number, label: string) {
  expect(height, `${label} stays near the camera.json quad (idle art may be shorter)`).toBeGreaterThan(target * 0.8);
  expect(height, `${label} is not scaled up past the camera.json target`).toBeLessThan(target * 1.12);
}

for (const vp of VIEWPORTS) {
  test.describe(`sprite perspective ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 3 });

    test('fixed 270x380 view; slime 3/2/1; rat and crab 1-4; no jump', async ({ page }) => {
      test.setTimeout(120000);
      mkdirSync(OUT, { recursive: true });
      await boot(page);

      const size = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.canvasSize());
      expect(size.canvas, 'drawing buffer is camera.json view').toEqual([270, 380]);
      expect(size.renderTarget, 'render target never resizes').toEqual([270, 380]);

      const cam = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.cameraSpec());
      expect(cam.eyeHeight).toBeCloseTo(0.94, 5);
      expect(cam.backOffsetTiles).toBeCloseTo(0.5, 5);
      expect(cam.pitchDeg).toBeCloseTo(-3.5, 5);
      expect(cam.fov).toBe(80);
      expect(cam.view).toEqual([270, 380]);
      expect(cam.monsterOffsetTowardParty).toBe(0.25);

      await page.evaluate(() => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.snapDoor?.(4, 2, true);
      });

      const listen = await page.evaluate(() => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setPosition(6, 2, 1);
        return p.listenerPose();
      });
      expect(listen.x, 'listener on party square').toBeCloseTo(12, 5);
      expect(listen.z).toBeCloseTo(4, 5);

      const far = await measure(page, 4, 2, 1, 'monster', 7, 2);
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-3-squares-${vp.width}x${vp.height}.png` });
      const mid = await measure(page, 5, 2, 1, 'monster', 7, 2);
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-2-squares-${vp.width}x${vp.height}.png` });
      const near = await measure(page, 6, 2, 1, 'monster', 7, 2);
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-1-square-${vp.width}x${vp.height}.png` });

      expect(far, 'slime at 3 squares').toBeTruthy();
      expect(mid, 'slime at 2 squares').toBeTruthy();
      expect(near, 'slime at 1 square').toBeTruthy();
      expect(far!.canvas, 'spriteScreen uses the real 270x380 buffer').toEqual([270, 380]);
      expect(far!.lod, '3 squares uses mid frames').toBe('mid');
      expect(mid!.lod, '2 squares uses near frames').toBe('near');
      expect(near!.lod, '1 square uses close frames').toBe('close');

      expect(mid!.height, 'height grows 3 → 2').toBeGreaterThan(far!.height);
      expect(near!.height, 'height grows 2 → 1').toBeGreaterThan(mid!.height);
      expect(mid!.feetY, 'feet move down 3 → 2').toBeGreaterThan(far!.feetY);
      expect(near!.feetY, 'feet move down 2 → 1').toBeGreaterThan(mid!.feetY);

      const step32 = mid!.height / far!.height;
      const step21 = near!.height / mid!.height;
      expect(step21, 'no 2× jump from 2 to 1').toBeLessThan(2);
      expect(step21).toBeGreaterThan(1.05);
      expect(step32).toBeGreaterThan(1.05);
      expect(step32).toBeLessThan(2);

      expect(near!.worldX, 'quarter-square toward the party').toBeCloseTo(13.5, 5);
      expect(near!.worldZ).toBeCloseTo(4, 5);
      expect(near!.scaleY, 'close and near share the same world height').toBeCloseTo(mid!.scaleY, 5);

      const fromEast = await measure(page, 9, 2, 3, 'monster', 7, 2);
      expect(fromEast!.height, '2-square size does not depend on approach').toBeCloseTo(mid!.height, 1);
      expect(fromEast!.feetY).toBeCloseTo(mid!.feetY, 1);

      const backToTwo = await measure(page, 5, 2, 1, 'monster', 7, 2);
      expect(backToTwo!.height, 'size at 2 squares is the same after stepping away').toBeCloseTo(mid!.height, 1);

      const rat1 = await measure(page, 6, 5, 1, 'monster', 7, 5);
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/rat-1-square-${vp.width}x${vp.height}.png` });
      const rat2 = await measure(page, 5, 5, 1, 'monster', 7, 5);
      const rat3 = await measure(page, 4, 5, 1, 'monster', 7, 5);
      const rat4 = await measure(page, 3, 5, 1, 'monster', 7, 5);
      expect(rat1, 'keep_rat at 1 square').toBeTruthy();
      expect(rat1!.lod).toBe('close');
      expect(rat1!.scaleY, 'rat is much shorter than the slime').toBeLessThan(near!.scaleY * 0.55);
      expect(rat1!.worldX).toBeCloseTo(13.5, 5);
      expect(rat1!.worldZ).toBeCloseTo(10, 5);
      const ratHeights = [rat1!, rat2!, rat3!, rat4!].map((r) => Math.round(r.height));
      console.log(
        'RAT_HEIGHTS_1_2_3_4',
        vp.name,
        ratHeights,
        [rat1, rat2, rat3, rat4].map((r) => r && { h: r.height, lod: r.lod, scaleY: r.scaleY })
      );
      [1, 2, 3, 4].forEach((n, i) => {
        idleBand([rat1!, rat2!, rat3!, rat4!][i].height, cam.wallSpriteHeightPx[String(n)] * 0.25, `rat@${n}`);
      });

      const crab1 = await measure(page, 6, 3, 3, 'monster', 5, 3);
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/crab-1-square-${vp.width}x${vp.height}.png` });
      const crab2 = await measure(page, 7, 3, 3, 'monster', 5, 3);
      const crab3 = await measure(page, 8, 3, 3, 'monster', 5, 3);
      const crab4 = await measure(page, 9, 3, 3, 'monster', 5, 3);
      expect(crab1, 'rust_crab at 1 square').toBeTruthy();
      expect(crab1!.lod).toBe('close');
      expect(crab1!.scaleY, 'crab world height is 0.35 walls').toBeCloseTo(0.7, 5);
      const crabHeights = [crab1!, crab2!, crab3!, crab4!].map((r) => Math.round(r.height));
      console.log(
        'CRAB_HEIGHTS_1_2_3_4',
        vp.name,
        crabHeights,
        [crab1, crab2, crab3, crab4].map((r) => r && { h: r.height, lod: r.lod, scaleY: r.scaleY })
      );
      [1, 2, 3, 4].forEach((n, i) => {
        idleBand([crab1!, crab2!, crab3!, crab4!][i].height, cam.wallSpriteHeightPx[String(n)] * 0.35, `crab@${n}`);
      });

      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(6, 2, 1));
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/slime-1-square-again-${vp.width}x${vp.height}.png` });

      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(7, 7, 2));
      await page.waitForTimeout(120);
      const item = await page.evaluate(() => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        return p.spriteScreen('item', 7, 7);
      });
      await page.locator('#render-canvas').screenshot({ path: `${OUT}/item-own-square-wall-${vp.width}x${vp.height}.png` });
      expect(item, 'own-square item is on screen').toBeTruthy();
      expect(item!.feetY, 'own-square item sits in the visible floor strip').toBeGreaterThan(item!.topY);
    });
  });
}

test('monster two squares away is never adjacent', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.snapDoor?.(4, 2, true);
    p.setPosition(5, 2, 1);
    p.showMonster?.(7, 2);
    return {
      adjacent: p.adjacentMonster(),
      facing: p.facingMonster(),
      one: (() => {
        p.setPosition(6, 2, 1);
        return { adjacent: p.adjacentMonster(), facing: p.facingMonster() };
      })()
    };
  });
  expect(got.adjacent, '2 squares is not adjacent').toBeNull();
  expect(got.facing, '2 squares is not the faced square').toBeNull();
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

  await page.evaluate(() => {
    const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    p.setPosition(7, 3, 3);
    p.showMonster?.(5, 3);
  });
  await page.locator('#render-canvas').screenshot({ path: `${OUT}/item-occluded-by-crab-2sq.png` });
});
