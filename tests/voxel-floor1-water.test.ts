import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_NEAR, CELL } from '../src/voxel-floor1/constants';
import { floor1Sconces } from '../src/voxel-floor1/fixtures';
import { floor1Map, isWaterCell, isWaterTile, tileAt } from '../src/voxel-floor1/layout';
import { paintedShellMaterial } from '../src/voxel-floor1/painted';
import {
  WATER_DIP_DEEP,
  WATER_DIP_SHALLOW,
  WATER_FACES,
  WATER_INSET_MAX,
  WATER_INSET_MIN,
  dryFacingFaces,
  floorDip,
  hasWaterNeighbor,
  listStrayPuddles,
  listWaterCells,
  listWaterGlintCells,
  listWaterRegions,
  paintedFloorSize,
  puddleCoverage,
  puddleEdgeInset,
  puddleEdgeIsIrregular
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

  it('keeps puddle edges irregular and stray drips inside the cell', () => {
    for (const cell of listWaterCells(floor1Map)) {
      for (const face of dryFacingFaces(floor1Map, cell.x, cell.y)) {
        expect(puddleEdgeIsIrregular(floor1Map, cell.x, cell.y, face), `${cell.x},${cell.y} ${face}`).toBe(
          true
        );
        const a = puddleEdgeInset(cell.x, cell.y, face, 0.15);
        const b = puddleEdgeInset(cell.x, cell.y, face, 0.72);
        expect(Math.abs(a - b)).toBeGreaterThan(0.006);
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
    expect(water).not.toContain('water-lips');
    expect(water).not.toContain('onBeforeCompile');
    expect(water).not.toContain('ShaderMaterial');
    expect(water).not.toContain('../proto3d/');
    expect(water).toContain('castShadow = false');
  });
});
