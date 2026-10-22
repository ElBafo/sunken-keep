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
  SHORE_WIDE_COLS,
  SHORE_WIDE_ID,
  WATER_DECAL_DIR,
  WATER_DECAL_FLOOR_FILE,
  WATER_DECAL_PX,
  WATER_DECALS,
  cellToDecalUv,
  clearWaterDecalMasks,
  compositeDecalOverStone,
  decalFloorFile,
  decalUv,
  hasWaterDecal,
  isCrackPuddleDecal,
  isShoreWideDecal,
  installDecalMaskFromPixels,
  makePlaceholderPuddleDecal,
  pickSoloPuddleId,
  placeWaterDecals,
  sampleWaterDecalMask,
  shoreWideWorldUv,
  sliceDecalTile,
  waterDecalMaskPng,
  waterDecalPng
} from '../src/voxel-floor1/water-decals';
import {
  CISTERN_BED_FILE,
  CISTERN_BED_FLIP_Y,
  CISTERN_DOOR_CELL,
  CISTERN_DOOR_WATER_CELL,
  WATER_DIP_DEEP,
  WATER_DIP_SHALLOW,
  WATER_INSET_MAX,
  WATER_INSET_MIN,
  WATER_SURFACE_MIN_BELOW,
  DECAL_LIFT,
  DECAL_OFFSET_FACTOR,
  DECAL_OFFSET_UNITS,
  hasDecalNeighbor,
  waterOverlayY,
  puddleSurfaceY,
  WATER_NOISE_SPAN,
  PUDDLE_ALPHA_DECAL_DEEP,
  PUDDLE_ALPHA_DECAL_SHALLOW,
  PUDDLE_SPECULAR,
  SHORE_LIP_GLINT,
  SHORE_LIP_WARM,
  CRACK_PUDDLE_ALPHA,
  CRACK_PUDDLE_COOL,
  CRACK_PUDDLE_DARKEN,
  CRACK_PUDDLE_OVERLAY_DARKEN,
  CRACK_PUDDLE_RGB,
  CRACK_PUDDLE_SPECULAR,
  WATER_SPLASH_M,
  cisternBedCellImageRect,
  cisternBedWorldUv,
  cisternRegion,
  compositeCisternDoorRim,
  liftCisternBedFlags,
  matchRimLumaToBed,
  dryFacingFaces,
  floorDip,
  hasWaterNeighbor,
  listStrayPuddles,
  listWaterCells,
  listWaterGlintCells,
  listWaterfallSplashes,
  listWaterRegions,
  paintedFloorSize,
  paintedFloorDefaultSize,
  listPaintedFloorQuads,
  paintedFloorQuadsCoveringCell,
  overlappingPaintedFloorPairs,
  blendWaterOverInner,
  pickWaterInnerIndex,
  puddleAlpha,
  puddleCoverage,
  neighborDecalMaskAcross,
  crackPuddleAlbedo,
  lanternWarmthAt,
  shoreLipResponse,
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
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(0.2);
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeLessThan(0.4);
    expect(puddleAlpha(floor1Map, 3, 1, 0.5, 0.5)).toBeGreaterThan(0.08);
    expect(puddleAlpha(floor1Map, 3, 1, 0.5, 0.5)).toBeLessThan(0.28);
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(
      puddleAlpha(floor1Map, 3, 1, 0.5, 0.5) + 0.05
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
    expect(WATER_DIP_SHALLOW).toBeGreaterThanOrEqual(0.06);
    expect(WATER_DIP_SHALLOW).toBeLessThanOrEqual(0.08);
    expect(WATER_DIP_DEEP).toBeGreaterThan(WATER_DIP_SHALLOW);
    expect(WATER_DIP_DEEP).toBeGreaterThanOrEqual(0.08);
    expect(WATER_DIP_DEEP).toBeLessThanOrEqual(0.1);

    expect(floorDip(floor1Map, 1, 1, 0, 0.5)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 1, 1, 0.5, 0)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 3, 1, 1, 0.5)).toBeCloseTo(0, 3);
    expect(floorDip(floor1Map, 1, 1, 0.5, 0.5)).toBeLessThan(-0.015);
    expect(floorDip(floor1Map, 2, 1, 0.5, 0.5)).toBeLessThan(floorDip(floor1Map, 1, 1, 0.5, 0.5) - 0.01);
    expect(floorDip(floor1Map, 2, 2, 0.5, 0.5)).toBeLessThan(floorDip(floor1Map, 3, 2, 0.5, 0.5) - 0.01);
    expect(floorDip(floor1Map, 2, 2, 0.99, 0.5)).toBeLessThan(-0.01);

    expect(paintedFloorSize(4, 2, floor1Map, defaultSize)).toBe(CELL);
    expect(hasWaterNeighbor(floor1Map, 4, 2)).toBe(true);
    expect(hasDecalNeighbor(2, 6)).toBe(true);
    expect(paintedFloorSize(2, 6, floor1Map, defaultSize)).toBe(CELL);
    expect(paintedFloorSize(3, 14, floor1Map, defaultSize)).toBe(CELL);
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
    expect(water).toContain('water-fall-splash');
    expect(water).toContain('water-fall-glints');
    expect(water).toContain('waterWorldNoise');
    expect(water).toContain('tryLoadOptionalPng');
    expect(water).toContain('CISTERN_BED_FILE');
    expect(water).toContain('CISTERN_BED_FLIP_Y');
    expect(water).toContain('compositeCisternBedRims');
    expect(water).toContain('liftCisternBedFlags');
    expect(water).toContain('regionWorldUv');
    expect(water).toContain('torchWarmthAt');
    expect(water).toContain('puddleReflectBoost');
    expect(water).toContain("from './water-decals'");
    expect(water).toContain('water-decal-floor');
    expect(water).toContain('water-decals');
    expect(water).toContain('water-shore-wide');
    expect(water).toContain('water-shore-paint');
    expect(water).toContain('water-shore-rim');
    expect(water).toContain('stonePng.texture');
    expect(water).toContain('neighborDecalMaskAcross');
    expect(water).toContain('shoreWideWorldUv');
    expect(water).toContain('shoreLipResponse');
    expect(water).toContain('WATER_DECAL_FLOOR_FILE');
    expect(water).toContain('cellToDecalUv');
    expect(water).toContain('placeWaterDecals');
    expect(water).toContain('waterDecalPng');
    expect(water).toContain('DECAL_MASK_DARKEN');
    expect(water).toContain('PUDDLE_ALPHA_DECAL_SHALLOW');
    expect(water).toContain('water-crack-puddles');
    expect(water).toContain('water-crack-glints');
    expect(water).toContain('CRACK_PUDDLE_SPECULAR');
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

