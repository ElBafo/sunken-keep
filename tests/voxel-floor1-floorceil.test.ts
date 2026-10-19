import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import floor1FloorCeil from '../levels/floor1_floorceil.json';
import { CEILING_VARIANTS, FLOOR_VARIANTS } from '../src/voxel-floor1/constants';
import {
  compositeCrackedCeiling,
  crackedCeilingHasGap,
  pixelsForRelief,
  scaleNearest
} from '../src/voxel-floor1/crack';
import {
  enumerateFaces,
  floor1Map,
  isShellTile,
  mappedCeilingFile,
  mappedFloorFile
} from '../src/voxel-floor1/layout';
import { pickVariant } from '../src/voxel-floor1/variants';

const TEX = resolve(__dirname, '../public/proto3d/tex3d');

function pngSize(name: string): { w: number; h: number } {
  const buf = readFileSync(resolve(TEX, name));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('floor-1 floor and ceiling come from Levie’s map', () => {
  it('drops ceiling.png and ships 256² tiles that cover one cell', () => {
    expect(CEILING_VARIANTS).toEqual(['ceiling_2.png', 'ceiling_3.png', 'ceiling_4.png']);
    expect(CEILING_VARIANTS).not.toContain('ceiling.png');
    for (const name of [...FLOOR_VARIANTS, ...CEILING_VARIANTS, 'floor_water.png']) {
      expect(pngSize(name), name).toEqual({ w: 256, h: 256 });
    }
    expect(pngSize('wood_beam.png')).toEqual({ w: 64, h: 64 });
  });

  it('assigns each shell square from the JSON and falls back to pickVariant', () => {
    const jobs = enumerateFaces(floor1Map);
    for (let y = 0; y < floor1Map.height; y++) {
      for (let x = 0; x < floor1Map.width; x++) {
        if (!isShellTile(floor1Map.tiles[y][x])) continue;
        const floor = jobs.find((j) => j.kind === 'floor' && j.tx === x && j.tz === y);
        const ceil = jobs.find((j) => j.kind === 'ceiling' && j.tx === x && j.tz === y);
        expect(floor?.file).toBe(mappedFloorFile(x, y) ?? pickVariant(FLOOR_VARIANTS, x, y, 'F'));
        expect(ceil?.file).toBe(mappedCeilingFile(x, y) ?? pickVariant(CEILING_VARIANTS, x, y, 'C'));
        expect(ceil?.file).not.toBe('ceiling.png');
      }
    }
    expect(mappedFloorFile(2, 2)).toBe('floor_water.png');
    expect(mappedFloorFile(2, 5)).toBe('floor_stone.png');
    expect(mappedFloorFile(3, 14)).toBe('floor_stone_3.png');
    expect(mappedCeilingFile(3, 14)).toBe('ceiling_4.png');
    expect(mappedFloorFile(99, 99)).toBeUndefined();
    expect(floor1FloorCeil.squares).toHaveLength(jobs.filter((j) => j.kind === 'floor').length);
  });

  it('keeps 256 albedo but voxelizes floor/ceiling on the 128 relief grid', () => {
    const big = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };
    const relief = pixelsForRelief(big);
    expect(relief.width).toBe(128);
    expect(relief.height).toBe(128);
    expect(pixelsForRelief({ width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) }).width).toBe(128);
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('pixelsForRelief(png.data)');
    expect(level).toContain('texByBatch.set(file, png.texture)');
  });

  it('does not put floor or ceiling tiles on the wall mip/atlas path', () => {
    const mips = JSON.parse(readFileSync(resolve(TEX, 'wall_mips.json'), 'utf8')) as {
      textures: Record<string, Record<string, string>>;
    };
    expect(Object.keys(mips.textures).some((k) => k.startsWith('floor_') || k.startsWith('ceiling'))).toBe(false);
    const crack = readFileSync(resolve(__dirname, '../src/voxel-floor1/crack.ts'), 'utf8');
    expect(crack).not.toContain('ceiling.png');
    expect(crack).toContain('scaleNearest');
    expect(crack).toContain('mappedCeilingFile');
  });
});

describe('cracked ceiling composites at 256', () => {
  it('scales a 128 overlay with nearest-neighbour and still punches a gap', () => {
    const ceil = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };
    const crack = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) };
    for (let i = 0; i < 256 * 256; i++) {
      ceil.data[i * 4] = 80;
      ceil.data[i * 4 + 1] = 82;
      ceil.data[i * 4 + 2] = 78;
      ceil.data[i * 4 + 3] = 255;
    }
    for (let x = 16; x < 112; x++) {
      const i = (64 * 128 + x) * 4;
      crack.data[i] = 255;
      crack.data[i + 1] = 236;
      crack.data[i + 2] = 170;
      crack.data[i + 3] = 255;
    }
    const scaled = scaleNearest(crack, 256, 256);
    expect(scaled.width).toBe(256);
    expect(scaled.height).toBe(256);
    expect(scaled.data[(128 * 256 + 32) * 4]).toBe(255);
    expect(scaled.data[(128 * 256 + 33) * 4]).toBe(255);
    expect(scaled.data[0]).toBe(0);
    const out = compositeCrackedCeiling(ceil, scaled);
    expect(out.width).toBe(256);
    expect(crackedCeilingHasGap(out)).toBe(true);
  });
});
