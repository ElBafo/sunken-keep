import { test, expect, devices } from '@playwright/test';
import { DIR_DELTA, wallPropRoom } from '../../src/proto3d/constants';
import { PROP_WALL_DIR, type PropWall } from '../../src/proto3d/wall-props';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const RUNS = 20;

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  tryMoveBackward: () => { result: string; after: { x: number; y: number; dir: number } };
  beginNearBandLog: () => void;
  endNearBandLog: () => Array<{ t: number; items: Array<{ kind: string; x: number; y: number }> }>;
  nearBandVisible: () => Array<{ kind: string; x: number; y: number }>;
  torchStates: () => Array<{ x: number; y: number; face: string }>;
};

test.use(devices['iPhone 15']);

function backIntoSconce(s: { x: number; y: number; face: string }) {
  const room = wallPropRoom(s.x, s.y, s.face as PropWall);
  const dir = PROP_WALL_DIR[s.face as PropWall];
  const [dx, dy] = DIR_DELTA[dir];
  return { fromX: room.x + dx, fromY: room.y + dy, dir };
}

test('full multi-page build: no wall-mount flash on 20 back-steps per mount', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  // Voxel-lab is a sibling entry of this preview build; the game page must
  // still boot and cull on its own three.js camera.
  expect(await page.locator('#lab-canvas').count()).toBe(0);

  const sconces = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates()
  );
  expect(sconces.length, 'floor-1 sconces').toBe(9);

  const paths: Array<{ name: string; fromX: number; fromY: number; dir: number }> = sconces.map((s) => ({
    name: `sconce ${s.x},${s.y} ${s.face}`,
    ...backIntoSconce(s)
  }));
  paths.push({ name: "Pell's lamp", fromX: 12, fromY: 9, dir: 3 });
  paths.push({ name: 'jar rack', fromX: 10, fromY: 10, dir: 1 });
  expect(paths.length).toBe(11);

  const flashes: string[] = [];
  for (const path of paths) {
    for (let run = 0; run < RUNS; run++) {
      const result = await page.evaluate(
        async ([x, y, dir]) => {
          const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
          p.setPosition(x, y, dir);
          p.beginNearBandLog();
          const moved = p.tryMoveBackward();
          const t0 = performance.now();
          while (performance.now() - t0 < 420) {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
          return { moved, log: p.endNearBandLog(), leftover: p.nearBandVisible() };
        },
        [path.fromX, path.fromY, path.dir] as const
      );
      if (result.moved.result !== 'ok') continue;
      if (result.log.length || result.leftover.length) {
        flashes.push(
          `${path.name} run ${run + 1}/${RUNS} log=${JSON.stringify(result.log)} leftover=${JSON.stringify(result.leftover)}`
        );
      }
    }
  }

  expect(flashes, flashes.slice(0, 6).join('\n')).toEqual([]);
});