describe('voxel-floor1 floor overlays stay off the dry stone', () => {
  it('keeps the wet film below the floor at the cistern door and shore', () => {
    expect(WATER_SURFACE_MIN_BELOW).toBeGreaterThanOrEqual(0.06);
    expect(WATER_SURFACE_MIN_BELOW).toBeLessThanOrEqual(0.1);
    expect(DECAL_LIFT).toBeGreaterThanOrEqual(0.006);
    expect(DECAL_LIFT).toBeLessThan(0.02);
    expect(DECAL_OFFSET_FACTOR).toBeLessThan(0);
    expect(DECAL_OFFSET_UNITS).toBeLessThanOrEqual(-8);
    expect(waterOverlayY(0)).toBeCloseTo(-WATER_SURFACE_MIN_BELOW, 5);
    expect(waterOverlayY(0, 0.002)).toBeLessThanOrEqual(-0.06);
    expect(waterOverlayY(-0.09)).toBeCloseTo(-0.09 + DECAL_LIFT, 5);
    expect(waterOverlayY(-0.09)).toBeLessThan(-WATER_SURFACE_MIN_BELOW + 1e-6);
    expect(puddleSurfaceY(floor1Map, 3, 2, 1, 0.5)).toBeLessThanOrEqual(-0.06);
    expect(puddleSurfaceY(floor1Map, 3, 2, 0.5, 0.5)).toBeLessThan(-0.05);
    expect(puddleSurfaceY(floor1Map, 4, 2, 0.5, 0.5)).toBeLessThanOrEqual(-0.06);
    expect(puddleSurfaceY(floor1Map, 1, 5, 0.5, 0.92)).toBeLessThanOrEqual(-0.06);
    expect(floorDip(floor1Map, 4, 2, 0.5, 0.5)).toBeCloseTo(0, 3);
  });

  it('does not stretch an untextured film onto the dry shore or skip polygonOffset', () => {
    const water = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    expect(water).toContain('polygonOffsetFactor: DECAL_OFFSET_FACTOR');
    expect(water).toContain('function floorOverlayFlags');
    expect(water).toContain('depthWrite: false');
    expect(water).toContain('alphaTest');
    expect(water).toContain('.filter((c) => !hasWaterDecal(c.x, c.y))');
    expect(water).not.toContain('shorePlacements.map((p) => ({ x: p.spec.x, y: p.spec.y }))');
    expect(hasWaterDecal(1, 5)).toBe(true);
    expect(hasWaterDecal(4, 2)).toBe(false);
    expect(isWaterCell(floor1Map, 4, 2)).toBe(false);
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

  it('keeps the cistern bed dark at dry-facing edges and lifts flags only', () => {
    expect(CISTERN_DOOR_CELL).toEqual({ x: 4, y: 2 });
    expect(CISTERN_DOOR_WATER_CELL).toEqual({ x: 3, y: 2 });
    expect(dryFacingFaces(floor1Map, 3, 2)).toContain('E');
    expect(isWaterCell(floor1Map, 4, 2)).toBe(false);
    expect(isWaterCell(floor1Map, 3, 2)).toBe(true);
    expect(hasWaterNeighbor(floor1Map, 4, 2)).toBe(true);
    expect(dryFacingFaces(floor1Map, 2, 4)).toContain('S');
    expect(dryFacingFaces(floor1Map, 2, 2)).toEqual([]);
    const bed = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([20, 22, 21, 255, 58, 62, 55, 255])
    };
    const out = liftCisternBedFlags(bed);
    expect(out[0]).toBe(20);
    expect(out[1]).toBe(22);
    expect(out[4]).toBeGreaterThan(58);
    expect(out[4] - out[0]).toBeGreaterThan(58 - 20);
    const pale = new Uint8ClampedArray([80, 80, 80, 255, 80, 80, 80, 255]);
    const matched = matchRimLumaToBed(pale, new Uint8ClampedArray([20, 20, 20, 255, 20, 20, 20, 255]));
    expect(matched[0]).toBe(20);
    expect(matchRimLumaToBed(pale, pale)[0]).toBe(80);
    const region = cisternRegion(floor1Map)!;
    const north = new Float32Array([1, 1, 0, 0]);
    const doorBed = {
      width: 6,
      height: 8,
      data: new Uint8ClampedArray(6 * 8 * 4)
    };
    for (let i = 0; i < 6 * 8; i++) {
      doorBed.data[i * 4] = 20;
      doorBed.data[i * 4 + 1] = 20;
      doorBed.data[i * 4 + 2] = 20;
      doorBed.data[i * 4 + 3] = 255;
    }
    const rim = new Uint8ClampedArray([40, 40, 40, 255, 80, 80, 80, 255, 40, 40, 40, 255, 80, 80, 80, 255]);
    const rimmed = compositeCisternDoorRim(doorBed, rim, north, 2, floor1Map, region);
    const at = (x: number, y: number) => rimmed[(y * 6 + x) * 4];
    expect(at(2, 3)).toBe(20);
    expect(at(2, 7)).toBe(20);
    expect(at(5, 2)).not.toBe(20);
    expect(at(5, 2)).toBeLessThan(50);
    expect(at(5, 3)).toBeLessThan(50);
    const src = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    const build = src.slice(src.indexOf('export async function buildFloor1Water'));
    expect(build).toContain('liftCisternBedFlags');
    expect(build).toContain('compositeCisternDoorRim');
    expect(build).not.toContain('compositeCisternBedRims');
    expect(src).toContain('pickWaterInnerIndex');
  });
});

describe('voxel-floor1 puddle decals lock to floor_stone', () => {
  afterEach(() => {
    clearWaterDecalMasks();
  });

  it('maps puddle_shore_s_wide west to east on the cistern south shore', () => {
    const shore = WATER_DECALS.filter((d) => d.id === SHORE_WIDE_ID);
    expect(CISTERN_SHORE_Y).toBe(5);
    expect([...CISTERN_SHORE_XS]).toEqual([1, 2, 3]);
    expect(SHORE_WIDE_COLS).toBe(3);
    expect(isShoreWideDecal(SHORE_WIDE_ID)).toBe(true);
    expect(isShoreWideDecal('puddle_shore_s')).toBe(false);
    expect(isWaterCell(floor1Map, 1, 4)).toBe(true);
    expect(isWaterCell(floor1Map, 1, 5)).toBe(false);
    expect(shore.map((d) => d.x)).toEqual([1, 2, 3]);
    expect(shore.map((d) => d.tile)).toEqual([0, 1, 2]);
    expect(shore.every((d) => d.y === 5 && d.rot === 0 && !d.mirror)).toBe(true);
    expect(WATER_DECALS.filter((d) => d.id === 'puddle_shore_s')).toHaveLength(0);
    expect(WATER_DECALS.filter((d) => d.x === 2 && d.y === 2)).toHaveLength(0);
    expect(shoreWideWorldUv(1, 0)).toBeCloseTo(0, 10);
    expect(shoreWideWorldUv(2, 0.5)).toBeCloseTo(0.5, 10);
    expect(shoreWideWorldUv(3, 1)).toBeCloseTo(1, 10);
    expect(shoreLipResponse(0)).toBe(0);
    expect(shoreLipResponse(1)).toBeLessThan(0.08);
    expect(shoreLipResponse(0.32)).toBeGreaterThan(0.4);
    expect(shoreLipResponse(0.32)).toBeGreaterThan(shoreLipResponse(0.9));
    expect(SHORE_LIP_GLINT).toBeGreaterThan(0.2);
    expect(SHORE_LIP_GLINT).toBeLessThan(0.6);
    expect(SHORE_LIP_WARM.r).toBeGreaterThan(SHORE_LIP_WARM.b);
    expect(lanternWarmthAt(4, 9.08, 4, 9.08)).toBe(1);
    expect(lanternWarmthAt(4, 7.6, 4, 9.08)).toBeGreaterThan(0.2);
    const water = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    const build = water.slice(water.indexOf('export async function buildFloor1Water'));
    expect(water).toContain('water-shore-rim');
    expect(water).toContain('SHORE_LIP_GLINT');
    expect(water).not.toContain('water-lips');
    expect(build).toContain('paintedShellMaterial(stonePng.texture');
    expect(build).not.toContain('compositeDecalOverStone');
    expect(water).toContain('waterOverlayY');
    expect(build).toContain('floorOverlayFlags');
    expect(build).toContain('DECAL_LIFT');
    expect(build).not.toContain('shorePlacements.map((p) => ({ x: p.spec.x, y: p.spec.y }))');
    const stone = new THREE.Texture();
    paintedShellMaterial(stone, undefined, WATER_DECAL_FLOOR_FILE);
    expect(stone.generateMipmaps).toBe(true);
    expect(stone.magFilter).toBe(THREE.NearestFilter);
    expect(stone.minFilter).toBe(THREE.NearestMipmapNearestFilter);
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
    expect(waterDecalPng(SHORE_WIDE_ID)).toBe('puddles/puddle_shore_s_wide.png');
    expect(waterDecalMaskPng(SHORE_WIDE_ID)).toBe('puddles/puddle_shore_s_wide_mask.png');
    expect(waterDecalMaskPng('puddle_3')).toBe('puddles/puddle_3_mask.png');
    expect(WATER_DECAL_DIR).toBe('puddles');
  });

  it('ships each artist decal as 512×512 RGBA plus a mask under puddles/', () => {
    for (const id of ['puddle_1', 'puddle_2', 'puddle_3'] as const) {
      const file = resolve(__dirname, '../public/proto3d/tex3d', waterDecalPng(id));
      const mask = resolve(__dirname, '../public/proto3d/tex3d', waterDecalMaskPng(id));
      expect(existsSync(file), file).toBe(true);
      expect(existsSync(mask), mask).toBe(true);
      const decal = readFileSync(file);
      expect(decal.readUInt32BE(16)).toBe(512);
      expect(decal.readUInt32BE(20)).toBe(512);
    }
    const wide = resolve(__dirname, '../public/proto3d/tex3d', waterDecalPng(SHORE_WIDE_ID));
    const wideMask = resolve(__dirname, '../public/proto3d/tex3d', waterDecalMaskPng(SHORE_WIDE_ID));
    expect(existsSync(wide), wide).toBe(true);
    expect(existsSync(wideMask), wideMask).toBe(true);
    const wideBuf = readFileSync(wide);
    expect(wideBuf.readUInt32BE(16)).toBe(1536);
    expect(wideBuf.readUInt32BE(20)).toBe(512);
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
    const stone = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255
      ])
    };
    const paint = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        200, 0, 0, 0, 200, 0, 0, 255, 200, 0, 0, 0, 200, 0, 0, 128
      ])
    };
    const baked = compositeDecalOverStone(stone, paint, 2);
    expect(baked.data[0]).toBe(10);
    expect(baked.data[4]).toBe(200);
    expect(baked.data[12]).toBe(105);
    expect(baked.data[3]).toBe(255);

    const ph = makePlaceholderPuddleDecal(0, 'S');
    expect(ph.decal.width).toBe(512);
    expect(ph.mask.width).toBe(512);
    installDecalMaskFromPixels(1, 5, ph.mask);
    expect(sampleWaterDecalMask(1, 5, 0.5, 0.12)).toBeGreaterThan(0.7);
    expect(sampleWaterDecalMask(1, 5, 0.5, 0.92)).toBeLessThan(0.3);
    expect(puddleCoverage(floor1Map, 1, 5, 0.5, 0.12)).toBeGreaterThan(0.7);
    expect(puddleCoverage(floor1Map, 1, 5, 0.5, 0.92)).toBeLessThan(0.3);
    expect(floorDip(floor1Map, 1, 5, 0.5, 0.12)).toBeLessThan(-0.015);
    expect(floorDip(floor1Map, 1, 5, 0.5, 0.92)).toBeCloseTo(0, 3);
    expect(neighborDecalMaskAcross('S', 1, 5, 0.5)).toBeGreaterThan(0.7);
    expect(puddleCoverage(floor1Map, 1, 4, 0.5, 0.98)).toBeGreaterThan(0.8);
    expect(
      Math.abs(floorDip(floor1Map, 1, 4, 0.5, 0.99) - floorDip(floor1Map, 1, 5, 0.5, 0.01))
    ).toBeLessThan(0.01);
  });

  it('keeps the water veil thin on painted shore cells', () => {
    expect(hasWaterDecal(1, 5)).toBe(true);
    expect(hasWaterDecal(1, 4)).toBe(false);
    expect(hasWaterDecal(5, 11)).toBe(true);
    expect(hasWaterDecal(2, 1)).toBe(false);
    expect(PUDDLE_ALPHA_DECAL_SHALLOW).toBeLessThan(0.08);
    expect(PUDDLE_ALPHA_DECAL_DEEP).toBeLessThan(0.12);
    expect(puddleAlpha(floor1Map, 1, 5, 0.5, 0.5)).toBeLessThan(0.12);
    expect(puddleAlpha(floor1Map, 2, 1, 0.5, 0.5)).toBeGreaterThan(0.2);
    expect(PUDDLE_SPECULAR).toBeLessThan(0.12);
  });
});

