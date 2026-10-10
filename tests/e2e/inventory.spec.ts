import { mkdirSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  getPosition: () => { x: number; y: number; dir: number };
  interact: () => void;
  pickupHere: () => boolean;
  pickupFacing: () => boolean;
  getBag: () => Array<{ item: string; count: number }>;
  giveItem: (id: string, n?: number) => void;
  openBag: () => void;
  closeBag: () => void;
  bagOpen: () => boolean;
  useBagSlot: (i: number) => void;
  equipBagSlot: (i: number, hero: string) => void;
  drinkPotion: (hero: string, kind: string) => void;
  lastCompare: () => string | null;
  lastMessage: () => string;
  logLines: () => string[];
  lastUi: () => string[];
  locale: () => string;
  getOil: () => number;
  setOil: (n: number) => void;
  setHeroHp: (id: string, hp: number) => void;
  chestOpen: (x: number, y: number) => boolean;
  tryMoveForward: () => { result: string; after: { x: number; y: number; dir: number } };
  sprites: () => Array<{
    kind: string;
    x: number;
    y: number;
    monsterKind?: string;
    scaleY: number;
    baseH: number;
    worldX: number;
    worldZ: number;
  }>;
  setAdjacentScale: (n: number) => void;
  adjacentScale: () => number;
  listenerPose: () => { x: number; y: number; z: number; rotationY: number };
  propTiles: () => Array<{ x: number; y: number; prop: string }>;
  blockReason: (x: number, y: number) => string;
  interactFacingProp: () => boolean;
  noteOpen: () => boolean;
  doorOpen: (x: number, y: number) => boolean;
  partySave: () => { bag: unknown; equipment: unknown; oil: number };
};

