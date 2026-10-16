import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DEPTH_LAYERS, FACE_INSET, LAYER_SIZE } from '../src/voxel-lab/constants';
import { greedyMesh } from '../src/voxel-lab/mesher';
import { volumeFromImageData } from '../src/voxel-lab/classify';
import { CELL_SIZE, SUNBEAM_INTENSITY, WALL_BOTTOM, WALL_TOP } from '../src/proto3d/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { VertexLightingManager } from '../src/proto3d/vertex-lighting';
import { VOXEL_SUNBEAM_INTENSITY, SURFACE_LIGHT_GLSL } from '../src/proto3d/surface-light';
import {
  MAX_RELIEF,
  VOXEL_PLANE_INSET,
  reliefStaysInSolid,
  voxelInwardSign,
  voxelLocalPos
} from '../src/proto3d/voxel-geom';
import {
  VOXEL_ENTER_CHEB,
  VOXEL_LEAVE_CHEB,
  chebyshev,
  surfaceChebyshev,
  syncVoxelQuery,
  voxelFromSearch,
  voxelLodWants
} from '../src/proto3d/voxel-opt-in';

describe('voxel opt-in', () => {
  it('is off unless ?voxel=1', () => {
    expect(voxelFromSearch(new URLSearchParams(''))).toBe(false);
    expect(voxelFromSearch(new URLSearchParams('debug=light'))).toBe(false);
    expect(voxelFromSearch(new URLSearchParams('voxel=0'))).toBe(false);
    expect(voxelFromSearch(new URLSearchParams('voxel=1'))).toBe(true);
    expect(voxelFromSearch(new URLSearchParams('voxel=true'))).toBe(true);
  });

  it('builds ahead at 4 and holds until 5 so a step does not pop', () => {
    expect(VOXEL_ENTER_CHEB).toBe(4);
    expect(VOXEL_LEAVE_CHEB).toBe(5);
    expect(voxelLodWants(4, false)).toBe(true);
    expect(voxelLodWants(5, false)).toBe(false);
    expect(voxelLodWants(5, true)).toBe(true);
    expect(voxelLodWants(6, true)).toBe(false);
    expect(chebyshev(3, 14, 3, 10)).toBe(4);
    expect(surfaceChebyshev(3, 14, 2, 14, 3, 14)).toBe(0);
  });

  it('does not load voxel-lab from the always-imported opt-in module', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/voxel-opt-in.ts'), 'utf8');
    expect(src).not.toContain('voxel-lab.html');
    expect(src).not.toContain('src/voxel-lab');
    expect(src).not.toContain('three');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(main).toContain("from './voxel-opt-in'");
    expect(main).toContain("await import('./voxel-mode')");
    expect(main).toMatch(/import type \{ VoxelMode \} from '\.\/voxel-mode'/);
  });
});

