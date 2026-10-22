import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_NEAR, CELL } from '../src/voxel-floor1/constants';
import { floor1Sconces } from '../src/voxel-floor1/fixtures';
import { enumerateFaces, floor1Map, isWaterCell, isWaterTile, tileAt } from '../src/voxel-floor1/layout';
import { paintedShellMaterial } from '../src/voxel-floor1/painted';
import { tileFlatPose } from '../src/voxel-lab/faces';
import {
  WATER_BED_Y,
  WATER_FACES,
  WATER_LIP_WIDTH,
  WATER_SURFACE_DROP,
  WATER_SURFACE_Y,
  applyWaterBedPose,
  hasWaterNeighbor,
  lipBounds,
  lipBox,
  lipSealsBed,
  listWaterCells,
  listWaterGlintCells,
  listWaterLips,
  paintedFloorSize,
  waterBedRect,
  waterBedSize,
  waterEdgeNeedsLip
} from '../src/voxel-floor1/water';

const SRC = resolve(__dirname, '../src/voxel-floor1');

describe('voxel-floor1 still water height', () => {
  it('drops the water surface 6–10 cm below the stone floor', () => {
    expect(WATER_SURFACE_DROP).toBeGreaterThanOrEqual(0.06);
    expect(WATER_SURFACE_DROP).toBeLessThanOrEqual(0.1);
    expect(WATER_SURFACE_Y).toBeCloseTo(-WATER_SURFACE_DROP, 8);
    expect(WATER_BED_Y).toBeLessThan(WATER_SURFACE_Y);
    expect(WATER_BED_Y).toBeGreaterThan(-0.12);

    const jobs = enumerateFaces(floor1Map);
    const waterFloors = jobs.filter((j) => j.kind === 'floor' && isWaterCell(floor1Map, j.tx, j.tz));
    const dryFloors = jobs.filter((j) => j.kind === 'floor' && !isWaterCell(floor1Map, j.tx, j.tz));
    expect(waterFloors.length).toBe(listWaterCells(floor1Map).length);
    expect(waterFloors.length).toBeGreaterThan(10);

    for (const job of waterFloors) {
      expect(job.file).toBe('floor_water.png');
      const pose = tileFlatPose(job.face, job.tx, job.tz, CELL, 'center');
      expect(pose.y).toBe(0);
      applyWaterBedPose(pose, job.tx, job.tz, floor1Map);
      expect(pose.y).toBeCloseTo(WATER_BED_Y, 8);
    }
    for (const job of dryFloors) {
      const pose = tileFlatPose(job.face, job.tx, job.tz, CELL, 'center');
      applyWaterBedPose(pose, job.tx, job.tz, floor1Map);
      expect(pose.y).toBe(0);
    }
  });
});

describe('voxel-floor1 water lips leave no gap', () => {
  const cells = listWaterCells(floor1Map);
  const lips = listWaterLips(floor1Map);
  const defaultSize = CELL + 2 * (CAMERA_NEAR + 0.12);

  it('puts a stone lip on every water edge that faces a dry cell or wall', () => {
    expect(isWaterTile(tileAt(floor1Map, 2, 2))).toBe(true);
    expect(isWaterTile(tileAt(floor1Map, 4, 2))).toBe(false);
    expect(WATER_LIP_WIDTH).toBeGreaterThan(0.03);
    expect(WATER_LIP_WIDTH).toBeLessThan(0.12);
    expect(lips.length).toBeGreaterThan(0);

    for (const cell of cells) {
      for (const face of WATER_FACES) {
        const need = waterEdgeNeedsLip(floor1Map, cell.x, cell.y, face);
        const lip = lips.find((l) => l.tx === cell.x && l.tz === cell.y && l.face === face);
        if (need) expect(lip, `${cell.x},${cell.y} ${face}`).toBeTruthy();
        else expect(lip, `${cell.x},${cell.y} ${face} water-water`).toBeUndefined();
      }
    }

    expect(waterEdgeNeedsLip(floor1Map, 3, 2, 'E')).toBe(true);
    expect(waterEdgeNeedsLip(floor1Map, 3, 2, 'W')).toBe(false);
    expect(waterEdgeNeedsLip(floor1Map, 2, 2, 'N')).toBe(false);
    expect(waterEdgeNeedsLip(floor1Map, 1, 4, 'S')).toBe(true);
  });

  it('seals the drop so the lip meets the bed and the dry floor', () => {
    for (const lip of lips) {
      const box = lipBounds(lip);
      const bed = waterBedRect(lip.tx, lip.tz);
      expect(box.maxY, `${lip.tx},${lip.tz} ${lip.face} top`).toBeCloseTo(0, 5);
      expect(box.minY, `${lip.tx},${lip.tz} ${lip.face} bottom`).toBeLessThanOrEqual(
        WATER_SURFACE_Y + 1e-4
      );
      expect(lipSealsBed(lip, bed), `${lip.tx},${lip.tz} ${lip.face} seals`).toBe(true);
      expect(lipBox(lip.tx, lip.tz, lip.face).sx * lipBox(lip.tx, lip.tz, lip.face).sz).toBeGreaterThan(
        0
      );
    }

    expect(paintedFloorSize(2, 2, floor1Map, defaultSize)).toBeCloseTo(waterBedSize(), 8);
    expect(paintedFloorSize(4, 2, floor1Map, defaultSize)).toBe(CELL);
    expect(hasWaterNeighbor(floor1Map, 4, 2)).toBe(true);
    expect(paintedFloorSize(3, 14, floor1Map, defaultSize)).toBe(defaultSize);
    expect(waterBedSize()).toBeLessThan(CELL);
    expect(waterBedSize()).toBeGreaterThan(CELL - 2 * WATER_LIP_WIDTH);
  });

  it('keeps torch glints on lit water only and a dark matte bed', () => {
    const glints = listWaterGlintCells(floor1Map, floor1Sconces);
    expect(glints.some((c) => c.x === 3 && c.y === 1)).toBe(true);
    expect(glints.some((c) => c.x === 2 && c.y === 2)).toBe(true);
    expect(glints.some((c) => c.x === 3 && c.y === 4)).toBe(false);
    expect(glints.some((c) => c.x === 5 && c.y === 11)).toBe(false);

    const mat = paintedShellMaterial(new THREE.Texture(), undefined, 'floor_water.png');
    expect(mat.clearcoat).toBe(0);
    expect(mat.roughness).toBeGreaterThanOrEqual(0.85);
    expect(mat.specularIntensity).toBe(0);
    expect(mat.emissiveIntensity).toBe(0);
    expect(mat.fog).toBe(true);
    expect(mat.color.r).toBeLessThan(0.95);
    expect(mat.color.r).toBeGreaterThan(0.8);

    const water = readFileSync(resolve(SRC, 'water.ts'), 'utf8');
    const level = readFileSync(resolve(SRC, 'level.ts'), 'utf8');
    const main = readFileSync(resolve(SRC, 'main.ts'), 'utf8');
    expect(level).toContain('applyWaterBedPose');
    expect(level).toContain('paintedFloorSize');
    expect(main).toContain('buildFloor1Water');
    expect(water).not.toContain('onBeforeCompile');
    expect(water).not.toContain('ShaderMaterial');
    expect(water).not.toContain('../proto3d/');
    expect(water).toContain('castShadow = false');
  });
});