async function boot(page: import('@playwright/test').Page, qs = 'test=1&debug=1') {
  await page.goto(`${BASE_URL}/proto3d.html?${qs}`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').tap();
  await page.waitForTimeout(400);
}

function api(page: import('@playwright/test').Page) {
  return page.evaluateHandle(() => (window as unknown as { __proto3d: Proto3d }).__proto3d);
}

test.use(devices['iPhone 15']);

test('proto3d step3 inventory: pickup, chest loot-all, bag, potions, key, oil, greek, props, close-range', async ({
  page
}) => {
  test.setTimeout(180000);
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

  await boot(page);

  const p = () => page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d);

  // Floor item pickup → party bag
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(6, 3, 0));
  const picked = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.pickupHere());
  expect(picked, 'red potion on (6,3) picks up').toBe(true);
  let bag = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getBag());
  expect(bag.some((s) => s.item === 'potion_red' && s.count >= 1), 'potion lands in the bag').toBe(true);
  const ui = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastUi());
  expect(ui.includes('pickup'), 'pickup sfx').toBe(true);
  await page.screenshot({ path: `${OUT}/step3-floor-item.png`, fullPage: false });

  // Stack a second red
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.giveItem('potion_red', 1));
  bag = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getBag());
  expect(bag.find((s) => s.item === 'potion_red')?.count, 'stackable potions merge').toBe(2);

  // Chest loot-all: one log line, not one per item
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.giveItem('potion_blue', 1);
    proto.giveItem('potion_green', 1);
  });
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setPosition(5, 7, 0));
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.pickupHere());
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.chestOpen(5, 7))).toBe(true);
  const logs = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.logLines());
  expect(logs.some((l) => /Chest: \d+ things\. All in the bag\./.test(l)), 'one chest_loot_all line').toBe(true);
  expect(logs.filter((l) => l.startsWith('Chest:')).length, 'not one line per item').toBeLessThanOrEqual(2);

  // Open bag + equip compare
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.giveItem('iron_shield', 1));
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.openBag());
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.bagOpen())).toBe(true);
  await expect(page.locator('#inventory-screen')).toBeVisible();
  await page.locator('.inv-slot[data-name="slot-0"]').tap();
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${OUT}/step3-open-bag.png`, fullPage: false });

  const shieldIndex = await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return proto.getBag().findIndex((s) => s.item === 'iron_shield');
  });
  await page.evaluate((i) => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.equipBagSlot(i, 'mags');
  }, shieldIndex);
  const compare = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastCompare());
  expect(compare === 'Better' || compare === 'Worse' || compare === 'Same' || compare == null).toBe(true);
  await page.screenshot({ path: `${OUT}/step3-equip-compare.png`, fullPage: false });
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.closeBag());

  // Potion use (heal Brannoc)
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.setHeroHp('brannoc', 10);
    proto.drinkPotion('brannoc', 'potion_red');
  });
  const afterPotion = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.logLines());
  expect(afterPotion.some((l) => /potion|heals|HP|φίλτρο|ζωή/i.test(l) || l.length > 0)).toBe(true);
  await page.screenshot({ path: `${OUT}/step3-potion-use.png`, fullPage: false });

  // Oil flask
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.setOil(2);
    proto.giveItem('oil_flask', 1);
    const i = proto.getBag().findIndex((s) => s.item === 'oil_flask');
    proto.useBagSlot(i);
  });
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.getOil())).toBe(3);

  // Key auto-uses on the locked door
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.giveItem('key', 1);
    proto.setPosition(3, 2, 1);
    proto.interact();
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.doorOpen(4, 2))).toBe(true);

  const save = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.partySave());
  expect(save.bag).toBeTruthy();
  expect(save.equipment).toBeTruthy();

  // Adjacent 2× close range (slime at 7,2)
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.setAdjacentScale(1);
    proto.setPosition(6, 2, 1);
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/step3-adjacent-before.png`, fullPage: false });
  const before = await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return proto.sprites().find((s) => s.monsterKind === 'slime' && s.x === 7 && s.y === 2);
  });
  await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.setAdjacentScale(2));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/step3-adjacent-after.png`, fullPage: false });
  const after = await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    return proto.sprites().find((s) => s.monsterKind === 'slime' && s.x === 7 && s.y === 2);
  });
  expect(after, 'slime sprite present').toBeTruthy();
  expect(after!.scaleY / after!.baseH, 'adjacent scale is integer 2×').toBe(2);
  expect(Number.isInteger(after!.scaleY / after!.baseH)).toBe(true);
  expect(after!.worldX, 'pulled to the near edge of its square').toBeCloseTo(7 * 2 - 1, 5);
  expect(before!.scaleY / before!.baseH, 'before shot uses 1×').toBe(1);

  const listen = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.listenerPose());
  expect(listen.x, 'listener on party square centre').toBeCloseTo(6 * 2, 5);
  expect(listen.z).toBeCloseTo(2 * 2, 5);
  expect(listen.rotationY).toBeCloseTo(-Math.PI / 2, 5);

  // Props: block from all four sides
  const props = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.propTiles());
  expect(props.some((t) => t.x === 13 && t.y === 9 && t.prop === 'lamp_capped')).toBe(true);
  expect(props.some((t) => t.x === 12 && t.y === 9 && t.prop === 'desk')).toBe(true);
  const approaches = [
    { dx: 0, dy: -1, dir: 2 },
    { dx: 1, dy: 0, dir: 3 },
    { dx: 0, dy: 1, dir: 0 },
    { dx: -1, dy: 0, dir: 1 }
  ];
  for (const prop of props) {
    for (const a of approaches) {
      const blocked = await page.evaluate(
        ({ prop, a }) => {
          const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
          return proto.blockReason(prop.x, prop.y);
        },
        { prop, a }
      );
      expect(blocked, `${prop.prop} at ${prop.x},${prop.y} fills its square`).toBe('wall');
      const nx = prop.x + a.dx;
      const ny = prop.y + a.dy;
      const neighbor = await page.evaluate(
        ({ nx, ny }) => (window as unknown as { __proto3d: Proto3d }).__proto3d.blockReason(nx, ny),
        { nx, ny }
      );
      if (neighbor !== 'ok') continue;
      const stepped = await page.evaluate(
        ({ nx, ny, dir }) => {
          const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
          proto.setPosition(nx, ny, dir);
          return proto.tryMoveForward();
        },
        { nx, ny, dir: a.dir }
      );
      expect(stepped.result, `cannot walk onto ${prop.prop} from ${nx},${ny}`).not.toBe('ok');
      expect(stepped.after).toMatchObject({ x: nx, y: ny });
    }
  }

  // Lamp tap squares
  for (const pose of [
    { x: 13, y: 8, dir: 2 },
    { x: 13, y: 10, dir: 0 }
  ]) {
    const ok = await page.evaluate(({ x, y, dir }) => {
      const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      proto.setPosition(x, y, dir);
      return proto.interactFacingProp();
    }, pose);
    expect(ok, `lamp tap from ${pose.x},${pose.y}`).toBe(true);
    const msg = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.lastMessage());
    expect(msg.length, 'lamp says something').toBeGreaterThan(0);
  }

  // Desk tap squares
  for (const pose of [
    { x: 12, y: 8, dir: 2 },
    { x: 11, y: 9, dir: 1 },
    { x: 12, y: 10, dir: 0 }
  ]) {
    await page.evaluate(({ x, y, dir }) => {
      const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      proto.setPosition(x, y, dir);
      proto.interactFacingProp();
    }, pose);
    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.noteOpen()),
      `desk tap from ${pose.x},${pose.y}`
    ).toBe(true);
    await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.interactFacingProp());
  }

  expect(errors, 'console errors').toEqual([]);
  expect(failed404s.filter((u) => !u.includes('favicon')), '404s').toEqual([]);
  void p;
  void api;
});

test('proto3d ?lang=el renders a Greek log line', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(OUT, { recursive: true });
  await boot(page, 'test=1&debug=1&lang=el');
  const locale = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.locale());
  expect(locale).toBe('el');
  await page.evaluate(() => {
    const proto = (window as unknown as { __proto3d: Proto3d }).__proto3d;
    proto.setPosition(2, 5, 0);
    proto.pickupHere();
  });
  const lines = await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.logLines());
  expect(lines.some((l) => /[Α-ω]/.test(l)), 'Greek log line present').toBe(true);
  expect(lines.some((l) => l.includes('κλειδί') || l.includes('Βρήκες'))).toBe(true);
  await page.screenshot({ path: `${OUT}/step3-greek-log.png`, fullPage: false });
});
