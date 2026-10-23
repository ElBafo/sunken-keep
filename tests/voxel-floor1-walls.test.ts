import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { WALL_BULGE_FRAC } from '../src/voxel-floor1/constants';
import { enumerateFaces, floor1Map, tileAt } from '../src/voxel-floor1/layout';
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
  faceUOffset,
  familyBaseFile,
  familyBaseForMissingFile,
  lookForSecret,
  lookForWall,
  lookForZoneBase,
  SOOT_2,
  SOOT_3,
  STRONG,
  textureFile,
  uniqueLooks,
  wallFileExists,
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
      if (!look) {
        expect(job.file).toBe(lookForZoneBase(job.tx, job.tz).file);
        expect(FLOOR1_WALL_FILES).toContain(job.file);
        continue;
      }
      if (tileAt(floor1Map, job.tx, job.tz)?.door) {
        expect(job.file).toBe(familyBaseFile(look.kind));
        expect(FLOOR1_WALL_FILES).toContain(job.file);
        continue;
      }
      expect(job.look?.key).toBe(look.key);
      expect(job.batch).toBe(look.key);
      expect(job.file).toBe(look.file);
      expect(FLOOR1_WALL_FILES).toContain(look.file);
    }
  });

  it('uses each face texture field as the source of truth', () => {
    expect(floor1DecorFaces.every((f) => !!f.texture && !!f.wallFamily)).toBe(true);
    for (const f of floor1DecorFaces) {
      const raw = textureFile(f);
      expect(artieFileFor(f.x, f.y, f.face)).toBe(raw);
      expect(artieFileFor(f.x, f.y, f.face)).toBe(`walls_floor1/${f.texture}.png`);
      const look = lookForWall(f.x, f.y, f.face);
      if (wallFileExists(raw)) expect(look?.file).toBe(raw);
      else expect(look?.file).toBe(familyBaseFile(wallKind(f)));
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
    expect(lookForWall(14, 9, 'W')?.file).toBe(SOOT_2);
    expect(lookForWall(9, 7, 'S')?.file).toBe('walls_floor1/brick_base.png');
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

  it('keeps Pell on brick, with soot only behind the lamp', () => {
    expect(ZONE_FAMILY.pell).toBe('brick');
    const pell = floor1DecorFaces.filter((f) => f.zone === 'pell');
    expect(pell.length).toBeGreaterThan(0);
    expect(pell.every((f) => wallKind(f) === 'brick')).toBe(true);
    expect(lookForWall(14, 9, 'W')?.file).toBe(SOOT_2);
    expect(artieFileFor(14, 10, 'W')).toBe(SOOT_3);
    expect(wallFileExists(SOOT_3)).toBe(true);
    expect(lookForWall(14, 10, 'W')?.file).toBe(SOOT_3);
    expect(familyBaseForMissingFile('walls_floor1/ashlar_ghost.png')).toBe(familyBaseFile('ashlar'));
    expect(familyBaseForMissingFile('walls_floor1/soot_brick_9.png', 'soot')).toBe(familyBaseFile('brick'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(lookForWall(14, 10, 'W')?.file).toBe(SOOT_3);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(pell.some((f) => (f.texture ?? '').includes('soot_brick_1'))).toBe(false);
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

  it('paints secret-wall nooks with the surrounding zone family base', () => {
    const jobs = enumerateFaces(floor1Map).filter((j) => j.kind === 'wall' && tileAt(floor1Map, j.tx, j.tz)?.secret);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(lookForWall(job.wallX, job.wallY, job.wallFace)).toBeUndefined();
      expect(job.file).toBe(lookForZoneBase(job.tx, job.tz).file);
      expect(job.file).toBe(familyBaseFile(ZONE_FAMILY[lookForZoneBase(job.tx, job.tz).zone]));
      expect(job.file).not.toMatch(/wall_plain/);
    }
    expect(lookForZoneBase(5, 1).file).toBe(familyBaseFile('banded'));
    expect(lookForZoneBase(5, 13).file).toBe(familyBaseFile('brick'));
  });

  it('keeps a running U so neighbouring faces and corners share the wrap edge', () => {
    expect(faceUOffset('N', 3, 14)).toBe(3);
    expect(faceUOffset('S', 4, 14)).toBe(4);
    expect(faceUOffset('E', 3, 6)).toBe(6);
    expect(faceUOffset('W', 3, 7)).toBe(7);
    const along = enumerateFaces(floor1Map).filter((j) => j.kind === 'wall' && j.face === 'E' && j.tx === 1);
    const sorted = [...along].sort((a, b) => a.tz - b.tz);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].tz === sorted[i - 1].tz + 1) {
        expect(sorted[i].uOffset).toBe(sorted[i - 1].uOffset + 1);
      }
    }
    const jobs = enumerateFaces(floor1Map).filter((j) => j.kind === 'wall');
    const byViewer = new Map<string, typeof jobs>();
    for (const job of jobs) {
      const key = `${job.tx},${job.tz}`;
      const list = byViewer.get(key) ?? [];
      list.push(job);
      byViewer.set(key, list);
    }
    const corner = [...byViewer.values()].find((list) => list.some((j) => j.face === 'N') && list.some((j) => j.face === 'W'));
    expect(corner).toBeDefined();
    const north = corner!.find((j) => j.face === 'N')!;
    const west = corner!.find((j) => j.face === 'W')!;
    expect(north.uOffset).toBe(north.tx);
    expect(west.uOffset).toBe(west.tz);
    expect(north.uOffset % 1).toBe(0);
    expect(west.uOffset % 1).toBe(0);
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
      if (!name.endsWith('.ts') || name === 'gameplay.ts' || name === 'combat.ts' || name === 'monsters.ts' || name === 'perks.ts') continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
    }
    const layout = readFileSync(resolve(dir, 'layout.ts'), 'utf8');
    expect(layout).toContain('knotWallFile');
    expect(layout).toContain('lookForWall');
  });
});
