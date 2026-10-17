import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { floor1 } from '../public/levels/floor1';
import dressing from '../public/levels/dressing_act1.json';
import {
  FACE_INTO_ROOM,
  floodReach,
  floor1Sconces,
  floor1Sunbeams,
  sconceIsLit,
  sconceRoom,
  torchWorldPos
} from '../src/voxel-floor1/fixtures';
import { CELL, MAX_ACTIVE_SUNBEAMS, MAX_ACTIVE_TORCHES, SCONCE_RADIUS_TILES } from '../src/voxel-floor1/constants';
import { floor1Map, isWalkableTile, tileAt } from '../src/voxel-floor1/layout';

describe('voxel-floor1 torches match the game sconce table', () => {
  it('uses floor1.sconces at the same squares and walls', () => {
    expect(floor1Sconces).toEqual(floor1.sconces);
    expect(floor1Sconces.filter(sconceIsLit)).toEqual([
      { x: 0, y: 6, face: 'E', lit: true, capped: false },
      { x: 4, y: 1, face: 'W', lit: true, capped: false },
      { x: 6, y: 4, face: 'S', lit: true, capped: false }
    ]);
  });

  it('puts the east torch of (0,6) in the walkable room at (1,6)', () => {
    expect(sconceRoom(floor1Sconces[0])).toEqual({ x: 1, y: 6 });
    expect(isWalkableTile(tileAt(floor1Map, 1, 6))).toBe(true);
    const pos = torchWorldPos(floor1Sconces[0]);
    expect(pos.x).toBeGreaterThan(0);
    expect(FACE_INTO_ROOM.E.nx).toBe(1);
  });

  it('does not leak torch flood through walls to the New Game square', () => {
    const room = sconceRoom(floor1Sconces[0]);
    const reach = floodReach(floor1Map, room.x, room.y, SCONCE_RADIUS_TILES);
    expect(reach.has('1,6')).toBe(true);
    expect(reach.has('3,14')).toBe(false);
    expect(reach.has('19,7')).toBe(false);
  });
});

describe('voxel-floor1 crack beams match dressing_act1', () => {
  it('places the same three floor-1 sunbeams as Classic', () => {
    const src = dressing.floor1.sunbeam.map((s) => `${s.x},${s.y}`).sort();
    const got = floor1Sunbeams.map((s) => `${s.x},${s.y}`).sort();
    expect(got).toEqual(src);
    expect(floor1Sunbeams.some((s) => s.x === 11 && s.y === 2)).toBe(true);
    expect(floor1Sunbeams[0].wx).toBeCloseTo(floor1Sunbeams[0].x * CELL, 8);
  });
});

describe('active light cap', () => {
  it('keeps a small torch/sunbeam pool so the shader cannot blow up', () => {
    expect(MAX_ACTIVE_TORCHES).toBe(2);
    expect(MAX_ACTIVE_SUNBEAMS).toBe(1);
    expect(MAX_ACTIVE_TORCHES).toBeLessThan(floor1Sconces.filter(sconceIsLit).length);
  });
});

describe('voxel-floor1 still does not import proto3d', () => {
  it('keeps new torch files off proto3d renderer modules', () => {
    const dir = resolve(__dirname, '../src/voxel-floor1');
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toContain("from '../proto3d/");
      expect(src, name).not.toContain('lab-render');
    }
  });
});
