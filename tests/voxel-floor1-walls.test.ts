import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { WALL_BULGE_FRAC, WALL_VARIANTS } from '../src/voxel-floor1/constants';
import { enumerateFaces, floor1Map } from '../src/voxel-floor1/layout';
import { knotWallFile } from '../src/voxel-floor1/knot-walls';
import { isBeamCeiling } from '../src/voxel-floor1/crack';
import { floor1Sunbeams } from '../src/voxel-floor1/fixtures';
import {
  applyWallLook,
  DARK_ZONES,
  decorFace,
  floor1DecorFaces,
  lookForSecret,
  lookForWall,
  uniqueLooks,
  wallKind
} from '../src/voxel-floor1/wall-look';

const ALONG: Record<string, Array<[number, number]>> = {
  N: [
    [-1, 0],
    [1, 0]
  ],
  S: [
    [-1, 0],
    [1, 0]
  ],
  E: [
    [0, -1],
    [0, 1]
  ],
  W: [
    [0, -1],
    [0, 1]
  ]
};

function fakePng(fill: [number, number, number] = [110, 108, 102]): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const W = 32;
  const H = 32;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}

describe('floor-1 wall looks from Levie JSON', () => {
  it('covers every voxel wall face with four variants and no neighbour twins', () => {
    expect(floor1DecorFaces).toHaveLength(155);
    const jobs = enumerateFaces(floor1Map).filter((j) => j.kind === 'wall');
    for (const job of jobs) {
      if (knotWallFile(job.wallX, job.wallY, job.wallFace)) continue;
      const look = lookForWall(job.wallX, job.wallY, job.wallFace);
      if (!look) continue;
      expect(job.look?.key).toBe(look.key);
      expect(job.batch).toBe(look.key);
      expect(WALL_VARIANTS).toContain(look.file);
    }
    for (const face of floor1DecorFaces) {
      for (const [dx, dy] of ALONG[face.face]) {
        const other = decorFace(face.x + dx, face.y + dy, face.face);
        if (!other) continue;
        expect(face.variant).not.toBe(other.variant);
      }
    }
  });

  it('maps zone materials, seepage, and the three 0.04 bulges', () => {
    expect(WALL_BULGE_FRAC).toBe(0.04);
    expect(wallKind(decorFace(0, 6, 'E')!)).toBe('ashlar');
    expect(wallKind(decorFace(4, 6, 'W')!)).toBe('brick');
    expect(lookForWall(8, 1, 'E')?.kind).toBe('banded');
    expect(lookForWall(4, 6, 'E')?.kind).toBe('plaster');
    expect(lookForWall(9, 7, 'S')?.kind).toBe('soot');
    expect(lookForWall(15, 1, 'S')?.kind).toBe('etched');
    const bulges = floor1DecorFaces.filter((f) => f.bulge);
    expect(bulges).toHaveLength(3);
    expect(bulges.map((f) => `${f.x},${f.y},${f.face}`).sort()).toEqual(['1,11,E', '21,9,W', '8,12,W']);
    for (const job of enumerateFaces(floor1Map).filter((j) => j.bulge)) {
      expect(job.bulge).toBe(WALL_BULGE_FRAC);
    }
    const wet = floor1DecorFaces.filter((f) => f.outerShell && !DARK_ZONES.has(f.zone));
    const darkShell = floor1DecorFaces.filter((f) => f.outerShell && DARK_ZONES.has(f.zone));
    expect(wet.every((f) => f.seepage === 'wet_sheen')).toBe(true);
    expect(darkShell.every((f) => f.seepage === 'matte_dark')).toBe(true);
    expect(wet.length).toBeGreaterThan(10);
    expect(uniqueLooks().length).toBeGreaterThan(8);
  });

  it('recolours texels without a floor-line tide stain', () => {
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/wall-look.ts'), 'utf8');
    expect(src).toContain('No tide lines or floor-line stains');
    expect(src).not.toContain('water stain');
    expect(src).not.toContain('barnacle');
    const plaster = applyWallLook(fakePng(), {
      key: 'wall:plaster:clean:dry',
      file: WALL_VARIANTS[0],
      kind: 'plaster',
      variant: 'clean',
      seepage: null,
      zone: 'pantry',
      bulge: 0
    });
    const i = (8 * 32 + 8) * 4;
    expect(plaster.data[i]).toBeGreaterThan(120);
    expect(plaster.data[i + 1]).toBeGreaterThan(118);
    const soot = applyWallLook(fakePng([90, 80, 70]), {
      key: 'wall:soot:clean:dry',
      file: WALL_VARIANTS[0],
      kind: 'soot',
      variant: 'clean',
      seepage: null,
      zone: 'pell',
      bulge: 0
    });
    expect(soot.data[i] + soot.data[i + 1] + soot.data[i + 2]).toBeLessThan(90 * 3 * 0.6);
  });

  it('copies a neighbour look onto secret walls and keeps the odd brick as a recess', () => {
    const look = lookForSecret(5, 1, 'W', 4, 1);
    expect(look.bulge).toBe(0);
    expect(look.key.startsWith('wall:')).toBe(true);
    expect(WALL_VARIANTS).toContain(look.file);
  });

  it('cracks only the water square and the guard-hall debris square', () => {
    const cracked = enumerateFaces(floor1Map).filter(
      (j) => j.kind === 'ceiling' && isBeamCeiling(j.tx, j.tz, floor1Sunbeams)
    );
    expect(cracked.map((j) => `${j.tx},${j.tz}`).sort()).toEqual(['10,1', '2,2']);
    expect(isBeamCeiling(2, 6, floor1Sunbeams)).toBe(false);
    expect(isBeamCeiling(11, 2, floor1Sunbeams)).toBe(false);
  });

  it('does not import proto3d and keeps knot walls on their own file', () => {
    const dir = resolve(__dirname, '../src/voxel-floor1');
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
    }
    const layout = readFileSync(resolve(dir, 'layout.ts'), 'utf8');
    expect(layout).toContain('knotWallFile');
    expect(layout).toContain('lookForWall');
    const level = readFileSync(resolve(dir, 'level.ts'), 'utf8');
    expect(level).toContain('applyWallLook');
    expect(level).toContain('bulgeWorld');
    expect(level).toContain('finishVolume');
  });
});
