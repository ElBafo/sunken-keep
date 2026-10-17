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
  ASHLAR_ZONES,
  DARK_ZONES,
  decorFace,
  FLOOR1_WALL_FILES,
  floor1DecorFaces,
  lookForSecret,
  lookForWall,
  SOOT_2,
  STRONG,
  textureFile,
  uniqueLooks,
  wallKind,
  ZONE_FAMILY
} from '../src/voxel-floor1/wall-look';
import { STRONG_ONCE_BASE } from '../src/voxel-floor1/wall-once';

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

  it('uses each face texture field as the source of truth', () => {
    expect(floor1DecorFaces.every((f) => !!f.texture && !!f.wallFamily)).toBe(true);
    for (const f of floor1DecorFaces) {
      expect(artieFileFor(f.x, f.y, f.face)).toBe(textureFile(f));
      expect(artieFileFor(f.x, f.y, f.face)).toBe(`walls_floor1/${f.texture}.png`);
      expect(lookForWall(f.x, f.y, f.face)?.file).toBe(`walls_floor1/${f.texture}.png`);
    }
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/wall-look.ts'), 'utf8');
    expect(src).not.toContain('placeSparse');
    expect(src).not.toContain('capStrong');
    expect(src).not.toContain('assignSoot');
  });

  it('maps zone materials onto the painted files and keeps the three 0.04 bulges', () => {
    expect(WALL_BULGE_FRAC).toBe(0.04);
    expect(wallKind(decorFace(0, 6, 'E')!)).toBe('ashlar');
    expect(lookForWall(0, 6, 'E')?.file.startsWith('walls_floor1/ashlar_')).toBe(true);
    expect(lookForWall(4, 6, 'W')?.file.startsWith('walls_floor1/ashlar_')).toBe(true);
    expect(lookForWall(8, 1, 'E')?.file.startsWith('walls_floor1/banded_')).toBe(true);
    expect(lookForWall(4, 6, 'E')?.file.startsWith('walls_floor1/brick_')).toBe(true);
    expect(decorFace(4, 6, 'E')?.zone).toBe('pantry');
    expect(decorFace(4, 6, 'E')?.wallFamily).toBe('brick');
    expect(lookForWall(9, 7, 'S')?.file).toBe(SOOT_2);
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

  it('keeps strong-feature tiles at or below about 1 in 5 of that family', () => {
    const check = (kind: 'ashlar' | 'brick', file: string) => {
      const faces = facesOf(kind);
      const hits = faces.filter((f) => artieFileFor(f.x, f.y, f.face) === file);
      const target = Math.max(1, Math.round(faces.length / 5));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThanOrEqual(target);
    };
    check('ashlar', STRONG.ashlar_patched);
    check('brick', STRONG.brick_missing);
  });

  it('uses one stone type per room and never plaster on floor 1', () => {
    expect(FLOOR1_WALL_FILES.some((f) => f.includes('plaster'))).toBe(false);
    const texDir = resolve(__dirname, '../public/proto3d/tex3d/walls_floor1');
    expect(readdirSync(texDir).some((n) => n.includes('plaster'))).toBe(false);
    expect(readdirSync(texDir)).toEqual(
      expect.arrayContaining(['brick_patched.png', 'soot_brick_2.png', 'ashlar_damp.png'])
    );

    const kindsByZone = new Map<string, Set<string>>();
    const kindsByViewer = new Map<string, Set<string>>();
    const FACE_DELTA: Record<string, [number, number]> = {
      N: [0, -1],
      S: [0, 1],
      E: [1, 0],
      W: [-1, 0]
    };
    for (const f of floor1DecorFaces) {
      const kind = wallKind(f);
      expect(ZONE_FAMILY[f.zone]).toBe(kind);
      expect(artieFileFor(f.x, f.y, f.face)?.includes('plaster')).toBeFalsy();
      const zoneSet = kindsByZone.get(f.zone) ?? new Set();
      zoneSet.add(kind);
      kindsByZone.set(f.zone, zoneSet);
      const [dx, dy] = FACE_DELTA[f.face];
      const viewer = `${f.x + dx},${f.y + dy}`;
      const viewSet = kindsByViewer.get(viewer) ?? new Set();
      viewSet.add(kind);
      kindsByViewer.set(viewer, viewSet);
    }
    for (const [zone, kinds] of kindsByZone) {
      expect(kinds.size, zone).toBe(1);
    }
    for (const [viewer, kinds] of kindsByViewer) {
      expect(kinds.size, viewer).toBe(1);
    }
    expect(ASHLAR_ZONES.has('entry_gate')).toBe(true);
    expect(wallKind(decorFace(1, 13, 'E')!)).toBe('ashlar');
    expect(wallKind(decorFace(3, 13, 'W')!)).toBe('ashlar');
    expect(wallKind(decorFace(0, 6, 'E')!)).toBe('ashlar');
    expect(wallKind(decorFace(4, 6, 'W')!)).toBe('ashlar');
    expect(wallKind(decorFace(4, 6, 'E')!)).toBe('brick');
    const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
    expect(main).toContain("params.get('shot') === '1'");
    expect(main).toContain('window.devicePixelRatio');
  });

  it('uses soot_brick_2 on every Pell soot face', () => {
    const soot = facesOf('soot');
    expect(soot.length).toBeGreaterThan(0);
    expect(soot.every((f) => f.zone === 'pell')).toBe(true);
    expect(soot.every((f) => artieFileFor(f.x, f.y, f.face) === SOOT_2)).toBe(true);
    expect(soot.some((f) => (f.texture ?? '').includes('soot_brick_1'))).toBe(false);
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

  it('shows each strong-feature tile only once per face', () => {
    for (const f of floor1DecorFaces) {
      const look = lookForWall(f.x, f.y, f.face)!;
      const base = STRONG_ONCE_BASE[look.file];
      if (base) {
        expect(look.baseFile).toBe(base);
        expect(look.once).toBeDefined();
        expect(look.key).toMatch(/:once:\d+,\d+/);
        expect(look.file).toBe(`walls_floor1/${f.texture}.png`);
      } else {
        expect(look.once).toBeUndefined();
        expect(look.baseFile).toBeUndefined();
      }
    }
    expect(lookForWall(4, 7, 'E')?.file).toBe(STRONG.brick_missing);
    expect(lookForWall(4, 6, 'N')?.file).toBe(STRONG.ashlar_patched);
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/wall-once.ts'), 'utf8');
    expect(src).toContain('compositeStrongOnce');
    const once = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(once).toContain('lookPixels');
    expect(once).toContain('textureFromPixels');
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
