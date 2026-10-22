import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CAMERA_NEAR, CELL, FLOOR_VARIANTS, TORCH_DISTANCE } from '../src/voxel-floor1/constants';
import { floor1Sconces, torchWorldPos } from '../src/voxel-floor1/fixtures';
import { floor1Map, isWaterCell, isWaterTile, tileAt } from '../src/voxel-floor1/layout';
import { paintedShellMaterial } from '../src/voxel-floor1/painted';
import {
  CISTERN_SHORE_XS,
  CISTERN_SHORE_Y,
  DECAL_MASK_DARKEN,
  WATER_DECAL_DIR,
  WATER_DECAL_FLOOR_FILE,
  WATER_DECAL_PX,
  WATER_DECALS,
  cellToDecalUv,
  clearWaterDecalMasks,
  decalFloorFile,
  decalUv,
  hasWaterDecal,
  installDecalMaskFromPixels,
  makePlaceholderPuddleDecal,
  pickSoloPuddleId,
  placeWaterDecals,
  sampleWaterDecalMask,
  sliceDecalTile,
  waterDecalMaskPng,
  waterDecalPng
} from '../src/voxel-floor1/water-decals';
import {
  CISTERN_BED_FILE,
  CISTERN_BED_FLIP_Y,
  WATER_DIP_DEEP,
  WATER_DIP_SHALLOW,
  WATER_INSET_MAX,
  WATER_INSET_MIN,
  WATER_NOISE_SPAN,
  PUDDLE_ALPHA_DECAL_DEEP,
  PUDDLE_ALPHA_DECAL_SHALLOW,
  cisternBedCellImageRect,
  cisternBedWorldUv,
  cisternRegion,
  compositeCisternBedRims,
  dryFacingFaces,
  floorDip,
  hasWaterNeighbor,
  listStrayPuddles,
  listWaterCells,
  listWaterGlintCells,
  listWaterRegions,
  paintedFloorSize,
  blendWaterOverInner,
  pickWaterInnerIndex,
  puddleAlpha,
  puddleCoverage,
  puddleEdgeInset,
  puddleEdgeIsIrregular,
  regionWorldUv,
  rimMaskForCell,
  rotateMaskCW,
  rgbaToMask,
  cellTorchWarmth,
  puddleReflectBoost,
  torchWarmthAt,
  wallProximity,
  waterDeepness,
  waterRippleHeight,
  waterWorldNoise,
  waterWorldUv
} from '../src/voxel-floor1/water';

const SRC = resolve(__dirname, '../src/voxel-floor1');

