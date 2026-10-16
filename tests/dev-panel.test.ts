import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { floor1 } from '../src/proto3d/floor-data';
import {
  COMPARE_PARTY,
  compareEnemyTile,
  cycleCombos,
  cycleTable,
  devFromSearch,
  frameWindowStats,
  internalPixelSize,
  isDevResMode,
  pushTimedSample,
  snapshotSlug,
  type DevSnapshot,
  type TimedSample
} from '../src/proto3d/dev-opt-in';
import { buildMonsterVolume, parseMonsterDef } from '../src/voxel-lab/monster-builder';

function snap(over: Partial<DevSnapshot> = {}): DevSnapshot {
  return {
    res: 270,
    pixelW: 270,
    pixelH: 380,
    light: 'classic',
    voxel: false,
    enemy: 'slime',
    dist: 1,
    compare: true,
    fps: 60,
    avg: 16.7,
    p95: 18.2,
    draws: 40,
    palette: true,
    ...over
  };
}

describe('dev opt-in', () => {
  it('is off unless ?dev=1', () => {
    expect(devFromSearch(new URLSearchParams(''))).toBe(false);
    expect(devFromSearch(new URLSearchParams('debug=1'))).toBe(false);
    expect(devFromSearch(new URLSearchParams('dev=0'))).toBe(false);
    expect(devFromSearch(new URLSearchParams('dev=1'))).toBe(true);
    expect(devFromSearch(new URLSearchParams('dev=true'))).toBe(true);
  });

  it('keeps 270/380 aspect across 360, 480, and native width', () => {
    expect(internalPixelSize(270, 270, 380, 1179)).toEqual({ w: 270, h: 380 });
    expect(internalPixelSize(360, 270, 380, 1179)).toEqual({ w: 360, h: 507 });
    expect(internalPixelSize(480, 270, 380, 1179)).toEqual({ w: 480, h: 676 });
    const native = internalPixelSize('native', 270, 380, 1179);
    expect(native.w).toBe(1179);
    expect(native.h).toBe(Math.round(1179 * (380 / 270)));
    expect(isDevResMode(270)).toBe(true);
    expect(isDevResMode(720)).toBe(false);
  });

  it('compare pose looks north at 1 and 2 empty squares', () => {
    expect(COMPARE_PARTY).toEqual({ x: 1, y: 7, dir: 0 });
    expect(compareEnemyTile(1)).toEqual({ x: 1, y: 6 });
    expect(compareEnemyTile(2)).toEqual({ x: 1, y: 5 });
    for (const { x, y } of [COMPARE_PARTY, compareEnemyTile(1), compareEnemyTile(2)]) {
      const tile = floor1.tiles[y][x];
      expect(tile.wall, `${x},${y} walkable`).toBeFalsy();
    }
  });

  it('cycles every resolution × lighting pair', () => {
    const combos = cycleCombos();
    expect(combos).toHaveLength(8);
    expect(combos.map((c) => `${c.res}/${c.light}`)).toEqual([
      '270/classic',
      '270/lab',
      '360/classic',
      '360/lab',
      '480/classic',
      '480/lab',
      'native/classic',
      'native/lab'
    ]);
  });

  it('avg / p95 cover the last ~5 s window', () => {
    const samples: TimedSample[] = [];
    pushTimedSample(samples, 1000, 10);
    pushTimedSample(samples, 2000, 20);
    pushTimedSample(samples, 6500, 30);
    expect(samples.map((s) => s.ms)).toEqual([20, 30]);
    const stats = frameWindowStats([
      { t: 1, ms: 10 },
      { t: 2, ms: 12 },
      { t: 3, ms: 40 }
    ]);
    expect(stats.n).toBe(3);
    expect(stats.avg).toBeCloseTo(62 / 3, 5);
    expect(stats.p95).toBe(40);
  });

  it('names captures from overlay values', () => {
    expect(snapshotSlug(snap())).toBe('sk-270x380-classic-vxoff-slime-1sq-60fps-16p7avg-18p2p95');
    expect(snapshotSlug(snap({ res: 'native', pixelW: 1179, pixelH: 1658, light: 'lab', voxel: true, enemy: 'ooze', dist: 2 }))).toContain(
      'native1179x1658-lab-vxon-ooze-2sq'
    );
    const table = cycleTable([{ ...snap(), holdMs: 5012 }]);
    expect(table.split('\n')[0]).toContain('avg_ms');
    expect(table).toContain('270\tclassic\t270x380');
  });
});

describe('dev tools stay out of the player menu', () => {
  it('does not add resolution or capture to the ≡ settings sheet', () => {
    const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
    const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    for (const html of [proto, index]) {
      expect(html).not.toContain('id="dev-panel"');
      expect(html).not.toContain('id="dev-capture"');
      expect(html).not.toContain('Internal render');
      expect(html).toContain('id="settings-lab-light-label"');
    }
  });

  it('loads the panel and ooze builder only behind ?dev=1', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain("from './dev-opt-in'");
    expect(main).toContain("await import('./dev-panel')");
    expect(main).toContain("await import('./dev-ooze')");
    expect(main).toMatch(/import type \{ DevPanel \} from '\.\/dev-panel'/);
    expect(main).toMatch(/import type \{ DevOoze \} from '\.\/dev-ooze'/);
    expect(main).not.toContain("from '../voxel-lab/monster-builder'");
    expect(main).not.toContain('id="btn-dev');
    const opt = readFileSync(resolve(__dirname, '../src/proto3d/dev-opt-in.ts'), 'utf8');
    expect(opt).not.toContain('three');
    expect(opt).not.toContain('voxel-lab');
  });
});

describe('Gray Ooze builder reuse', () => {
  it('builds the PR #41 volume from gray_ooze.json', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../public/lab/monsters/gray_ooze.json'), 'utf8'));
    const def = parseMonsterDef(raw);
    expect(def.id).toBe('gray_ooze');
    expect(def.animations.idle.pulse).toBeCloseTo(0.04);
    expect(def.animations.idle.hz).toBeCloseTo(0.28);
    const built = buildMonsterVolume(def, def.defaultResolution);
    expect(built.voxelCount).toBeGreaterThan(80);
    expect(built.peakHeight).toBeGreaterThan(0.2);
    expect(built.peakHeight).toBeLessThan(0.8);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
