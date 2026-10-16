import { mkdirSync, writeFileSync } from 'fs';
import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173/sunken-keep';
const OUT = '/opt/cursor/artifacts/screenshots';

type Face = {
  kind: string;
  lightX: number;
  lightY: number;
  face?: string;
  cellX?: number;
  cellY?: number;
  voxelMesh?: boolean;
  secretReveal?: boolean;
  matVisible?: boolean;
};

type Passage = {
  want: Array<{ cellX: number; cellY: number; face: string }>;
  have: Array<{
    cellX: number;
    cellY: number;
    face: string;
    visible: boolean;
    voxel: boolean;
    reveal: boolean;
  }>;
};

type Region = { luma: number; fogRatio: number; n: number; r: number; g: number; b: number };

type Proto3d = {
  ready?: boolean;
  setPosition: (x: number, y: number, dir: number) => void;
  setFlickerFrame: (frame: number) => void;
  setLabLight: (on: boolean) => Promise<void> | void;
  setVoxel: (on: boolean) => Promise<void> | void;
  labLight: () => boolean;
  voxel: () => boolean;
  openSecret: (x: number, y: number) => boolean;
  secretOpen: (x: number, y: number) => boolean;
  secretPassage: (x: number, y: number) => Passage;
  faceKinds: () => Face[];
  regionStats: (x0: number, y0: number, x1: number, y1: number) => Region;
};

test.use(devices['iPhone 15']);

const MODES = [
  { name: 'classic_flat', lab: false, voxel: false },
  { name: 'classic_voxel', lab: false, voxel: true },
  { name: 'lab_flat', lab: true, voxel: false },
  { name: 'lab_voxel', lab: true, voxel: true }
] as const;

const SECRETS = [
  { name: 'journal_5_13', x: 5, y: 13, standX: 6, standY: 13, dir: 3 },
  { name: 'carving_5_1', x: 5, y: 1, standX: 6, standY: 1, dir: 3 }
] as const;

function passageCovered(pass: Passage): boolean {
  return pass.want.every((w) =>
    pass.have.some((h) => h.cellX === w.cellX && h.cellY === w.cellY && h.face === w.face && h.visible)
  );
}

test('opening a secret keeps neighbor walls in all four look combos', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto(`${BASE_URL}/proto3d.html?test=1&debug=1`);
  await page.waitForFunction(
    () => (window as unknown as { __proto3d?: { ready?: boolean } }).__proto3d?.ready === true,
    null,
    { timeout: 25000 }
  );
  await page.locator('#tap-to-start').click({ force: true });
  await page.waitForTimeout(500);

  const report: Record<string, unknown> = {};

  for (const mode of MODES) {
    await page.evaluate(async ({ lab, voxel }) => {
      const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
      await p.setLabLight(lab);
      await p.setVoxel(voxel);
      p.setFlickerFrame(0);
    }, mode);

    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.labLight())
    ).toBe(mode.lab);
    expect(
      await page.evaluate(() => (window as unknown as { __proto3d: Proto3d }).__proto3d.voxel())
    ).toBe(mode.voxel);

    for (const secret of SECRETS) {
      await page.evaluate(({ x, y, dir }) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        p.setFlickerFrame(0);
        p.setPosition(x, y, dir);
      }, { x: secret.standX, y: secret.standY, dir: secret.dir });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${OUT}/secret_${mode.name}_${secret.name}_closed.png`,
        fullPage: false
      });

      const opened = await page.evaluate(
        ({ x, y }) => (window as unknown as { __proto3d: Proto3d }).__proto3d.openSecret(x, y),
        { x: secret.x, y: secret.y }
      );
      expect(opened, `${mode.name} ${secret.name} opens`).toBe(true);
      await page.waitForTimeout(280);
      await page.screenshot({
        path: `${OUT}/secret_${mode.name}_${secret.name}_open.png`,
        fullPage: false
      });

      const result = await page.evaluate(({ x, y }) => {
        const p = (window as unknown as { __proto3d: Proto3d }).__proto3d;
        const canvas = document.querySelector('canvas');
        const w = canvas?.width ?? 420;
        const h = canvas?.height ?? 912;
        return {
          open: p.secretOpen(x, y),
          passage: p.secretPassage(x, y),
          center: p.regionStats(w * 0.32, h * 0.22, w * 0.68, h * 0.62),
          left: p.regionStats(w * 0.04, h * 0.22, w * 0.22, h * 0.62),
          right: p.regionStats(w * 0.78, h * 0.22, w * 0.96, h * 0.62),
          far: p.regionStats(w * 0.34, h * 0.2, w * 0.66, h * 0.48)
        };
      }, { x: secret.x, y: secret.y });

      report[`${mode.name}_${secret.name}`] = result;
      expect(result.open, `${mode.name} ${secret.name} stays open`).toBe(true);
      expect(result.passage.want.length, `${mode.name} ${secret.name} wants neighbor faces`).toBeGreaterThan(0);
      expect(passageCovered(result.passage), `${mode.name} ${secret.name} missing ${JSON.stringify(result.passage)}`).toBe(
        true
      );
      expect(result.center.luma, `${mode.name} ${secret.name} passage is not a black pit`).toBeGreaterThan(6);
      expect(result.far.luma, `${mode.name} ${secret.name} far wall is not missing`).toBeGreaterThan(6);
    }
  }

  writeFileSync(`${OUT}/secret_wall_report.json`, JSON.stringify(report, null, 2));
  console.log('SECRET_WALL', JSON.stringify(report));
});
