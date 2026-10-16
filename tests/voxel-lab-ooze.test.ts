import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_BACK_OFFSET_TILES,
  CAMERA_FOV,
  CAMERA_PITCH,
  CELL,
  EYE_HEIGHT,
  MONSTER_OFFSET_TOWARD_PARTY,
  OOZE_DEFAULT_RES,
  OOZE_DEF_FILE,
  OOZE_RESOLUTIONS,
  OOZE_SPRITE_FALLBACK,
  OOZE_SPRITE_FOLDER,
  OOZE_SPRITE_PREFIX
} from '../src/voxel-lab/constants';
import { LOD_NAMES, monsterLodName, quadForWorldHeight } from '../src/voxel-lab/lod';
import {
  buildMonsterVolume,
  floorVsMidOccupancy,
  meshMonster,
  parseMonsterDef,
  type MonsterDef
} from '../src/voxel-lab/monster-builder';

const root = resolve(__dirname, '..');

function loadDef(): MonsterDef {
  const raw = JSON.parse(readFileSync(resolve(root, 'public', OOZE_DEF_FILE), 'utf8'));
  return parseMonsterDef(raw);
}

function pngSize(buf: Buffer): [number, number] {
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('gray ooze JSON def', () => {
  it('defaults to middle resolution and the wet-stone palette, with no face or eyes', () => {
    const def = loadDef();
    expect(def.defaultResolution).toBe(OOZE_DEFAULT_RES);
    expect(def.resolutions).toEqual([...OOZE_RESOLUTIONS]);
    expect(def.stamps.map((s) => s.type).sort()).toEqual(['bone', 'bone', 'hilt', 'skull']);
    expect(def.stamps.some((s) => /eye|face|iris/i.test(s.type))).toBe(false);
    expect(def.palette.some((p) => /eye|iris|face/i.test(p.name))).toBe(false);
    for (const p of def.palette.filter((x) => x.group === 'goo')) {
      const n = parseInt(p.hex.slice(1), 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      expect(g).toBeGreaterThanOrEqual(r - 4);
      expect(Math.abs(r - b)).toBeLessThan(24);
    }
    expect(def.compareSprite.sizesKey).toBe('slime');
    expect(def.compareSprite.filePattern).toContain('gray_ooze_{lod}');
  });
});

describe('procedural volume is a low irregular leak, not a jelly dome', () => {
  it('spreads wider on the floor than at mid-height and stays short against 2.5 m walls', () => {
    const def = loadDef();
    const built = buildMonsterVolume(def, 32);
    const { floor, mid } = floorVsMidOccupancy(built);
    expect(built.peakHeight).toBeLessThan(0.7);
    expect(built.peakHeight).toBeGreaterThan(0.28);
    expect(built.width).toBeGreaterThan(built.peakHeight * 1.6);
    expect(floor).toBeGreaterThan(mid * 1.25);
    expect(built.counts.bone).toBeGreaterThan(8);
    expect(built.counts.rust).toBeGreaterThan(4);
    expect(built.counts.glint).toBeGreaterThan(0);
    expect(built.counts.glint).toBeLessThan(built.counts.goo * 0.08);
    expect(built.voxelCount).toBeGreaterThan(200);
  });

  it('greedy-meshes into a handful of groups, far below one cube per voxel', () => {
    const def = loadDef();
    const built = buildMonsterVolume(def, 32);
    const mesh = meshMonster(def, built);
    expect(mesh.groups.length).toBeGreaterThanOrEqual(3);
    expect(mesh.groups.length).toBeLessThanOrEqual(6);
    const naive = built.voxelCount * 12;
    expect(mesh.triangles).toBeGreaterThan(20);
    expect(mesh.triangles).toBeLessThan(naive / 4);
    const names = mesh.groups.map((g) => g.group);
    expect(names).toContain('goo');
    expect(names).toContain('core');
    expect(names).toContain('bone');
  });

  it('voxel count grows with resolution and 16/32/48 stay cheap enough to prebuild', () => {
    const def = loadDef();
    const a = buildMonsterVolume(def, 16);
    const b = buildMonsterVolume(def, 32);
    const c = buildMonsterVolume(def, 48);
    expect(a.voxelCount).toBeLessThan(b.voxelCount);
    expect(b.voxelCount).toBeLessThan(c.voxelCount);
    expect(c.voxelCount).toBeLessThan(40000);
  });
});

describe('painted Gray Ooze comparison sprites', () => {
  it('ships close/near/mid/far at the slime canvas sizes with feet on the bottom row', () => {
    const sizes = JSON.parse(
      readFileSync(resolve(root, 'public/art/dungeon/monsters_v2/sizes.json'), 'utf8')
    ) as { monsters: { slime: Record<string, { px: [number, number] }> } };
    for (const lod of LOD_NAMES) {
      const file = resolve(root, 'public', OOZE_SPRITE_FOLDER, `${OOZE_SPRITE_PREFIX}_${lod}.png`);
      expect(existsSync(file), file).toBe(true);
      const px = pngSize(readFileSync(file));
      expect(px).toEqual(sizes.monsters.slime[lod].px);
    }
    expect(existsSync(resolve(root, 'public', OOZE_SPRITE_FOLDER, `${OOZE_SPRITE_FALLBACK}_near.png`))).toBe(true);
  });

  it('picks LOD by Chebyshev squares the way the game does, and sizes against lab walls', () => {
    expect(monsterLodName(1, true)).toBe('close');
    expect(monsterLodName(2, true)).toBe('near');
    expect(monsterLodName(3, true)).toBe('mid');
    expect(monsterLodName(4, true)).toBe('far');
    const q = quadForWorldHeight(0.39, CELL, 102, 71);
    expect(q.h).toBeCloseTo(0.39 * CELL, 5);
    expect(q.w).toBeCloseTo(0.39 * CELL * (102 / 71), 5);
  });
});

describe('gameplay camera framing in the lab', () => {
  it('uses 80° FOV, scaled eye height, and proto3d 1/2-square distances', () => {
    expect(CAMERA_FOV).toBe(80);
    expect(EYE_HEIGHT).toBeCloseTo(0.94 * (CELL / 2), 5);
    expect(CAMERA_PITCH).toBeCloseTo((-3.5 * Math.PI) / 180, 6);
    expect((1 + CAMERA_BACK_OFFSET_TILES - MONSTER_OFFSET_TOWARD_PARTY) * CELL).toBeCloseTo(3.125, 5);
    expect((2 + CAMERA_BACK_OFFSET_TILES - MONSTER_OFFSET_TOWARD_PARTY) * CELL).toBeCloseTo(5.625, 5);
  });
});

describe('gray ooze lab stays off the game', () => {
  it('does not import proto3d and does not add a game monster id', () => {
    const main = readFileSync(resolve(root, 'src/voxel-lab/main.ts'), 'utf8');
    const ooze = readFileSync(resolve(root, 'src/voxel-lab/ooze.ts'), 'utf8');
    const builder = readFileSync(resolve(root, 'src/voxel-lab/monster-builder.ts'), 'utf8');
    const protoMain = readFileSync(resolve(root, 'src/proto3d/main.ts'), 'utf8');
    const monsters = readFileSync(resolve(root, 'public/levels/monsters.json'), 'utf8');
    const sizes = readFileSync(resolve(root, 'public/art/dungeon/monsters_v2/sizes.json'), 'utf8');
    expect(main).not.toContain("from '../proto3d");
    expect(ooze).not.toContain("from '../proto3d");
    expect(builder).not.toContain("from '../proto3d");
    expect(protoMain).not.toContain('gray_ooze');
    expect(monsters).not.toContain('gray_ooze');
    expect(JSON.parse(sizes).monsters.gray_ooze).toBeUndefined();
    expect(main).toContain('createOozeLab');
    expect(readFileSync(resolve(root, 'voxel-lab.html'), 'utf8')).toContain('id="btn-ooze-res"');
  });
});
