import { inflateSync } from 'zlib';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FLOOR_VARIANTS } from '../src/voxel-floor1/constants';
import {
  FLOOR_EDGE_BAND_MAX,
  FLOOR_EDGE_BAND_MIN,
  FLOOR_EDGE_MATCH_TOLERANCE,
  edgeColumn,
  edgeRow,
  maxChannelDelta,
  type RgbaPixels
} from '../src/voxel-floor1/floor-edges';
import { enumerateFaces, floor1Map, mappedFloorFile } from '../src/voxel-floor1/layout';

const TEX = resolve(__dirname, '../public/proto3d/tex3d');

const DOOR_CELLS = [
  { x: 4, y: 2, room: { x: 5, y: 2 } },
  { x: 14, y: 2, room: { x: 13, y: 2 } },
  { x: 6, y: 8, room: { x: 6, y: 9 } },
  { x: 19, y: 5, room: { x: 19, y: 4 } }
] as const;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePngRgba(path: string): RgbaPixels {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
    throw new Error(`not a png: ${path}`);
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bit = 0;
  let colour = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const tag = buf.subarray(pos + 4, pos + 8).toString('binary');
    const payload = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (tag === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bit = payload[8];
      colour = payload[9];
    } else if (tag === 'IDAT') {
      idat.push(payload);
    } else if (tag === 'IEND') {
      break;
    }
  }
  if (bit !== 8 || (colour !== 2 && colour !== 6)) {
    throw new Error(`unsupported png ${path}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colour === 6 ? 4 : 3;
  const stride = width * bpp;
  const data = new Uint8Array(width * height * 4);
  let i = 0;
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filt = raw[i++];
    const row = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = row[x];
      row[x] =
        filt === 0
          ? v
          : filt === 1
            ? (v + a) & 255
            : filt === 2
              ? (v + b) & 255
              : filt === 3
                ? (v + ((a + b) >> 1)) & 255
                : (v + paeth(a, b, c)) & 255;
    }
    row.copy(prev);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colour === 6) {
        data.set(row.subarray(x * 4, x * 4 + 4), o);
      } else {
        data[o] = row[x * 3];
        data[o + 1] = row[x * 3 + 1];
        data[o + 2] = row[x * 3 + 2];
        data[o + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

describe('floor stone variants share wraparound edges', () => {
  it('uses a 16–24 px offline master-edge rewrite, not a runtime blur', () => {
    expect(FLOOR_EDGE_BAND_MIN).toBe(16);
    expect(FLOOR_EDGE_BAND_MAX).toBe(24);
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/floor-edges.ts'), 'utf8');
    expect(src).toContain('edge_match_floor_tiles.py');
    expect(src).toContain('hard copy');
    const script = readFileSync(resolve(__dirname, '../levels/tools/edge_match_floor_tiles.py'), 'utf8');
    expect(script).toContain('BAND_MIN = 16');
    expect(script).toContain('BAND_MAX = 24');
    expect(script).toContain('Hard copy');
    expect(script).not.toMatch(/Gaussian|ImageFilter|resize\(/);
  });

  it('matches edge pixel columns and rows between variants within tolerance', () => {
    const tiles = FLOOR_VARIANTS.map((name) => ({
      name,
      img: decodePngRgba(resolve(TEX, name))
    }));
    for (const { name, img } of tiles) {
      expect(img.width, name).toBe(256);
      expect(img.height, name).toBe(256);
    }
    const lefts = tiles.map((t) => edgeColumn(t.img, 0));
    const rights = tiles.map((t) => edgeColumn(t.img, t.img.width - 1));
    const tops = tiles.map((t) => edgeRow(t.img, 0));
    const bots = tiles.map((t) => edgeRow(t.img, t.img.height - 1));
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i; j < tiles.length; j++) {
        const pair = `${tiles[i].name} vs ${tiles[j].name}`;
        expect(maxChannelDelta(lefts[i], lefts[j]), `${pair} left`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
        expect(maxChannelDelta(rights[i], rights[j]), `${pair} right`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
        expect(maxChannelDelta(tops[i], tops[j]), `${pair} top`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
        expect(maxChannelDelta(bots[i], bots[j]), `${pair} bottom`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
        expect(maxChannelDelta(lefts[i], rights[j]), `${pair} left-right`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
        expect(maxChannelDelta(tops[i], bots[j]), `${pair} top-bottom`).toBeLessThanOrEqual(
          FLOOR_EDGE_MATCH_TOLERANCE
        );
      }
    }
  });
});

describe('former door cells use the room floor tile and UVs', () => {
  it('assigns (4,2) (14,2) (6,8) (19,5) the same stone, rotation and UVs as the room', () => {
    const jobs = enumerateFaces(floor1Map);
    const floors = jobs.filter((j) => j.kind === 'floor');
    for (const cell of DOOR_CELLS) {
      const door = floors.find((j) => j.tx === cell.x && j.tz === cell.y);
      const room = floors.find((j) => j.tx === cell.room.x && j.tz === cell.room.y);
      expect(door, `${cell.x},${cell.y} floor`).toBeTruthy();
      expect(room, `${cell.room.x},${cell.room.y} floor`).toBeTruthy();
      expect(door!.file.startsWith('floor_stone')).toBe(true);
      expect(FLOOR_VARIANTS).toContain(door!.file);
      expect(door!.uvRot).toBe(0);
      expect(door!.uvScale).toBe(1);
      expect(door!.uOffset).toBe(0);
      expect(room!.uvRot).toBe(0);
      expect(room!.uvScale).toBe(1);
      expect(room!.uOffset).toBe(0);
      expect(mappedFloorFile(cell.x, cell.y)).toBe(door!.file);
      if (`${cell.x},${cell.y}` === '4,2') {
        expect(door!.file).toBe('floor_stone.png');
      } else {
        expect(door!.file).toBe(room!.file);
      }
    }
  });
});