describe('voxel-floor1 water is one puddle per region', () => {
  const regions = listWaterRegions(floor1Map);
  const cistern = regions.find((r) => r.cells.some((c) => c.x === 2 && c.y === 2));
  const cellar = regions.find((r) => r.cells.some((c) => c.x === 5 && c.y === 11));

  it('flood-fills the cistern and cellar instead of a puddle per cell', () => {
    expect(regions).toHaveLength(2);
    expect(cistern?.cells).toHaveLength(12);
    expect(cistern?.minX).toBe(1);
    expect(cistern?.maxX).toBe(3);
    expect(cistern?.minY).toBe(1);
    expect(cistern?.maxY).toBe(4);
    expect(cellar?.cells.length).toBeGreaterThanOrEqual(7);
    expect(isWaterTile(tileAt(floor1Map, 2, 2))).toBe(true);
    expect(isWaterTile(tileAt(floor1Map, 4, 2))).toBe(false);
  });

  it('stays wet across water-to-water joins and insets only at dry borders', () => {
    expect(WATER_INSET_MIN).toBeGreaterThanOrEqual(0.1);
    expect(WATER_INSET_MAX).toBeLessThanOrEqual(0.16);
    expect(puddleCoverage(floor1Map, 2, 2, 0.5, 0.5)).toBeGreaterThan(0.85);
    expect(puddleCoverage(floor1Map, 2, 2, 0.99, 0.5)).toBeGreaterThan(0.8);
    expect(puddleCoverage(floor1Map, 2, 2, 0.5, 0.01)).toBeGreaterThan(0.8);
    expect(puddleCoverage(floor1Map, 1, 1, 0.5, 0.5)).toBeGreaterThan(0.7);
    expect(puddleCoverage(floor1Map, 1, 1, 0.02, 0.5)).toBeLessThan(0.4);
    expect(puddleCoverage(floor1Map, 1, 1, 0.5, 0.02)).toBeLessThan(0.4);
    expect(puddleCoverage(floor1Map, 3, 1, 0.98, 0.5)).toBeLessThan(0.4);
    expect(dryFacingFaces(floor1Map, 2, 2)).toEqual([]);
    expect(dryFacingFaces(floor1Map, 3, 1)).toContain('E');
    expect(dryFacingFaces(floor1Map, 3, 1)).not.toContain('W');
  });

  it('reads the cistern deep lane darker and more opaque than the shallow rim', () => {
    expect(cistern?.deep.some((c) => c.x === 2 && c.y === 1)).toBe(true);
    expect(cistern?.deep.some((c) => c.x === 2 && c.y === 2)).toBe(true);
    expect(waterDeepness(floor1Map, 2, 1, 0.5, 0.5)).toBe(1);
    expect(waterDeepness(floor1Map, 2, 2, 0.5, 0.5)).toBe(1);
    expect(waterDeepness(floor1Map, 3, 1, 0.5, 0.5)).toBeLessThan(0.4);
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(0.75);
    expect(puddleAlpha(floor1Map, 3, 1, 0.5, 0.5)).toBeGreaterThan(0.18);
    expect(puddleAlpha(floor1Map, 3, 1, 0.5, 0.5)).toBeLessThan(0.78);
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(
      puddleAlpha(floor1Map, 3, 1, 0.5, 0.5) + 0.12
    );
    expect(waterDeepness(floor1Map, 2, 1, 1, 0.5)).toBeCloseTo(
      waterDeepness(floor1Map, 3, 1, 0, 0.5),
      2
    );
    expect(Math.abs(floorDip(floor1Map, 2, 2, 1, 0.5) - floorDip(floor1Map, 3, 2, 0, 0.5))).toBeLessThan(
      0.003
    );
  });

  it('keeps puddle edges irregular and stray drips inside the cell', () => {
    for (const cell of listWaterCells(floor1Map)) {
      for (const face of dryFacingFaces(floor1Map, cell.x, cell.y)) {
        expect(puddleEdgeIsIrregular(floor1Map, cell.x, cell.y, face), `${cell.x},${cell.y} ${face}`).toBe(
          true
        );
        const along = [0.08, 0.22, 0.4, 0.58, 0.75, 0.92].map((t) =>
          puddleEdgeInset(cell.x, cell.y, face, t)
        );
        expect(Math.max(...along) - Math.min(...along), `${cell.x},${cell.y} ${face}`).toBeGreaterThan(0.012);
      }
    }
    for (const s of listStrayPuddles(floor1Map)) {
      const minX = s.x - s.sx / 2;
      const maxX = s.x + s.sx / 2;
      const minZ = s.z - s.sz / 2;
      const maxZ = s.z + s.sz / 2;
      expect(minX).toBeGreaterThan((s.tx - 0.5) * CELL - 1e-4);
      expect(maxX).toBeLessThan((s.tx + 0.5) * CELL + 1e-4);
      expect(minZ).toBeGreaterThan((s.tz - 0.5) * CELL - 1e-4);
      expect(maxZ).toBeLessThan((s.tz + 0.5) * CELL + 1e-4);
    }
  });
});

