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
import {
  BRACKET_FLAME_OUT,
  CELL,
  CRACKED_CEILING_FILE,
  IRON_COLOR,
  MAX_ACTIVE_SUNBEAMS,
  MAX_ACTIVE_TORCHES,
  SCONCE_RADIUS_TILES,
  TORCH_INTENSITY
} from '../src/voxel-floor1/constants';
import { floor1Map, enumerateFaces, isWalkableTile, tileAt } from '../src/voxel-floor1/layout';
import { buildBracketOccupancy, MAT_IRON } from '../src/voxel-floor1/bracket';
import { compositeCrackedCeiling, crackedCeilingHasGap, isBeamCeiling } from '../src/voxel-floor1/crack';
import { bakeWeights, litFarTorches } from '../src/voxel-floor1/bake';

describe('voxel-floor1 torches match the game sconce table', () => {
  it('uses floor1.sconces at the same squares and walls', () => {
    expect(floor1Sconces).toEqual(floor1.sconces);
    expect(floor1Sconces.filter(sconceIsLit)).toEqual([
      { x: 0, y: 6, face: 'E', lit: true, capped: false },
      { x: 4, y: 1, face: 'W', lit: true, capped: false },
      { x: 6, y: 4, face: 'S', lit: true, capped: false }
    ]);
  });

  it('puts the flame off the wall in the walkable room at (1,6)', () => {
    expect(sconceRoom(floor1Sconces[0])).toEqual({ x: 1, y: 6 });
    expect(isWalkableTile(tileAt(floor1Map, 1, 6))).toBe(true);
    const pos = torchWorldPos(floor1Sconces[0]);
    const wallX = 0 * CELL + FACE_INTO_ROOM.E.nx * (CELL / 2);
    expect(pos.x).toBeCloseTo(wallX + BRACKET_FLAME_OUT, 5);
    expect(pos.x).toBeGreaterThan(wallX + 0.2);
  });

  it('does not leak torch flood through walls to the New Game square', () => {
    const room = sconceRoom(floor1Sconces[0]);
    const reach = floodReach(floor1Map, room.x, room.y, SCONCE_RADIUS_TILES);
    expect(reach.has('1,6')).toBe(true);
    expect(reach.has('3,14')).toBe(false);
    expect(reach.has('19,7')).toBe(false);
  });
});

describe('voxel iron brackets', () => {
  it('greedy-merges a few dark iron cubes, not pale silver', () => {
    const { volume, voxelCount } = buildBracketOccupancy(false);
    expect(voxelCount).toBeGreaterThan(30);
    expect(volume.includes(MAT_IRON)).toBe(true);
    const r = (IRON_COLOR >> 16) & 255;
    const g = (IRON_COLOR >> 8) & 255;
    const b = IRON_COLOR & 255;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    expect(luma).toBeLessThan(0.12);
    expect(r).toBeLessThan(40);
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

  it('uses a cracked ceiling only on beam squares', () => {
    const jobs = enumerateFaces(floor1Map);
    const cracked = jobs.filter((j) => isBeamCeiling(j.tx, j.tz, floor1Sunbeams) && j.kind === 'ceiling');
    expect(cracked.length).toBe(floor1Sunbeams.length);
    const plainCeil = jobs.filter((j) => j.kind === 'ceiling' && !isBeamCeiling(j.tx, j.tz, floor1Sunbeams));
    expect(plainCeil.every((j) => j.file !== CRACKED_CEILING_FILE)).toBe(true);
  });

  it('punches a jagged light gap through the ceiling texture', () => {
    const W = 16;
    const ceil = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
    const crack = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
    for (let i = 0; i < W * W; i++) {
      ceil.data[i * 4] = 80;
      ceil.data[i * 4 + 1] = 82;
      ceil.data[i * 4 + 2] = 78;
      ceil.data[i * 4 + 3] = 255;
    }
    for (let x = 2; x < 14; x++) {
      const i = (8 * W + x) * 4;
      crack.data[i] = 255;
      crack.data[i + 1] = 236;
      crack.data[i + 2] = 170;
      crack.data[i + 3] = 255;
    }
    const out = compositeCrackedCeiling(ceil, crack);
    expect(crackedCeilingHasGap(out)).toBe(true);
  });
});

describe('far torch bake lights the painted texture', () => {
  it('weights only tiles in the torch flood, so unlit rooms stay dark', () => {
    const torches = litFarTorches(floor1Map, floor1Sconces);
    expect(torches.length).toBe(3);
    const south = torches.find((t) => t.key.endsWith(',S'));
    expect(south).toBeTruthy();
    const near = bakeWeights(6, 5, 6 * CELL, 0.1, 5 * CELL, torches);
    expect(near[0] + near[1] + near[2]).toBeGreaterThan(0.2);
    const wall = bakeWeights(6, 5, 6 * CELL, CELL / 2, 5 * CELL - CELL / 2, torches);
    expect(wall[0] + wall[1] + wall[2]).toBeGreaterThan(0.15);
    const ceil = bakeWeights(6, 5, 6 * CELL, CELL - 0.05, 5 * CELL, torches);
    expect(ceil[0] + ceil[1] + ceil[2]).toBeGreaterThan(0.1);
    const start = bakeWeights(3, 14, 3 * CELL, 0.1, 14 * CELL, torches);
    expect(start[0] + start[1] + start[2]).toBe(0);
  });
});

describe('active light cap', () => {
  it('keeps a small torch/sunbeam pool so the shader cannot blow up', () => {
    expect(MAX_ACTIVE_TORCHES).toBe(2);
    expect(MAX_ACTIVE_SUNBEAMS).toBe(1);
    expect(MAX_ACTIVE_TORCHES).toBeLessThan(floor1Sconces.filter(sconceIsLit).length);
    expect(TORCH_INTENSITY).toBeLessThan(6);
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

  it('builds voxel brackets and camera-facing flame sprites', () => {
    const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');
    expect(props).toContain('meshBracket');
    expect(props).toContain('THREE.Sprite');
    expect(props).not.toContain('bracket_lit_front');
    const main = readFileSync(resolve(__dirname, '../src/voxel-floor1/main.ts'), 'utf8');
    expect(main).toContain('setBakeBlends');
    expect(main).toContain('CAMERA_VIEW_ASPECT');
    expect(main).toContain('CAMERA_VIEW_W');
    expect(main).toContain('setLookPitch');
    expect(main).toContain('renderer.setSize(CAMERA_VIEW_W, CAMERA_VIEW_H, false)');
    expect(main).not.toContain('TorchLightPools');
    const bake = readFileSync(resolve(__dirname, '../src/voxel-floor1/bake.ts'), 'utf8');
    expect(bake).toContain('linearToOutputTexel');
    expect(bake).toContain('diffuseColor.rgb');
    expect(bake).toContain('GAME_TORCH_RGB');
    expect(bake).toContain('flatGeometryWithBake');
    expect(bake).not.toContain('AdditiveBlending');
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('flatGeometryWithBake');
    expect(level).not.toContain('InstancedMesh');
  });
});
