import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { enumerateFaces, floor1Map } from '../src/voxel-floor1/layout';
import {
  KNOT_PANEL_INSET,
  KNOT_WALL_FILE,
  compositeKnotOnRoom,
  inKnotPanel,
  isKnotLeakTexel,
  knotBatchKey
} from '../src/voxel-floor1/knot-walls';

function fill(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('floor-1 knot panel sits on the room stone', () => {
  it('uses the decorated room look for the surround, not secret_closed', () => {
    const jobs = enumerateFaces(floor1Map).filter((j) => j.knot);
    expect(jobs).toHaveLength(2);
    const guard = jobs.find((j) => j.tx === 11 && j.tz === 1 && j.face === 'N');
    const pell = jobs.find((j) => j.tx === 12 && j.tz === 10 && j.face === 'S');
    expect(guard?.file).toBe('walls_floor1/banded_1.png');
    expect(guard?.look?.kind).toBe('banded');
    expect(pell?.file).toBe('walls_floor1/brick_cracked.png');
    expect(pell?.look?.kind).toBe('brick');
    expect(pell?.look?.seepage).toBe('matte_dark');
    for (const job of jobs) {
      expect(job.file).not.toBe(KNOT_WALL_FILE);
      expect(job.batch).toBe(knotBatchKey(job.look!, job.wallX, job.wallY, job.wallFace));
      expect(job.uOffset).toBe(0);
    }
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('compositeKnotOnRoom');
    expect(level).toContain('KNOT_WALL_FILE');
  });

  it('stamps only the carved panel and keeps room stone on the frame and leak rows', () => {
    expect(KNOT_PANEL_INSET.y0).toBeGreaterThan(8);
    expect(KNOT_PANEL_INSET.y1).toBeLessThan(120);
    expect(isKnotLeakTexel(0, 0, 0, 255)).toBe(true);
    expect(isKnotLeakTexel(80, 80, 80, 255)).toBe(false);
    const room = { width: 128, height: 128, data: fill(128, 128, 40, 42, 48) };
    const knot = { width: 128, height: 128, data: fill(128, 128, 200, 190, 170) };
    for (let x = 0; x < 128; x++) {
      knot.data[x * 4] = 0;
      knot.data[x * 4 + 1] = 0;
      knot.data[x * 4 + 2] = 0;
    }
    const out = compositeKnotOnRoom(room, knot);
    const at = (x: number, y: number) => out.data[(y * 128 + x) * 4];
    expect(at(0, 0)).toBe(40);
    expect(at(64, 0)).toBe(40);
    expect(at(64, 127)).toBe(40);
    expect(at(0, 64)).toBe(40);
    expect(at(127, 64)).toBe(40);
    expect(inKnotPanel(64, 64, 128, 128)).toBe(true);
    expect(at(64, 64)).toBe(200);
    expect(at(64, 1)).toBe(40);
  });
});
