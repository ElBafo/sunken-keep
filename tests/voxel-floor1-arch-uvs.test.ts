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
  meshArchOpening,
  solidifyArchVolume
} from '../src/voxel-floor1/openings';
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

describe('floor-1 arch opening UVs', () => {
  const doors = listDoors(floor1Map);
  const views = doors.flatMap((spec) =>
    openingViews(floor1Map, spec.x, spec.y).map((view) => ({
      door: `${spec.x},${spec.y}`,
      ...view
    }))
  );

  it('lists every floor-1 door arch, not just one', () => {
    expect(doors.length).toBeGreaterThanOrEqual(4);
    expect(views.length).toBeGreaterThanOrEqual(doors.length);
    const keys = views.map((v) => `${v.door}:${v.face}:${v.tx},${v.tz}`).sort();
    expect(new Set(keys).size).toBe(keys.length);
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

  it('projects soffit, jambs, and threshold at even wall/floor density on every arch', () => {
    const wall = solidWall();
    const opening = archOpening();
    const failures: string[] = [];
    for (const view of views) {
      const face = view.face as 'N' | 'E' | 'S' | 'W';
      const mesh = meshArchOpening(
        wall.volume,
        wall.dims,
        opening.volume,
        opening.dims,
        face,
        view.tx,
        view.tz
      );
      expect(mesh.quads).toBeGreaterThan(8);
      const skewed = listSkewedQuads(mesh.positions, mesh.uvs, 0.5);
      if (skewed.length) {
        failures.push(
          `${view.door} ${face} @ ${view.tx},${view.tz}: ${skewed.length} skewed (min ratio ${skewed
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

  it('maps depth and the other in-plane axis in metres (not a collapsed row)', () => {
    const sample = views.find((v) => v.face === 'W') ?? views[0];
    const face = sample.face as 'N' | 'E' | 'S' | 'W';
    const mesh = meshArchOpening(
      solidWall().volume,
      solidWall().dims,
      archOpening().volume,
      archOpening().dims,
      face,
      sample.tx,
      sample.tz
    );
    let maxUvSpan = 0;
    for (let v = 0; v + 3 < mesh.positions.length / 3; v += 4) {
      const us = [0, 1, 2, 3].map((k) => mesh.uvs[(v + k) * 2]);
      const vs = [0, 1, 2, 3].map((k) => mesh.uvs[(v + k) * 2 + 1]);
      maxUvSpan = Math.max(maxUvSpan, Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
    }
    expect(maxUvSpan).toBeGreaterThan(0.2);
    const src = readFileSync(resolve(__dirname, '../src/voxel-floor1/openings.ts'), 'utf8');
    expect(src).toContain('projectArchOpeningUvs');
    expect(src).not.toContain('remapDegenerateUvs');
    expect(src).toContain('wrapT = THREE.RepeatWrapping');
    const audit = readFileSync(resolve(__dirname, '../src/voxel-floor1/uv-audit.ts'), 'utf8');
    expect(audit).toContain('quadTexelDensityRatio');
    expect(audit).toContain('listSkewedQuads');
    expect(CELL).toBe(2);
  });

  it('keeps painted doorway floors at 1 UV per cell', () => {
    const floors = enumerateFaces(floor1Map).filter((j) => j.kind === 'floor' && j.file.startsWith('floor_'));
    const doorKeys = new Set(doors.map((d) => `${d.x},${d.y}`));
    const doorFloors = floors.filter((j) => doorKeys.has(`${j.tx},${j.tz}`));
    expect(doorFloors.length).toBe(doors.length);
    for (const job of doorFloors) {
      expect(job.uvScale).toBe(1);
      expect(job.uvRot === 0 || job.uvRot === 90).toBe(true);
    }
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
  });
});
