import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import floor1FloorCeil from '../levels/floor1_floorceil.json';
import {
  CELL,
  CEILING_VARIANTS,
  FLOOR_VARIANTS,
  PLANK_CEILING_VARIANTS,
  RUBBLE_UV_SCALE
} from '../src/voxel-floor1/constants';
import { compositeCrackedCeiling, crackedCeilingHasGap, scaleNearest } from '../src/voxel-floor1/crack';
import {
  dungeonWoodMaterial,
  isPaintedShellFile,
  normalFromAlbedo,
  paintedShellMaterial,
  RUBBLE_TINT
} from '../src/voxel-floor1/painted';
import { shellUv, shellUvScaled } from '../src/voxel-floor1/bake';
import {
  enumerateFaces,
  floor1Map,
  isShellTile,
  mappedCeilingFile,
  mappedCeilingUvRot,
  mappedFloorFile
} from '../src/voxel-floor1/layout';
import { pickVariant } from '../src/voxel-floor1/variants';

const TEX = resolve(__dirname, '../public/proto3d/tex3d');

function pngSize(name: string): { w: number; h: number } {
  const buf = readFileSync(resolve(TEX, name));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('floor-1 floor and ceiling come from Levie’s map', () => {
  it('drops ceiling.png and ships 256² rubble plus leftover plank tiles', () => {
    expect(CEILING_VARIANTS).toEqual([
      'ceiling_rubble_1.png',
      'ceiling_rubble_2.png',
      'ceiling_rubble_3.png'
    ]);
    expect(CEILING_VARIANTS).not.toContain('ceiling.png');
    expect(CEILING_VARIANTS.join()).not.toContain('ceiling_2');
    expect(CEILING_VARIANTS.join()).not.toContain('planks');
    for (const name of [...FLOOR_VARIANTS, ...CEILING_VARIANTS, ...PLANK_CEILING_VARIANTS, 'floor_water.png']) {
      expect(pngSize(name), name).toEqual({ w: 256, h: 256 });
    }
    expect(pngSize('wood_beam.png')).toEqual({ w: 64, h: 64 });
    expect(pngSize('cornice_brick.png')).toEqual({ w: 256, h: 64 });
    expect(pngSize('cornice_slab.png')).toEqual({ w: 256, h: 64 });
    expect(pngSize('ceiling_2.png')).toEqual({ w: 256, h: 256 });
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
        expect(
          ceil?.file.startsWith('ceiling_rubble_') ||
            ceil?.file.startsWith('ceiling_planks_') ||
            ceil?.file === 'ceiling_cracked.png'
        ).toBe(true);
      }
    }
    expect(mappedFloorFile(2, 2)).toBe('floor_water.png');
    expect(mappedFloorFile(2, 5)).toBe('floor_stone.png');
    expect(mappedFloorFile(3, 14)).toBe('floor_stone_2.png');
    expect(mappedCeilingFile(3, 14)).toBe('ceiling_rubble_1.png');
    expect(mappedCeilingFile(6, 6)?.startsWith('ceiling_planks_')).toBe(true);
    expect(mappedCeilingFile(10, 2)?.startsWith('ceiling_planks_')).toBe(true);
    expect(mappedCeilingFile(2, 11)?.startsWith('ceiling_rubble_')).toBe(true);
    expect(mappedFloorFile(99, 99)).toBeUndefined();
    expect(floor1FloorCeil.squares).toHaveLength(jobs.filter((j) => j.kind === 'floor').length);
  });

  it('keeps floor_stone_3 rare, under a lamp or door, and never adjacent', () => {
    const feats = floor1FloorCeil.squares.filter((s) => s.floor === 'floor_stone_3');
    expect(feats.length).toBeGreaterThan(0);
    expect(feats.length).toBeLessThanOrEqual(4);
    const keys = new Set(feats.map((s) => `${s.x},${s.y}`));
    expect(keys.has('9,1') || keys.has('7,1') || keys.has('6,5') || keys.has('13,3')).toBe(true);
    for (const a of feats) {
      for (const b of feats) {
        if (a === b) continue;
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(1);
      }
    }
    for (const s of floor1FloorCeil.squares) {
      if (s.floor === 'floor_water') continue;
      const n = floor1FloorCeil.squares.find((o) => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) === 1 && o.floor === 'floor_water');
      if (n) expect(s.floor).toBe('floor_stone');
    }
  });

  it('keeps plank boards unrotated so they cross the N–S beams', () => {
    expect(shellUv(0, 0, 0)).toEqual([0, 0]);
    expect(shellUv(1, 0, 90)).toEqual([0, 0]);
    expect(shellUv(1, 1, 90)).toEqual([1, 0]);
    expect(mappedCeilingUvRot(2, 11)).toBe(0);
    expect(mappedCeilingUvRot(2, 6)).toBe(0);
    expect(mappedCeilingUvRot(6, 6)).toBe(0);
    expect(mappedCeilingUvRot(10, 2)).toBe(0);
    expect(mappedCeilingUvRot(6, 2)).toBe(0);
    for (const s of floor1FloorCeil.squares) {
      expect(s.ceilingRot ?? 0).toBe(0);
    }
    const jobs = enumerateFaces(floor1Map);
    for (const j of jobs.filter((f) => f.kind === 'floor')) {
      expect(j.uvRot).toBe(0);
      expect(j.uOffset).toBe(0);
    }
    const byZone = new Map<string, Set<number>>();
    for (const j of jobs.filter((f) => f.kind === 'ceiling')) {
      expect(j.uvRot === 0 || j.uvRot === 90).toBe(true);
      const key = `${Math.round(j.tx / 3)},${Math.round(j.tz / 3)}`;
      const set = byZone.get(key) ?? new Set();
      set.add(j.uvRot);
      byZone.set(key, set);
    }
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/bake.ts'), 'utf8');
    expect(src).toContain('shellUv');
    expect(src).not.toContain('Math.random');
    const layout = readFileSync(resolve(__dirname, '../src/voxel-floor1/layout.ts'), 'utf8');
    expect(layout).toContain('mappedCeilingUvRot');
    expect(layout).not.toMatch(/uvRot:\s*90 \? 0 : 90/);
  });

  it('paints floor and ceiling as mipmapped flats, not relief voxels', () => {
    expect(isPaintedShellFile('floor_stone_3.png')).toBe(true);
    expect(isPaintedShellFile('ceiling_planks_1.png')).toBe(true);
    expect(isPaintedShellFile('ceiling_2.png')).toBe(true);
    expect(isPaintedShellFile('floor_water.png')).toBe(true);
    expect(isPaintedShellFile('ceiling_cracked.png')).toBe(true);
    expect(isPaintedShellFile('walls_floor1/ashlar_clean.png')).toBe(false);
    const image = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    for (let i = 0; i < 16; i++) {
      image.data[i * 4] = i === 0 ? 255 : 40;
      image.data[i * 4 + 1] = 40;
      image.data[i * 4 + 2] = 40;
      image.data[i * 4 + 3] = 255;
    }
    const nrm = normalFromAlbedo(image);
    expect(nrm.image.width).toBe(4);
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('paintedShellMaterial');
    expect(level).toContain("face.kind !== 'floor' && face.kind !== 'ceiling'");
    expect(level).toContain('CAMERA_NEAR + 0.12');
    expect(level).not.toContain('pixelsForRelief');
    const painted = readFileSync(resolve(__dirname, '../src/voxel-floor1/painted.ts'), 'utf8');
    expect(painted).toContain('NearestMipmapNearestFilter');
    expect(painted).toContain('generateMipmaps = true');
  });

  it('tiles rubble 1:1 per cell and darkens it below the walls', () => {
    expect(RUBBLE_UV_SCALE).toBe(1);
    expect(shellUvScaled(0, 0, 0, CELL, CELL, 2)).toEqual([0, 0]);
    expect(shellUvScaled(1, 1, 0, CELL, CELL, 2)).toEqual([2, 2]);
    expect(shellUvScaled(0.5, 0.5, 0, CELL, CELL, 2)).toEqual([1, 1]);
    expect(shellUvScaled(0, 0, 0, CELL, CELL, 1)).toEqual([0, 0]);
    expect(shellUvScaled(1, 1, 90, CELL, CELL, 1)).toEqual([1, 0]);
    const jobs = enumerateFaces(floor1Map);
    for (const j of jobs) {
      expect(j.uvScale).toBe(1);
    }
    expect(jobs.find((j) => j.kind === 'ceiling' && j.tx === 2 && j.tz === 11)?.uvScale).toBe(1);
    expect(jobs.find((j) => j.kind === 'ceiling' && j.tx === 10 && j.tz === 4)?.uvScale).toBe(1);
    expect(jobs.find((j) => j.kind === 'floor' && j.tx === 2 && j.tz === 11)?.uvScale).toBe(1);
    const map = new THREE.Texture();
    const nrm = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const mat = paintedShellMaterial(map, nrm, 'ceiling_rubble_1.png');
    expect(Math.max(mat.color.r, mat.color.g, mat.color.b)).toBeLessThanOrEqual(0.7);
    expect(Math.min(mat.color.r, mat.color.g, mat.color.b)).toBeGreaterThanOrEqual(0.65);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.RepeatWrapping);
    expect(nrm.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.minFilter).toBe(THREE.NearestFilter);
    expect(map.generateMipmaps).toBe(false);
    expect(map.magFilter).toBe(THREE.NearestFilter);
    expect(RUBBLE_TINT.r).toBeCloseTo(0.66, 2);
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).toContain('farMat.color.copy(painted.color)');
    expect(level).not.toContain('weatherPlankPixels');
    const bake = readFileSync(resolve(__dirname, '../src/voxel-floor1/bake.ts'), 'utf8');
    expect(bake).toContain('shellUvScaled');
    expect(bake).not.toMatch(/customProgramCacheKey = \(\) => 'floor1-far-bake-v9'/);
  });

  it('uses Artie old-wood planks as-is, with no tint or darken', () => {
    const map = new THREE.Texture();
    const mat = paintedShellMaterial(map, undefined, 'ceiling_planks_1.png');
    expect(mat.color.r).toBe(1);
    expect(mat.color.g).toBe(1);
    expect(mat.color.b).toBe(1);
    expect(mat.roughness).toBe(1);
    const painted = readFileSync(resolve(__dirname, '../src/voxel-floor1/painted.ts'), 'utf8');
    expect(painted).not.toContain('onBeforeCompile');
    expect(painted).not.toContain('PLANK_TINT');
    expect(painted).not.toContain('weatherPlank');
    const crack = readFileSync(resolve(__dirname, '../src/voxel-floor1/crack.ts'), 'utf8');
    expect(crack).not.toContain('weatherPlankPixels');
    const level = readFileSync(resolve(__dirname, '../src/voxel-floor1/level.ts'), 'utf8');
    expect(level).not.toContain('weatherPlankPixels');
  });

  it('keeps plank and cracked-ceiling wood fully matte', () => {
    const map = new THREE.Texture();
    const nrm = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const plank = paintedShellMaterial(map, nrm, 'ceiling_planks_1.png');
    const cracked = paintedShellMaterial(map, nrm, 'ceiling_cracked.png');
    const rubble = paintedShellMaterial(new THREE.Texture(), nrm, 'ceiling_rubble_1.png');
    const floor = paintedShellMaterial(new THREE.Texture(), nrm, 'floor_stone.png');
    for (const mat of [plank, cracked]) {
      expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(mat.roughness).toBe(1);
      expect(mat.metalness).toBe(0);
      expect(mat.clearcoat).toBe(0);
      expect(mat.sheen).toBe(0);
      expect(mat.envMapIntensity).toBe(0);
      expect(mat.specularIntensity).toBe(0);
      expect(mat.fog).toBe(true);
      expect(mat.emissive.r).toBe(0);
      expect(mat.emissive.g).toBe(0);
      expect(mat.emissive.b).toBe(0);
      expect(mat.ior).toBeCloseTo(1.45, 5);
      expect(mat.normalScale.x).toBeLessThan(0.08);
      expect(mat.map?.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(mat.map?.generateMipmaps).toBe(false);
      expect(mat.map?.minFilter).toBe(THREE.NearestFilter);
    }
    expect(rubble.roughness).toBe(0.92);
    expect(rubble.specularIntensity).toBe(0);
    expect(rubble.map?.generateMipmaps).toBe(false);
    expect(rubble.map?.minFilter).toBe(THREE.NearestFilter);
    expect(rubble.normalScale.x).toBeCloseTo(0.14, 5);
    expect(floor.roughness).toBe(0.92);
    expect(floor.normalScale.x).toBeCloseTo(0.14, 5);
    expect(floor.fog).toBe(true);
    const wood = dungeonWoodMaterial(new THREE.Texture());
    expect(wood).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(wood).not.toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(wood.fog).toBe(true);
    expect(wood.specularIntensity).toBe(0);
    const props = readFileSync(resolve(__dirname, '../src/voxel-floor1/props.ts'), 'utf8');
    const openings = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    const beams = readFileSync(resolve(__dirname, '../src/voxel-floor1/ceiling-beams.ts'), 'utf8');
    expect(props).toContain('dungeonWoodMaterial');
    expect(beams).toContain('dungeonWoodMaterial');
    expect(openings).toContain('specularIntensity: 0');
    expect(openings).toContain('door_panel_aged');
    expect(openings).not.toContain('MeshBasicMaterial');
    expect(props).not.toMatch(/new THREE\.MeshBasicMaterial\(\{\s*map: woodBeam/);
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