describe('voxel-floor1 water bed is inner plus dry-side rims', () => {
  it('picks inner or inner_2 per cell and never rims a water-water join', () => {
    const a = pickWaterInnerIndex(2, 2);
    expect(a === 0 || a === 1).toBe(true);
    expect(pickWaterInnerIndex(2, 2)).toBe(a);
    expect(pickWaterInnerIndex(3, 1)).not.toBeUndefined();

    const north = new Float32Array([1, 1, 0, 0]);
    const east = rotateMaskCW(north, 2, 1);
    expect(Array.from(east)).toEqual([0, 1, 0, 1]);
    const south = rotateMaskCW(north, 2, 2);
    expect(Array.from(south)).toEqual([0, 0, 1, 1]);
    const west = rotateMaskCW(north, 2, 3);
    expect(Array.from(west)).toEqual([1, 0, 1, 0]);

    const interior = rimMaskForCell(floor1Map, 2, 2, north, 2);
    expect(Math.max(...interior)).toBe(0);
    const southShore = rimMaskForCell(floor1Map, 2, 4, north, 2);
    expect(southShore[2]).toBeGreaterThan(0.5);
    expect(southShore[3]).toBeGreaterThan(0.5);
    expect(southShore[0]).toBe(0);

    const inner = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]);
    const water = new Uint8ClampedArray([200, 180, 160, 255, 200, 180, 160, 255, 200, 180, 160, 255, 200, 180, 160, 255]);
    const mask = new Float32Array([1, 0, 0, 0]);
    const mix = blendWaterOverInner(inner, water, mask, 2);
    expect(mix[0]).toBe(200);
    expect(mix[4]).toBe(10);
    expect(rgbaToMask(new Uint8ClampedArray([255, 255, 255, 255]), 1)[0]).toBe(1);
  });
});

describe('voxel-floor1 water dip leaves no border gap', () => {
  const defaultSize = CELL + 2 * (CAMERA_NEAR + 0.12);

  it('keeps the matching stone edge at floor height and dips only inside', () => {
    expect(WATER_DIP_SHALLOW).toBeGreaterThanOrEqual(0.02);
    expect(WATER_DIP_SHALLOW).toBeLessThanOrEqual(0.04);
    expect(WATER_DIP_DEEP).toBeGreaterThan(WATER_DIP_SHALLOW);
    expect(WATER_DIP_DEEP).toBeLessThanOrEqual(0.06);

    expect(floorDip(floor1Map, 1, 1, 0, 0.5)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 1, 1, 0.5, 0)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 3, 1, 1, 0.5)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 1, 1, 0.5, 0.5)).toBeLessThan(-0.015);
    expect(floorDip(floor1Map, 2, 1, 0.5, 0.5)).toBeLessThan(floorDip(floor1Map, 1, 1, 0.5, 0.5) - 0.01);
    expect(floorDip(floor1Map, 2, 2, 0.5, 0.5)).toBeLessThan(floorDip(floor1Map, 3, 2, 0.5, 0.5) - 0.01);
    expect(floorDip(floor1Map, 2, 2, 0.99, 0.5)).toBeLessThan(-0.01);

    expect(paintedFloorSize(4, 2, floor1Map, defaultSize)).toBe(CELL);
    expect(hasWaterNeighbor(floor1Map, 4, 2)).toBe(true);
    expect(paintedFloorSize(3, 14, floor1Map, defaultSize)).toBe(defaultSize);
    expect(isWaterCell(floor1Map, 2, 2)).toBe(true);
  });

  it('keeps torch glints on lit water only and does not build a square lip', () => {
    const glints = listWaterGlintCells(floor1Map, floor1Sconces);
    expect(glints.some((c) => c.x === 3 && c.y === 1)).toBe(true);
    expect(glints.some((c) => c.x === 2 && c.y === 2)).toBe(true);
    expect(glints.some((c) => c.x === 3 && c.y === 4)).toBe(false);
    expect(glints.some((c) => c.x === 5 && c.y === 11)).toBe(false);

    const mat = paintedShellMaterial(new THREE.Texture(), undefined, 'floor_water.png');
    expect(mat.clearcoat).toBe(0);
    expect(mat.roughness).toBeGreaterThanOrEqual(0.9);
    expect(mat.specularIntensity).toBe(0);
    expect(mat.fog).toBe(true);

    const water = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    const level = readFileSync(resolve(SRC, 'level.ts'), 'utf8');
    const main = readFileSync(resolve(SRC, 'main.ts'), 'utf8');
    expect(level).toContain('isWaterCell');
    expect(level).toContain('paintedFloorSize');
    expect(level).not.toContain('applyWaterBedPose');
    expect(main).toContain('buildFloor1Water');
    expect(water).toContain('listWaterRegions');
    expect(water).toContain('pickWaterInnerIndex');
    expect(water).toContain('rimMaskForCell');
    expect(water).toContain('paintSoftBlob');
    expect(water).toContain('water-shimmer');
    expect(water).toContain('waterWorldNoise');
    expect(water).toContain('tryLoadOptionalPng');
    expect(water).toContain('CISTERN_BED_FILE');
    expect(water).toContain('CISTERN_BED_FLIP_Y');
    expect(water).toContain('compositeCisternBedRims');
    expect(water).toContain('regionWorldUv');
    expect(water).toContain('torchWarmthAt');
    expect(water).toContain('puddleReflectBoost');
    expect(water).toContain("from './water-decals'");
    expect(water).toContain('water-decal-floor');
    expect(water).toContain('water-decals');
    expect(water).toContain('WATER_DECAL_FLOOR_FILE');
    expect(water).toContain('cellToDecalUv');
    expect(water).toContain('placeWaterDecals');
    expect(water).toContain('waterDecalPng');
    expect(water).toContain('DECAL_MASK_DARKEN');
    expect(water).toContain('PUDDLE_ALPHA_DECAL_SHALLOW');
    expect(water).toContain('y + dip');
    expect(water).not.toContain('water-wet-ring');
    expect(water).not.toContain('water-dry-slabs');
    expect(water).not.toContain('makeTextureGroutSampler');
    expect(water).not.toContain('WET_RING_MIN_M');
    expect(water).not.toContain('water-sparkles');
    expect(water).not.toMatch(/flipX|repeatWrapping.*water|scale\.x\s*=\s*-1/);
    expect(water).not.toContain('water-lips');
    expect(water).not.toContain('onBeforeCompile');
    expect(water).not.toContain('ShaderMaterial');
    expect(water).not.toContain('../proto3d/');
    expect(water).toContain('castShadow = false');
  });
});

