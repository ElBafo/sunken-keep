import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CELL, CORNICE_HEIGHT } from '../src/voxel-floor1/constants';
import { greedyMesh } from '../src/voxel-lab/mesher';
import {
  makeArchHoleMask,
  holeMaskToVolume,
  makeArchToWorld,
  maskVolumeWithOpening,
  meshDoorOpening,
  solidifyArchVolume
} from '../src/voxel-floor1/openings';
import {
  BRICK_COURSE,
  CHAMFER,
  doorOpeningStyle,
  facetedTop,
  FLOOR1_DOOR_STYLES,
  FRONT_PROUD,
  inOpeningVoid,
  JAMB_TOP_FACETED,
  listHeadRoles,
  listOpeningQuads,
  lintelTop,
  OPEN_U0,
  OPEN_U1,
  openingPunchRect,
  wallAboveOpening
} from '../src/voxel-floor1/door-opening';
import { enumerateFaces, floor1Map, listDoors, openingViews } from '../src/voxel-floor1/layout';
import {
  listSkewedQuads,
  projectArchOpeningUvs,
  quadIsStreaked,
  quadTexelDensityRatio
} from '../src/voxel-floor1/uv-audit';

const W = 32;
const H = 32;
const D = 3;

function solidWall(): { volume: Uint8Array; dims: [number, number, number] } {
  return { volume: new Uint8Array(W * H * D).fill(1), dims: [W, H, D] };
}

function archOpening(): { volume: Uint8Array; dims: [number, number, number] } {
  return { volume: holeMaskToVolume(makeArchHoleMask(W, H), W, H, D), dims: [W, H, D] };
}

function rawArchMesh(face: 'N' | 'E' | 'S' | 'W', tx: number, tz: number) {
  const wall = solidWall();
  const opening = archOpening();
  const punched = maskVolumeWithOpening(wall.volume, wall.dims, opening.volume, opening.dims);
  const arch = solidifyArchVolume(punched, wall.dims);
  const toWorld = makeArchToWorld(face, tx, tz, arch.dims);
  return greedyMesh(arch.volume, arch.dims, toWorld, { cullNeg: [false, false, false] });
}

