import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CELL } from '../src/voxel-floor1/constants';
import { enumerateFaces, floor1Map } from '../src/voxel-floor1/layout';
import { KNOT_WALL_FILE, floor1KnotWalls, knotWallViewer } from '../src/voxel-floor1/knot-walls';
import {
  isUniqueWallPanel,
  listKnotStreakCells,
  listStreakedWallCells,
  quadIsStreaked,
  remapDegenerateUvs
} from '../src/voxel-floor1/uv-audit';

describe('floor-1 streaked wall faces', () => {
  it('names the two knot cells that smeared into horizontal grey bands', () => {
    const cells = listKnotStreakCells();
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => `${c.tx},${c.tz},${c.face}`).sort()).toEqual(['11,1,N', '12,10,S']);
    expect(cells.every((c) => c.file === KNOT_WALL_FILE)).toBe(true);
    expect(floor1KnotWalls).toHaveLength(2);
    expect(knotWallViewer(floor1KnotWalls[0])).toEqual({ x: 11, y: 1 });
    expect(knotWallViewer(floor1KnotWalls[1])).toEqual({ x: 12, y: 10 });
  });

  it('clears the running U on unique knot panels so ClampToEdge cannot smear a column', () => {
    expect(isUniqueWallPanel(KNOT_WALL_FILE)).toBe(true);
    expect(isUniqueWallPanel('walls_floor1/ashlar_clean.png')).toBe(false);
    const jobs = enumerateFaces(floor1Map).filter((j) => j.knot);
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.uOffset).toBe(0);
      expect(job.file).not.toBe(KNOT_WALL_FILE);
      expect(job.file.startsWith('walls_floor1/')).toBe(true);
      expect(job.batch.startsWith('knot:')).toBe(true);
    }
    expect(listStreakedWallCells(floor1Map)).toEqual([]);
    const layout = readFileSync(resolve(__dirname, '../src/voxel-floor1/layout.ts'), 'utf8');
    expect(layout).toContain('knot ? 0 : faceUOffset');
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('tex.wrapS = THREE.RepeatWrapping');
    expect(level).not.toMatch(/if \(batch\.startsWith\('walls_floor1\/'\)\)/);
    const agents = readFileSync(resolve(__dirname, '../AGENTS.md'), 'utf8');
    expect(agents).toContain('docs/ART_DIRECTION.md');
    expect(readFileSync(resolve(__dirname, '../docs/ART_DIRECTION.md'), 'utf8')).toContain('Phone-first');
  });

  it('reprojects a large soffit quad that only sampled one texture row', () => {
    const positions = [
      0, 1.8, 0, 1.2, 1.8, 0, 1.2, 1.8, 0.32, 0, 1.8, 0.32
    ];
    const uvs = [0.4, 0.81, 0.92, 0.81, 0.92, 0.81, 0.4, 0.81];
    expect(quadIsStreaked(positions, uvs, 0)).toBe(true);
    expect(remapDegenerateUvs(positions, uvs, CELL)).toBe(1);
    const vs = [1, 3, 5, 7].map((i) => uvs[i]);
    const us = [0, 2, 4, 6].map((i) => uvs[i]);
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(0.1);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.1);
    expect(quadIsStreaked(positions, uvs, 0)).toBe(false);
  });
});