describe('voxel relief stays in the wall square', () => {
  it('extrudes walls into the solid and floors/ceilings away from the room', () => {
    expect(voxelInwardSign('wall', 'N')).toBe(1);
    expect(voxelInwardSign('wall', 'S')).toBe(1);
    expect(voxelInwardSign('wall', 'E')).toBe(-1);
    expect(voxelInwardSign('wall', 'W')).toBe(-1);
    expect(voxelInwardSign('floor')).toBe(-1);
    expect(voxelInwardSign('ceiling')).toBe(-1);
    expect(MAX_RELIEF).toBeLessThan(CELL_SIZE / 2);
    const front = voxelLocalPos(0, 0, 0, 8, 8, CELL_SIZE, WALL_TOP - WALL_BOTTOM, 1);
    expect(front[2]).toBeCloseTo(VOXEL_PLANE_INSET, 6);
    expect(front[2]).toBeGreaterThan(0);
    const back = voxelLocalPos(0, 0, DEPTH_LAYERS, 8, 8, CELL_SIZE, WALL_TOP - WALL_BOTTOM, 1);
    expect(back[2]).toBeLessThan(CELL_SIZE / 2);
  });

  it('greedy wall mesh never crosses the original plane into a walkable square', () => {
    const W = 16;
    const H = 16;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      data[o] = 90;
      data[o + 1] = 88;
      data[o + 2] = 80;
      data[o + 3] = 255;
    }
    const src = volumeFromImageData({ width: W, height: H, data });
    const height = WALL_TOP - WALL_BOTTOM;
    const inward = 1;
    const meshed = greedyMesh(
      src.volume,
      src.dims,
      (u, v, d) => voxelLocalPos(u, v, d, src.dims[0], src.dims[1], CELL_SIZE, height, inward),
      { cullNeg: [false, false, false], cullPos: [false, false, true] }
    );
    expect(reliefStaysInSolid(meshed.mesh.positions, inward)).toBe(true);
    const east = greedyMesh(
      src.volume,
      src.dims,
      (u, v, d) => voxelLocalPos(u, v, d, src.dims[0], src.dims[1], CELL_SIZE, height, -1),
      { cullNeg: [false, false, true], cullPos: [false, false, false] }
    );
    expect(reliefStaysInSolid(east.mesh.positions, -1)).toBe(true);
    let minZ = Infinity;
    for (let i = 2; i < meshed.mesh.positions.length; i += 3) {
      minZ = Math.min(minZ, meshed.mesh.positions[i]);
    }
    expect(minZ).toBeGreaterThanOrEqual(-FACE_INSET);
    expect(minZ).toBeGreaterThan(-LAYER_SIZE);
  });
});

describe('voxel lighting keeps gameplay rules', () => {
  it('does not change sourceLight / isSquareLit', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(19, 5);
    expect(lighting.sourceLight(19, 8)).toBe(0);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.ambientBrightness()).toBeCloseTo(0.05848, 5);
    lighting.setPartyPosition(19, 3);
    expect(lighting.isSquareLit(19, 7)).toBe(false);
    expect(lighting.isSquareLit(19, 6)).toBe(false);
  });

  it('sprite wall tint uses torch warmth and wall lantern, not gameplay max()', () => {
    const lighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: 1,
      bright: 1,
      oil: () => 2
    });
    lighting.setPartyPosition(1, 7);
    const tint = lighting.wallTintRgb(1, 6);
    expect(tint[0]).toBeGreaterThan(tint[2]);
    expect(tint[0]).toBeGreaterThan(0.2);
    lighting.setPartyPosition(19, 3);
    const lair = lighting.wallTintRgb(19, 7);
    expect((lair[0] + lair[1] + lair[2]) / 3).toBeCloseTo(lighting.ambientBrightness(), 2);
  });

  it('crack shafts use 3D falloff from the ceiling in the voxel shader', () => {
    expect(SURFACE_LIGHT_GLSL).toContain('surfSunbeamDist');
    expect(SURFACE_LIGHT_GLSL).toContain('uSunbeam3D');
    expect(VOXEL_SUNBEAM_INTENSITY).toBeCloseTo(SUNBEAM_INTENSITY * 2.15, 5);
    const src = readFileSync(resolve(__dirname, '../src/proto3d/voxel-mode.ts'), 'utf8');
    expect(src).toContain('uSunbeam3D.value = 1');
    expect(src).toContain('VOXEL_SUNBEAM_INTENSITY');
  });
});

describe('voxel mode keeps raycasts on original planes', () => {
  it('assigns an empty raycast on voxel meshes and hides the original material only', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/voxel-mode.ts'), 'utf8');
    expect(src).toContain('voxel.raycast = emptyRaycast');
    expect(src).toContain('origMat.visible = false');
    expect(src).not.toContain('entry.mesh.visible = false');
    expect(src).toContain('skipVertexLighting: true');
  });

  it('settings menu can toggle voxels without touching default HTML entry scripts', () => {
    const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
    const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(proto).toContain('id="btn-voxel-on"');
    expect(index).toContain('id="btn-voxel-on"');
    expect(proto).toContain('src="/src/proto3d/main.ts"');
    expect(proto).not.toContain('voxel-lab.html');
    expect(proto).not.toContain('src/voxel-lab');
    expect(index).not.toContain('voxel-lab.html');
    expect(index).not.toContain('src/voxel-lab');
  });
});