describe('voxel-floor1 water is one world-space pool', () => {
  it('drives ripple and shimmer by world position with no 2 m repeat', () => {
    expect(WATER_NOISE_SPAN).toBeGreaterThan(8);
    expect(waterWorldUv(CELL, 0).u).toBeCloseTo(CELL / WATER_NOISE_SPAN, 6);
    expect(Math.abs(waterWorldNoise(0, 0) - waterWorldNoise(CELL, 0))).toBeGreaterThan(0.05);
    expect(Math.abs(waterWorldNoise(4, 5) - waterWorldNoise(4 + CELL, 5))).toBeGreaterThan(0.05);
    expect(Math.abs(waterWorldNoise(3.99, 7) - waterWorldNoise(4.01, 7))).toBeLessThan(0.02);
    expect(Math.abs(waterRippleHeight(4, 5, 1.5) - waterRippleHeight(4 + CELL, 5, 1.5))).toBeGreaterThan(
      0.0003
    );
    const a = waterWorldNoise(4, 5, 0);
    const b = waterWorldNoise(4, 5, 8);
    expect(Math.abs(a - b)).toBeGreaterThan(0.05);
  });

  it('keeps torch-radius warmth on lit water and leaves the cellar dark', () => {
    const torch = floor1Sconces.find((s) => s.x === 4 && s.y === 1);
    expect(torch).toBeTruthy();
    const p = torchWorldPos(torch!);
    expect(torchWarmthAt(p.x, p.z, floor1Sconces)).toBeGreaterThan(0.9);
    expect(torchWarmthAt(6, 2, floor1Sconces)).toBeGreaterThan(0.25);
    expect(torchWarmthAt(2, 8, floor1Sconces)).toBeLessThan(0.15);
    expect(torchWarmthAt(10, 22, floor1Sconces)).toBe(0);
    expect(cellTorchWarmth(3, 1, floor1Sconces)).toBeGreaterThan(0.25);
    expect(cellTorchWarmth(5, 11, floor1Sconces)).toBe(0);
    expect(TORCH_DISTANCE).toBeGreaterThan(4);
  });

  it('maps the cistern bed with flipY so the dark basin sits on (2,1) and (2,2)', () => {
    const region = cisternRegion(floor1Map);
    expect(region).toBeTruthy();
    expect(CISTERN_BED_FILE).toBe('cistern_bed.png');
    expect(CISTERN_BED_FLIP_Y).toBe(true);
    const file = resolve(__dirname, '../public/proto3d/tex3d', CISTERN_BED_FILE);
    expect(existsSync(file)).toBe(true);
    const buf = readFileSync(file);
    expect(buf.readUInt32BE(16)).toBe(768);
    expect(buf.readUInt32BE(20)).toBe(1024);

    const sw = regionWorldUv(region!, (region!.minX - 0.5) * CELL, (region!.minY - 0.5) * CELL);
    expect(sw.u).toBeCloseTo(0, 5);
    expect(sw.v).toBeCloseTo(0, 5);
    const deepN = cisternBedWorldUv(floor1Map, 2 * CELL, 1 * CELL);
    const deepS = cisternBedWorldUv(floor1Map, 2 * CELL, 2 * CELL);
    const south = cisternBedWorldUv(floor1Map, 2 * CELL, 4 * CELL);
    expect(deepN.u).toBeCloseTo(0.5, 5);
    expect(deepN.v).toBeCloseTo(0.875, 5);
    expect(deepS.v).toBeCloseTo(0.625, 5);
    expect(south.v).toBeCloseTo(0.125, 5);
    expect(deepN.v).toBeGreaterThan(deepS.v);
    expect(deepS.v).toBeGreaterThan(south.v);

    const northRect = cisternBedCellImageRect(region!, 2, 1, 768, 1024);
    expect(northRect.x).toBeCloseTo(256, 5);
    expect(northRect.y).toBeCloseTo(0, 5);
    const midRect = cisternBedCellImageRect(region!, 2, 2, 768, 1024);
    expect(midRect.y).toBeCloseTo(256, 5);

    const luma = execFileSync(
      'python3',
      [
        '-c',
        `
from PIL import Image
im = Image.open(${JSON.stringify(file)}).convert('RGBA')
def avg(c, r):
    x0, y0 = c * 256, r * 256
    pix = [im.getpixel((x0 + x, y0 + y)) for y in range(64, 192) for x in range(64, 192)]
    return sum(0.2126*p[0] + 0.7152*p[1] + 0.0722*p[2] for p in pix) / len(pix)
print('ok', avg(1, 0), avg(1, 1), avg(1, 3), avg(2, 3))
`
      ],
      { encoding: 'utf8' }
    );
    const [, n, mid, s, se] = luma.trim().split(/\s+/).map(Number);
    expect(n).toBeGreaterThan(0);
    expect(mid).toBeLessThan(s);
    expect(mid).toBeLessThan(se);
  });

  it('keeps dry-edge rims on the cistern and per-cell inners on the cellar', () => {
    expect(dryFacingFaces(floor1Map, 3, 2)).toContain('E');
    expect(dryFacingFaces(floor1Map, 2, 4)).toContain('S');
    expect(dryFacingFaces(floor1Map, 2, 2)).toEqual([]);
    const region = cisternRegion(floor1Map)!;
    const north = new Float32Array([1, 1, 0, 0]);
    const bed = {
      width: 6,
      height: 8,
      data: new Uint8ClampedArray(6 * 8 * 4)
    };
    for (let i = 0; i < 6 * 8; i++) {
      bed.data[i * 4] = 10;
      bed.data[i * 4 + 1] = 10;
      bed.data[i * 4 + 2] = 10;
      bed.data[i * 4 + 3] = 255;
    }
    const rim = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255]);
    const out = compositeCisternBedRims(bed, rim, north, 2, floor1Map, region);
    const at = (x: number, y: number) => out[(y * 6 + x) * 4];
    expect(at(2, 3)).toBe(10);
    expect(at(3, 3)).toBe(10);
    expect(at(2, 7)).toBeGreaterThan(100);
    expect(at(3, 7)).toBeGreaterThan(100);
    expect(at(5, 2)).toBeGreaterThan(100);
    expect(at(5, 3)).toBeGreaterThan(100);
    expect(readFileSync(resolve(SRC, 'water.ts'), 'utf8')).toContain('pickWaterInnerIndex');
  });
});