describe('voxel-floor1 crack puddles are dark cool water, not brown mud', () => {
  it('darkens and cools albedo inside the mask', () => {
    expect(isCrackPuddleDecal('puddle_3')).toBe(true);
    expect(isCrackPuddleDecal('puddle_1')).toBe(true);
    expect(isCrackPuddleDecal('puddle_shore_s')).toBe(false);
    expect(isCrackPuddleDecal(SHORE_WIDE_ID)).toBe(false);
    expect(CRACK_PUDDLE_DARKEN).toBeGreaterThan(DECAL_MASK_DARKEN);
    expect(CRACK_PUDDLE_OVERLAY_DARKEN).toBeGreaterThan(0.3);
    expect(CRACK_PUDDLE_COOL.b).toBeGreaterThan(CRACK_PUDDLE_COOL.r);
    expect(CRACK_PUDDLE_RGB.b).toBeGreaterThan(CRACK_PUDDLE_RGB.r);
    expect(CRACK_PUDDLE_RGB.r).toBeLessThan(0.03);
    const wet = crackPuddleAlbedo(1, true);
    const dry = crackPuddleAlbedo(0, true);
    expect(wet.r).toBeLessThan(0.3);
    expect(wet.b).toBeGreaterThan(wet.r);
    expect(wet.r).toBeLessThan(dry.r - 0.4);
    expect(dry.r).toBeCloseTo(1, 5);
  });

  it('keeps a thin specular film, slow ripple, and lantern/torch glints', () => {
    expect(CRACK_PUDDLE_ALPHA).toBeGreaterThan(0.1);
    expect(CRACK_PUDDLE_ALPHA).toBeLessThan(0.28);
    expect(CRACK_PUDDLE_SPECULAR).toBeGreaterThan(PUDDLE_SPECULAR);
    expect(CRACK_PUDDLE_SPECULAR).toBeLessThan(0.35);
    expect(puddleAlpha(floor1Map, 5, 11, 0.5, 0.5)).toBeGreaterThan(0.1);
    expect(puddleAlpha(floor1Map, 5, 11, 0.5, 0.5)).toBeLessThan(0.28);
    expect(puddleAlpha(floor1Map, 5, 11, 0.5, 0.5)).toBeGreaterThan(
      puddleAlpha(floor1Map, 1, 4, 0.5, 0.5)
    );
    expect(lanternWarmthAt(0, 0, 0, 0)).toBe(1);
    expect(lanternWarmthAt(8, 8, 0, 0)).toBe(0);
    expect(cellTorchWarmth(5, 11, floor1Sconces)).toBe(0);
    const water = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    expect(water).toContain('water-crack-puddles');
    expect(water).toContain('water-crack-glints');
    expect(water).toContain('lanternWarmthAt');
    expect(water).toContain('CRACK_PUDDLE_RGB');
    expect(water).toContain('crack: true');
    expect(water).toContain('normalMap.offset.set');
    expect(readFileSync(resolve(SRC, 'main.ts'), 'utf8')).toContain(
      'water.update(now, preserveBuffer, camera)'
    );
  });
});

