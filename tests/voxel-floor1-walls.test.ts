import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { WALL_BULGE_FRAC } from '../src/voxel-floor1/constants';
import { enumerateFaces, floor1Map } from '../src/voxel-floor1/layout';
import { knotWallFile } from '../src/voxel-floor1/knot-walls';
import { isBeamCeiling } from '../src/voxel-floor1/crack';
import { floor1Sunbeams } from '../src/voxel-floor1/fixtures';
import {
  artieFileFor,
  DARK_ZONES,
  decorFace,
  FLOOR1_WALL_FILES,
  floor1DecorFaces,
  lookForSecret,
  lookForWall,
  STRONG,
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

function facesOf(kind: string) {
  return floor1DecorFaces.filter((f) => wallKind(f) === kind);
}

describe('floor-1 walls use Artie painted tiles', () => {
  it('covers every voxel wall face from the decor table', () => {
    expect(floor1DecorFaces).toHaveLength(155);
    const jobs = enumerateFaces(floor1Map).filter((j) => j.kind === 'wall');
    for (const job of jobs) {
      if (knotWallFile(job.wallX, job.wallY, job.wallFace)) continue;
      const look = lookForWall(job.wallX, job.wallY, job.wallFace);
      if (!look) continue;
      expect(job.look?.key).toBe(look.key);
      expect(job.batch).toBe(look.key);
      expect(job.file).toBe(look.file);
      expect(FLOOR1_WALL_FILES).toContain(look.file);
    }
  });

  it('maps zone materials onto the painted files and keeps the three 0.04 bulges', () => {
    expect(WALL_BULGE_FRAC).toBe(0.04);
    expect(wallKind(decorFace(0, 6, 'E')!)).toBe('ashlar');
    expect(lookForWall(0, 6, 'E')?.file.startsWith('walls_floor1/ashlar_')).toBe(true);
    expect(lookForWall(4, 6, 'W')?.file.startsWith('walls_floor1/brick_')).toBe(true);
    expect(lookForWall(8, 1, 'E')?.file.startsWith('walls_floor1/banded_')).toBe(true);
    expect(lookForWall(4, 6, 'E')?.file.startsWith('walls_floor1/plaster_')).toBe(true);
    expect(lookForWall(9, 7, 'S')?.file.startsWith('walls_floor1/soot_')).toBe(true);
    expect(lookForWall(15, 1, 'S')?.file.startsWith('walls_floor1/etched_')).toBe(true);
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
    expect(uniqueLooks().every((l) => FLOOR1_WALL_FILES.includes(l.file as (typeof FLOOR1_WALL_FILES)[number]))).toBe(
      true
    );
  });

  it('keeps strong-feature tiles sparse and not adjacent along a run', () => {
    const check = (kind: 'ashlar' | 'brick' | 'plaster', file: string) => {
      const faces = facesOf(kind);
      const hits = faces.filter((f) => artieFileFor(f.x, f.y, f.face) === file);
      const target = Math.max(1, Math.round(faces.length / 5));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThanOrEqual(target);
      for (const f of hits) {
        for (const [dx, dy] of ALONG[f.face]) {
          expect(artieFileFor(f.x + dx, f.y + dy, f.face)).not.toBe(file);
        }
      }
    };
    check('ashlar', STRONG.ashlar_patched);
    check('brick', STRONG.brick_missing);
    check('plaster', STRONG.plaster_flaking_2);
  });

  it('uses soot_brick_1 on one wall row only', () => {
    const soot = facesOf('soot');
    const row = soot.filter((f) => artieFileFor(f.x, f.y, f.face) === 'walls_floor1/soot_brick_1.png');
    const ys = new Set(row.map((f) => f.y));
    expect(ys.size).toBe(1);
    const y = [...ys][0];
    expect(soot.some((f) => f.y !== y && artieFileFor(f.x, f.y, f.face) === 'walls_floor1/soot_brick_1.png')).toBe(
      false
    );
  });

  it('does not recolour tiles or paint a floor-line tide stain', () => {
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/wall-look.ts'), 'utf8');
    expect(src).not.toContain('applyWallLook');
    expect(src).not.toContain('tide line');
    expect(src).not.toContain('barnacle');
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).not.toContain('applyWallLook');
    expect(level).toContain('bulgeWorld');
    expect(level).toContain('finishVolume');
  });

  it('copies a neighbour look onto secret walls', () => {
    const look = lookForSecret(5, 1, 'W', 4, 1);
    expect(look.bulge).toBe(0);
    expect(look.file.startsWith('walls_floor1/')).toBe(true);
  });

  it('cracks only the water square and the guard-hall debris square', () => {
    const cracked = enumerateFaces(floor1Map).filter(
      (j) => j.kind === 'ceiling' && isBeamCeiling(j.tx, j.tz, floor1Sunbeams)
    );
    expect(cracked.map((j) => `${j.tx},${j.tz}`).sort()).toEqual(['10,1', '2,2']);
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
  });
});