describe('voxel-floor1 puddle decals lock to floor_stone', () => {
  afterEach(() => {
    clearWaterDecalMasks();
  });

  it('tiles puddle_shore_s west to east on the cistern south shore', () => {
    const shore = WATER_DECALS.filter((d) => d.id === 'puddle_shore_s');
    expect(CISTERN_SHORE_Y).toBe(4);
    expect([...CISTERN_SHORE_XS]).toEqual([1, 2, 3]);
    expect(shore.map((d) => d.x)).toEqual([1, 2, 3]);
    expect(shore.every((d) => d.y === 4 && d.rot === 0)).toBe(true);
    expect(WATER_DECALS.filter((d) => d.x === 2 && d.y === 2)).toHaveLength(0);
  });

  it('puts puddle_3 on east-west water runs and 1/2 on leftover cells', () => {
    const placed = placeWaterDecals(floor1Map);
    const byCell = new Map(placed.map((d) => [`${d.x},${d.y}`, d]));
    for (const x of [5, 6]) expect(byCell.get(`${x},10`)?.id).toBe('puddle_3');
    for (const x of [4, 5, 6, 7]) expect(byCell.get(`${x},11`)?.id).toBe('puddle_3');
    for (const x of [4, 5, 6]) expect(byCell.get(`${x},12`)?.id).toBe('puddle_3');
    expect(placed.some((d) => d.id === 'puddle_3' && !isWaterCell(floor1Map, d.x - 1, d.y) && !isWaterCell(floor1Map, d.x + 1, d.y))).toBe(false);
    const solos = placed.filter((d) => d.id === 'puddle_1' || d.id === 'puddle_2');
    for (const d of solos) {
      expect(isWaterCell(floor1Map, d.x - 1, d.y) && isWaterCell(floor1Map, d.x + 1, d.y)).toBe(false);
      expect(d.id).toBe(pickSoloPuddleId(d.x, d.y));
    }
    expect(DECAL_MASK_DARKEN).toBeCloseTo(0.5, 5);
    expect(waterDecalPng('puddle_shore_s')).toBe('puddles/puddle_shore_s.png');
    expect(waterDecalMaskPng('puddle_3')).toBe('puddles/puddle_3_mask.png');
    expect(WATER_DECAL_DIR).toBe('puddles');
  });

  it('ships each artist decal as 512×512 RGBA plus a mask under puddles/', () => {
    for (const id of ['puddle_1', 'puddle_2', 'puddle_3', 'puddle_shore_s'] as const) {
      const file = resolve(__dirname, '../public/proto3d/tex3d', waterDecalPng(id));
      const mask = resolve(__dirname, '../public/proto3d/tex3d', waterDecalMaskPng(id));
      expect(existsSync(file), file).toBe(true);
      expect(existsSync(mask), mask).toBe(true);
      const decal = readFileSync(file);
      expect(decal.readUInt32BE(16)).toBe(512);
      expect(decal.readUInt32BE(20)).toBe(512);
    }
  });

  it('forces floor_stone.png under every decal cell, never _2/_3/_4', () => {
    expect(WATER_DECAL_FLOOR_FILE).toBe('floor_stone.png');
    expect(WATER_DECAL_PX).toBe(512);
    expect(WATER_DECAL_PX / 256).toBe(2);
    const stone = resolve(__dirname, '../public/proto3d/tex3d', WATER_DECAL_FLOOR_FILE);
    expect(existsSync(stone)).toBe(true);
    const buf = readFileSync(stone);
    expect(buf.readUInt32BE(16)).toBe(256);
    expect(buf.readUInt32BE(20)).toBe(256);
    for (const d of WATER_DECALS) {
      expect(decalFloorFile(d.x, d.y)).toBe(WATER_DECAL_FLOOR_FILE);
    }
    expect(decalFloorFile(2, 2)).toBeUndefined();
    expect(decalFloorFile(5, 11)).toBe(WATER_DECAL_FLOOR_FILE);
    expect(FLOOR_VARIANTS.filter((f) => f !== WATER_DECAL_FLOOR_FILE)).toEqual([
      'floor_stone_2.png',
      'floor_stone_3.png',
      'floor_stone_4.png'
    ]);
  });

  it('rotates and mirrors floor UVs identically to the decal', () => {
    const uv = (got: { u: number; v: number }, u: number, v: number) => {
      expect(got.u).toBeCloseTo(u, 10);
      expect(got.v).toBeCloseTo(v, 10);
    };
    uv(decalUv(0.2, 0.3, 0, false), 0.2, 0.3);
    uv(decalUv(0.2, 0.3, 90, false), 0.3, 0.8);
    uv(decalUv(0.2, 0.3, 180, false), 0.8, 0.7);
    uv(decalUv(0.2, 0.3, 270, false), 0.7, 0.2);
    uv(decalUv(0.2, 0.3, 0, true), 0.8, 0.3);
    uv(decalUv(0.2, 0.3, 90, true), 0.3, 0.2);
    uv(cellToDecalUv(0.25, 0.1, 0, false), 0.25, 0.9);
    expect(cellToDecalUv(0.25, 0.1, 90, false)).toEqual(decalUv(0.25, 0.9, 90, false));
    expect(cellToDecalUv(0.25, 0.1, 180, true)).toEqual(decalUv(0.25, 0.9, 180, true));
  });

  it('slices a left-to-right strip and lets the mask set the shoreline', () => {
    const strip = {
      width: 1536,
      height: 4,
      data: new Uint8ClampedArray(1536 * 4 * 4)
    };
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 1536; x++) {
        const i = (y * 1536 + x) * 4;
        strip.data[i] = x < 512 ? 10 : x < 1024 ? 80 : 160;
        strip.data[i + 3] = 255;
      }
    }
    expect(sliceDecalTile(strip, 0).data[0]).toBe(10);
    expect(sliceDecalTile(strip, 1).data[0]).toBe(80);
    expect(sliceDecalTile(strip, 2).data[0]).toBe(160);

    const ph = makePlaceholderPuddleDecal(0, 'S');
    expect(ph.decal.width).toBe(512);
    expect(ph.mask.width).toBe(512);
    installDecalMaskFromPixels(1, 4, ph.mask);
    expect(sampleWaterDecalMask(1, 4, 0.5, 0.12)).toBeGreaterThan(0.7);
    expect(sampleWaterDecalMask(1, 4, 0.5, 0.92)).toBeLessThan(0.3);
    expect(puddleCoverage(floor1Map, 1, 4, 0.5, 0.12)).toBeGreaterThan(0.7);
    expect(puddleCoverage(floor1Map, 1, 4, 0.5, 0.92)).toBeLessThan(0.3);
    expect(floorDip(floor1Map, 1, 4, 0.5, 0.12)).toBeLessThan(-0.015);
    expect(floorDip(floor1Map, 1, 4, 0.5, 0.92)).toBeCloseTo(0, 3);
  });

  it('keeps the water veil thin on cellar decals and joins the cistern shore', () => {
    expect(hasWaterDecal(1, 4)).toBe(true);
    expect(hasWaterDecal(5, 11)).toBe(true);
    expect(hasWaterDecal(2, 1)).toBe(false);
    expect(PUDDLE_ALPHA_DECAL_SHALLOW).toBeLessThan(0.28);
    expect(PUDDLE_ALPHA_DECAL_DEEP).toBeLessThan(0.42);
    expect(puddleAlpha(floor1Map, 5, 11, 0.5, 0.5)).toBeLessThan(0.4);
    expect(puddleAlpha(floor1Map, 1, 4, 0.5, 0.5)).toBeGreaterThan(
      puddleAlpha(floor1Map, 5, 11, 0.5, 0.5)
    );
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(0.75);
  });
});

describe('voxel-floor1 water keeps a faint torch bounce', () => {
  it('adds a faint broken wall reflection only inside the torch radius', () => {
    expect(wallProximity(floor1Map, 1, 1, 0.1, 0.5)).toBeGreaterThan(0.4);
    expect(wallProximity(floor1Map, 2, 2, 0.5, 0.5)).toBeLessThan(0.2);
    expect(puddleReflectBoost(0, 0.2, 4, 8, 0.8)).toBe(0);
    expect(puddleReflectBoost(0.4, 0.2, 4, 8, 0.8)).toBeGreaterThan(0.01);
    expect(puddleReflectBoost(0.4, 0.2, 4, 8, 0.8)).toBeLessThan(0.2);
  });
});