describe('voxel-floor1 waterfall splash is a dark ring, not a disc', () => {
  it('places a small splash under the cistern ceiling beam', () => {
    const hits = listWaterfallSplashes(floor1Map);
    expect(WATER_SPLASH_M).toBeGreaterThan(0.4);
    expect(WATER_SPLASH_M).toBeLessThan(1.1);
    expect(hits.some((h) => h.tx === 2 && h.tz === 2)).toBe(true);
    expect(hits.every((h) => h.span === WATER_SPLASH_M)).toBe(true);
    expect(hits.every((h) => isWaterCell(floor1Map, h.tx, h.tz))).toBe(true);
    expect(readFileSync(resolve(SRC, 'water.ts'), 'utf8')).toContain('makeWaterfallSplash');
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

describe('voxel-floor1 painted floors share edges', () => {
  const corridor = [
    [2, 8],
    [2, 7],
    [2, 6],
    [4, 2],
    [5, 2],
    [5, 1],
    [5, 3],
    [3, 14]
  ] as const;

  it('keeps one CELL-sized flagstone quad per dry cell with no neighbour overlap', () => {
    const quads = listPaintedFloorQuads(floor1Map);
    for (const [x, y] of corridor) {
      const hits = paintedFloorQuadsCoveringCell(quads, x, y);
      expect(hits, `cell ${x},${y} covered by ${hits.map((h) => `${h.tx},${h.tz}:${h.file}/${h.size}`).join(' | ')}`).toHaveLength(1);
      expect(hits[0]?.tx).toBe(x);
      expect(hits[0]?.tz).toBe(y);
      expect(hits[0]?.size).toBe(CELL);
    }
    expect(paintedFloorSize(3, 14, floor1Map, paintedFloorDefaultSize())).toBe(CELL);
    expect(overlappingPaintedFloorPairs(quads)).toEqual([]);
  });
});