describe('floor-1 door opening styles', () => {
  const doors = listDoors(floor1Map);
  const views = doors.flatMap((spec) =>
    openingViews(floor1Map, spec.x, spec.y).map((view) => ({
      door: `${spec.x},${spec.y}`,
      style: doorOpeningStyle(spec.x, spec.y),
      ...view
    }))
  );

  it('gives every floor-1 door a faceted or lintel style', () => {
    expect(doors.map((d) => `${d.x},${d.y}`).sort()).toEqual(['14,2', '19,5', '4,2', '6,8']);
    expect(doorOpeningStyle(4, 2)).toBe('faceted');
    expect(doorOpeningStyle(14, 2)).toBe('faceted');
    expect(doorOpeningStyle(6, 8)).toBe('lintel');
    expect(doorOpeningStyle(19, 5)).toBe('lintel');
    expect(Object.keys(FLOOR1_DOOR_STYLES)).toHaveLength(4);
  });

  it('uses exactly five planar head slabs on a faceted door', () => {
    expect(listHeadRoles('faceted')).toEqual(['jamb-top', 'chamfer', 'keystone', 'chamfer', 'jamb-top']);
    const quads = listOpeningQuads('faceted');
    const fronts = quads.filter((q) => q.kind === 'front');
    expect(fronts).toHaveLength(5);
    expect(fronts.map((q) => q.role)).toEqual(['jamb-top', 'chamfer', 'keystone', 'chamfer', 'jamb-top']);
    expect(quads.filter((q) => q.role === 'chamfer' && q.kind === 'soffit')).toHaveLength(2);
    expect(quads.filter((q) => q.role === 'keystone' && q.kind === 'soffit')).toHaveLength(1);
    for (const q of quads) {
      expect(q.corners).toHaveLength(4);
    }
    expect(CHAMFER).toBeCloseTo(0.3, 5);
    expect(FRONT_PROUD).toBeLessThanOrEqual(0.03);
    expect(wallAboveOpening('faceted')).toBeGreaterThanOrEqual(BRICK_COURSE - 1e-6);
    expect(facetedTop()).toBeLessThan(CELL - CORNICE_HEIGHT);
    expect(inOpeningVoid('faceted', (OPEN_U0 + OPEN_U1) / 2, 0.6)).toBe(true);
    expect(inOpeningVoid('faceted', (OPEN_U0 + OPEN_U1) / 2, facetedTop() - 0.02)).toBe(true);
    expect(inOpeningVoid('faceted', OPEN_U0 + 0.02, facetedTop() - 0.02)).toBe(false);
    expect(inOpeningVoid('faceted', OPEN_U1 - 0.02, facetedTop() - 0.02)).toBe(false);
    expect(inOpeningVoid('faceted', OPEN_U0 + 0.02, JAMB_TOP_FACETED - 0.02)).toBe(true);
    expect(inOpeningVoid('faceted', (OPEN_U0 + OPEN_U1) / 2, CELL - CORNICE_HEIGHT - 0.01)).toBe(
      false
    );
  });

  it('cuts a lintel into the wall with a brick course under the cornice', () => {
    const quads = listOpeningQuads('lintel');
    expect(quads.filter((q) => q.role === 'lintel' && q.kind === 'front')).toHaveLength(1);
    expect(quads.filter((q) => q.role === 'chamfer')).toHaveLength(0);
    expect(quads.some((q) => q.role === 'jamb-soffit')).toBe(true);
    expect(wallAboveOpening('lintel')).toBeGreaterThanOrEqual(BRICK_COURSE - 1e-6);
    expect(lintelTop()).toBeLessThanOrEqual(CELL - CORNICE_HEIGHT - BRICK_COURSE + 1e-6);
    const punch = openingPunchRect('lintel');
    expect(punch.v1).toBeLessThanOrEqual(lintelTop() + 1e-6);
    expect(punch.v1).toBeLessThan(CELL - CORNICE_HEIGHT);
  });

  it('punches only the inner void — no circular soffit and no teeth under the cornice', () => {
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    const door = readFileSync(resolve(__dirname, '../src/voxel-floor1/door-opening.ts'), 'utf8');
    expect(src).not.toMatch(/dx \* dx \+ dy \* dy/);
    expect(src).not.toContain('inArch');
    expect(door).not.toMatch(/Math\.sin|Math\.cos|BoxGeometry/);
    expect(door).toContain('listFacetedHeadQuads');
    const faceted = openingPunchRect('faceted');
    expect(faceted.v1).toBeLessThan(CELL - CORNICE_HEIGHT);
    expect(CELL - CORNICE_HEIGHT - faceted.v1).toBeGreaterThanOrEqual(BRICK_COURSE - 1e-6);
  });

  it('fails the density audit on raw mesher UVs (one texel row along the reveal)', () => {
    const raw = rawArchMesh('W', 5, 2);
    const skewed = listSkewedQuads(raw.mesh.positions, raw.mesh.uvs);
    expect(skewed.length).toBeGreaterThan(0);
    expect(skewed.some((q) => q.worldA > 0.5 || q.worldB > 0.5)).toBe(true);
    expect(quadIsStreaked(raw.mesh.positions, raw.mesh.uvs, skewed[0].index, 0.05, 0.02) || skewed[0].ratio < 0.5).toBe(
      true
    );
  });

  it('projects every floor-1 door opening at even wall/floor density', () => {
    const wall = solidWall();
    const failures: string[] = [];
    for (const view of views) {
      const face = view.face as 'N' | 'E' | 'S' | 'W';
      const mesh = meshDoorOpening(wall.volume, wall.dims, face, view.tx, view.tz, view.style);
      expect(mesh.quads).toBeGreaterThan(4);
      const skewed = listSkewedQuads(mesh.positions, mesh.uvs, 0.5);
      if (skewed.length) {
        failures.push(
          `${view.door} ${view.style} ${face} @ ${view.tx},${view.tz}: ${skewed.length} skewed (min ${skewed
            .map((q) => q.ratio)
            .reduce((a, b) => Math.min(a, b), 1)
            .toFixed(3)})`
        );
      }
      for (let v = 0; v + 3 < mesh.positions.length / 3; v += 4) {
        const ratio = quadTexelDensityRatio(mesh.positions, mesh.uvs, v);
        if (ratio === null) continue;
        expect(ratio).toBeGreaterThanOrEqual(0.5);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps painted doorway floors at 1 UV per cell and documents the styles', () => {
    const floors = enumerateFaces(floor1Map).filter((j) => j.kind === 'floor' && j.file.startsWith('floor_'));
    const doorKeys = new Set(doors.map((d) => `${d.x},${d.y}`));
    const doorFloors = floors.filter((j) => doorKeys.has(`${j.tx},${j.tz}`));
    expect(doorFloors.length).toBe(doors.length);
    const art = readFileSync(resolve(__dirname, '../docs/ART_DIRECTION.md'), 'utf8');
    expect(art).toContain('exactly five big flat slabs');
    expect(art).toContain('brick course');
    expect(art).toContain('flush');
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    expect(src).toContain('openingSlabMeshes');
    expect(src).toContain('wrapT = THREE.RepeatWrapping');
  });

  it('reprojects a soffit strip that only sampled one texture row', () => {
    const positions = [0, 1.8, 0, 0.03, 1.8, 0, 0.03, 1.8, 0.96, 0, 1.8, 0.96];
    const normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    const uvs = [0.4, 0.81, 0.42, 0.81, 0.42, 0.81, 0.4, 0.81];
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02).length).toBe(1);
    projectArchOpeningUvs(positions, normals, uvs, 'N', CELL, 0);
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02)).toEqual([]);
    expect(CELL).toBe(2);
  });
});
