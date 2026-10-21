import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CELL } from '../src/voxel-floor1/constants';
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
  CHAMFER,
  doorOpeningStyle,
  FLOOR1_DOOR_STYLES,
  jambCount,
  JAMB_TOP_LINTEL,
  LINTEL_H,
  listOpeningSlabs,
  openingPunchRect
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

  it('builds a faceted main door from jambs, 45° chamfers, and a flat keystone', () => {
    const slabs = listOpeningSlabs('faceted');
    expect(jambCount(slabs, 'L')).toBeGreaterThanOrEqual(3);
    expect(jambCount(slabs, 'L')).toBeLessThanOrEqual(5);
    expect(jambCount(slabs, 'R')).toBe(jambCount(slabs, 'L'));
    expect(slabs.filter((s) => s.role === 'chamfer')).toHaveLength(2);
    expect(slabs.filter((s) => s.role === 'keystone')).toHaveLength(1);
    expect(slabs.filter((s) => s.role === 'lintel')).toHaveLength(0);
    const chamfers = slabs.filter((s) => s.role === 'chamfer');
    expect(chamfers.some((s) => Math.abs(s.rotD - -Math.PI / 4) < 1e-6)).toBe(true);
    expect(chamfers.some((s) => Math.abs(s.rotD - Math.PI / 4) < 1e-6)).toBe(true);
    expect(CHAMFER).toBeCloseTo(0.3, 5);
  });

  it('builds a side door as straight jambs plus a heavy chipped lintel', () => {
    const slabs = listOpeningSlabs('lintel');
    expect(jambCount(slabs, 'L')).toBeGreaterThanOrEqual(3);
    expect(jambCount(slabs, 'L')).toBeLessThanOrEqual(5);
    expect(slabs.filter((s) => s.role === 'chamfer')).toHaveLength(0);
    expect(slabs.filter((s) => s.role === 'lintel')).toHaveLength(1);
    expect(slabs.filter((s) => s.role === 'chip')).toHaveLength(1);
    expect(LINTEL_H).toBeGreaterThan(0.2);
    expect(JAMB_TOP_LINTEL).toBeGreaterThan(1.4);
    const lintel = slabs.find((s) => s.role === 'lintel')!;
    expect(lintel.rotD).toBe(0);
    expect(lintel.sa).toBeGreaterThan(1.2);
  });

  it('punches an axis-aligned hole — no circular soffit', () => {
    const mask = makeArchHoleMask(W, H);
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    const door = readFileSync(resolve(__dirname, '../src/voxel-floor1/door-opening.ts'), 'utf8');
    expect(src).not.toMatch(/dx \* dx \+ dy \* dy/);
    expect(src).not.toContain('inArch');
    expect(door).not.toMatch(/Math\.sin|Math\.cos|Math\.PI \* 2/);
    const rect = openingPunchRect('lintel');
    expect(rect.v0).toBe(0);
    expect(rect.u1 - rect.u0).toBeGreaterThan(1);
    let ones = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) ones += 1;
    expect(ones).toBeGreaterThan(20);
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
      expect(mesh.quads).toBeGreaterThan(8);
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
    for (const job of doorFloors) {
      expect(job.uvScale).toBe(1);
    }
    const art = readFileSync(resolve(__dirname, '../docs/ART_DIRECTION.md'), 'utf8');
    expect(art).toContain('faceted');
    expect(art).toContain('flat lintel');
    expect(art).toContain('not curves');
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    expect(src).toContain('projectArchOpeningUvs');
    expect(src).toContain('wrapT = THREE.RepeatWrapping');
    expect(src).toContain('openingSlabMeshes');
  });

  it('reprojects a soffit strip that only sampled one texture row', () => {
    const positions = [0, 1.8, 0, 0.03, 1.8, 0, 0.03, 1.8, 0.96, 0, 1.8, 0.96];
    const normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    const uvs = [0.4, 0.81, 0.42, 0.81, 0.42, 0.81, 0.4, 0.81];
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02).length).toBe(1);
    projectArchOpeningUvs(positions, normals, uvs, 'N', CELL, 0);
    expect(listSkewedQuads(positions, uvs, 0.5, 0.02)).toEqual([]);
    const us = [0, 2, 4, 6].map((i) => uvs[i]);
    const vs = [1, 3, 5, 7].map((i) => uvs[i]);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(0.03 / CELL, 5);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(0.96 / CELL, 5);
    expect(CELL).toBe(2);
  });
});
