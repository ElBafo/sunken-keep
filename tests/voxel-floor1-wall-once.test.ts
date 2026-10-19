import { describe, expect, it } from 'vitest';
import { lookForWall } from '../src/voxel-floor1/wall-look';
import {
  STRONG_H_REPEATS,
  STRONG_ONCE_BASE,
  STRONG_V_REPEATS,
  compositeStrongOnce,
  onceSlotFor,
  type PixelGrid
} from '../src/voxel-floor1/wall-once';

function grid(w: number, h: number, fill: [number, number, number, number]): PixelGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { width: w, height: h, data };
}

function paintRect(
  img: PixelGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: [number, number, number, number]
): void {
  const data = img.data as Uint8ClampedArray;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
}

function pixel(img: PixelGrid, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

describe('strong wall features appear once per face', () => {
  it('keeps two vertical repeats and one horizontal on 128px tiles', () => {
    expect(STRONG_V_REPEATS).toBe(2);
    expect(STRONG_H_REPEATS).toBe(1);
  });

  it('picks a stable slot per face and covers both vertical repeats', () => {
    const a = onceSlotFor(4, 7, 'E');
    const b = onceSlotFor(4, 7, 'E');
    expect(a).toEqual(b);
    expect(a.v).toBeGreaterThanOrEqual(0);
    expect(a.v).toBeLessThan(STRONG_V_REPEATS);
    expect(a.h).toBe(0);
    const seen = new Set<number>();
    for (let x = 0; x < 16 && seen.size < STRONG_V_REPEATS; x++) {
      seen.add(onceSlotFor(x, 7, 'E').v);
    }
    expect(seen.size).toBe(STRONG_V_REPEATS);
  });

  it('stamps the feature into one vertical band and the family base into the other', () => {
    const feat = grid(8, 8, [200, 10, 10, 255]);
    paintRect(feat, 0, 4, 8, 8, [10, 200, 10, 255]);
    const base = grid(8, 8, [10, 10, 200, 255]);
    const top = compositeStrongOnce(feat, base, { v: 0, h: 0, repeatsV: 2, repeatsH: 1 });
    const bot = compositeStrongOnce(feat, base, { v: 1, h: 0, repeatsV: 2, repeatsH: 1 });
    expect(pixel(top, 3, 1)).toEqual([200, 10, 10, 255]);
    expect(pixel(top, 3, 6)).toEqual([10, 10, 200, 255]);
    expect(pixel(bot, 3, 1)).toEqual([10, 10, 200, 255]);
    expect(pixel(bot, 3, 6)).toEqual([10, 200, 10, 255]);
    expect(pixel(top, 0, 3)).toEqual(pixel(feat, 0, 3));
    expect(pixel(top, 0, 4)).toEqual(pixel(base, 0, 4));
    expect(pixel(bot, 0, 3)).toEqual(pixel(base, 0, 3));
    expect(pixel(bot, 0, 4)).toEqual(pixel(feat, 0, 4));
  });

  it('does the same when a tile also repeats horizontally', () => {
    const feat = grid(8, 8, [9, 9, 9, 255]);
    paintRect(feat, 0, 0, 4, 4, [255, 0, 0, 255]);
    paintRect(feat, 4, 0, 8, 4, [0, 255, 0, 255]);
    paintRect(feat, 0, 4, 4, 8, [0, 0, 255, 255]);
    paintRect(feat, 4, 4, 8, 8, [255, 255, 0, 255]);
    const base = grid(8, 8, [40, 40, 40, 255]);
    const out = compositeStrongOnce(feat, base, { v: 1, h: 0, repeatsV: 2, repeatsH: 2 });
    expect(pixel(out, 1, 1)).toEqual([40, 40, 40, 255]);
    expect(pixel(out, 5, 1)).toEqual([40, 40, 40, 255]);
    expect(pixel(out, 1, 5)).toEqual([0, 0, 255, 255]);
    expect(pixel(out, 5, 5)).toEqual([40, 40, 40, 255]);
  });

  it('keeps Levie texture names and assigns a once slot on every strong face', () => {
    const pantry = lookForWall(4, 7, 'E');
    expect(pantry?.file).toBe('walls_floor1/brick_missing.png');
    expect(pantry?.baseFile).toBe('walls_floor1/brick_base.png');
    expect(pantry?.once).toBeDefined();
    expect(pantry?.key).toContain(':once:');
    expect(Object.keys(STRONG_ONCE_BASE).sort()).toEqual(
      [
        'walls_floor1/ashlar_damp.png',
        'walls_floor1/ashlar_patched.png',
        'walls_floor1/banded_2.png',
        'walls_floor1/brick_missing.png',
        'walls_floor1/brick_patched.png',
        'walls_floor1/etched_2.png'
      ].sort()
    );
    for (const [file, base] of Object.entries(STRONG_ONCE_BASE)) {
      const faces = [
        lookForWall(4, 7, 'E'),
        lookForWall(4, 6, 'N'),
        lookForWall(8, 5, 'W'),
        lookForWall(4, 7, 'W')
      ].filter((l) => l?.file === file);
      for (const look of faces) {
        expect(look?.baseFile).toBe(base);
        expect(look?.once?.repeatsV).toBe(2);
        expect(look?.once?.repeatsH).toBe(1);
      }
    }
  });
});
