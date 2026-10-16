import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const RUNS = 20;

const FACE_INTO_ROOM: Record<string, { nx: number; nz: number }> = {
  N: { nx: 0, nz: -1 },
  E: { nx: 1, nz: 0 },
  S: { nx: 0, nz: 1 },
  W: { nx: -1, nz: 0 }
};
const DIR_DELTA = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;
const PROP_WALL_DIR: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };

type MoveResult = { result: string; after: { x: number; y: number; dir: number } };
type NearHit = { t: number; items: Array<{ kind: string; x: number; y: number }> };

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  tryMoveBackward: () => MoveResult;
  tryMoveForward: () => MoveResult;
  beginNearBandLog: () => void;
  endNearBandLog: () => NearHit[];
  nearBandVisible: () => Array<{ kind: string; x: number; y: number }>;
  torchStates: () => Array<{ x: number; y: number; face: string }>;
};

test.use(devices['iPhone 15']);

function backIntoSconce(s: { x: number; y: number; face: string }) {
  const into = FACE_INTO_ROOM[s.face];
  const room = { x: s.x + into.nx, y: s.y + into.nz };
  const dir = PROP_WALL_DIR[s.face];
  const [dx, dy] = DIR_DELTA[dir];
  return { fromX: room.x + dx, fromY: room.y + dy, dir };
}

test('full multi-page build: 20 backs each, 0 flashes, all 11 mounts', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click();
  await page.waitForTimeout(400);

  expect(await page.locator('#lab-canvas').count(), 'game page must not mount voxel-lab').toBe(0);

  const sconces = await page.evaluate(() =>
    (window as unknown as { __proto3d: Proto3d }).__proto3d.torchStates()
  );
  expect(sconces.length, 'floor-1 sconces').toBe(9);

  type Path = { name: string; fromX: number; fromY: number; dir: number; move: 'back' | 'forward' };
  const paths: Path[] = sconces.map((s) => ({
    name: `sconce ${s.x},${s.y} ${s.face} back-into`,
    ...backIntoSconce(s),
    move: 'back'
  }));
  // Exact Testie poses
  paths.push({ name: "Pell's lamp from (12,9) facing east", fromX: 12, fromY: 9, dir: 1, move: 'back' });
  paths.push({ name: "Pell's lamp step onto (13,9) facing east", fromX: 12, fromY: 9, dir: 1, move: 'forward' });
  paths.push({ name: 'jar rack from (9,10) facing west', fromX: 9, fromY: 10, dir: 3, move: 'back' });
  paths.push({ name: 'jar rack back-into from (10,10)', fromX: 10, fromY: 10, dir: 1, move: 'back' });

  const flashes: string[] = [];
  const counts: Record<string, number> = {};

  for (const path of paths) {
    counts[path.name] = 0;
    for (let run = 0; run < RUNS; run++) {
      const result = await page.evaluate(
        async ([x, y, dir, move]) => {
          const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
          p.setPosition(x, y, dir);
          p.beginNearBandLog();
          const moved = move === 'forward' ? p.tryMoveForward() : p.tryMoveBackward();
          const t0 = performance.now();
          while (performance.now() - t0 < 420) {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
          return { moved, log: p.endNearBandLog(), leftover: p.nearBandVisible() };
        },
        [path.fromX, path.fromY, path.dir, path.move] as const
      );
      expect(
        result.moved.result,
        `${path.name} run ${run + 1} move=${path.move} from (${path.fromX},${path.fromY},${path.dir})`
      ).toBe('ok');
      counts[path.name] += 1;
      if (result.log.length || result.leftover.length) {
        flashes.push(
          `${path.name} run ${run + 1}/${RUNS} log=${JSON.stringify(result.log)} leftover=${JSON.stringify(result.leftover)}`
        );
      }
    }
  }

  for (const path of paths) {
    expect(counts[path.name], `${path.name} completed runs`).toBe(RUNS);
  }
  expect(flashes, flashes.slice(0, 8).join('\n')).toEqual([]);
});
