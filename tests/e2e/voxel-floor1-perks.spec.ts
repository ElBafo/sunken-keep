import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';

const BASE = '/sunken-keep/voxel-floor1.html?test=1&dev=1';
const OUT = '/opt/cursor/artifacts/screenshots';

type Floor1 = {
  ready?: boolean;
  addXp: (n: number) => void;
  finishFight: () => void;
  pendingPerks: () => Array<{ hero: string; level: number }>;
  perkScreenOpen: () => boolean;
  openPerkScreen: (id: string, level?: number) => boolean;
  closePerkScreen: () => void;
  playLevelUp: (id: string) => void;
  getHeroes: () => Array<{ id: string; hp: number; maxHp: number; state: string }>;
};

async function boot(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 420, height: 912 });
  await page.goto(BASE);
  await page.waitForFunction(
    () => (window as unknown as { __voxelFloor1?: { ready?: boolean } }).__voxelFloor1?.ready === true,
    null,
    { timeout: 60000 }
  );
}

test.use({ viewport: { width: 420, height: 912 }, hasTouch: true, isMobile: true });

test('voxel floor 1: perk pick and level-up badge', async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await boot(page);

  const leveled = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.addXp(220);
    api.playLevelUp('brannoc');
    return {
      pending: api.pendingPerks(),
      bagZ: window.getComputedStyle(document.getElementById('btn-bag')!).zIndex
    };
  });
  expect(leveled.pending.some((p) => p.hero === 'brannoc' && p.level === 3)).toBe(true);
  expect(Number(leveled.bagZ)).toBeGreaterThanOrEqual(100);

  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/voxel_floor1_levelup_perk_badge.png`, fullPage: false });

  const opened = await page.evaluate(() => {
    const api = (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1;
    api.openPerkScreen('brannoc', 3);
    return {
      open: api.perkScreenOpen(),
      title: document.getElementById('perk-title')?.textContent ?? '',
      sub: document.getElementById('perk-sub')?.textContent ?? '',
      desc: [...document.querySelectorAll('.perk-card-desc')].map((n) => n.textContent ?? ''),
      bagOnTop: (() => {
        const bag = document.getElementById('btn-bag')!;
        const r = bag.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(top && (top === bag || bag.contains(top)));
      })()
    };
  });
  expect(opened.open).toBe(true);
  expect(opened.title).toBe('Choose a gift');
  expect(opened.sub).toContain('Brannoc has grown. Pick one. It\'s for keeps.');
  expect(opened.desc.some((d) => d.includes('His shield covers both front heroes'))).toBe(true);
  expect(opened.bagOnTop).toBe(true);

  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/voxel_floor1_perk_pick.png`, fullPage: false });

  await page.locator('#btn-bag').tap();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __voxelFloor1: Floor1 }).__voxelFloor1.perkScreenOpen())).toBe(
    false
  );
});
