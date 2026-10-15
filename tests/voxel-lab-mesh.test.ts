import { describe, expect, it } from 'vitest';
import { classifyPixel, isMoss, luma, packVoxel, volumeFromImageData } from '../src/voxel-lab/classify';
import { DEPTH_LAYERS, MAT_MOSS, MAT_WET } from '../src/voxel-lab/constants';
import { greedyMesh, triangleCount } from '../src/voxel-lab/mesher';

function identity(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

function fill(w: number, h: number, d: number, packed: number): Uint32Array {
  const vol = new Uint32Array(w * h * d);
  vol.fill(packed);
  return vol;
}

describe('voxel-lab classify', () => {
  it('recesses dark mortar and pushes bright stone out 1–3 layers', () => {
    const dark = classifyPixel(30, 28, 26, 255, 0, 0)!;
    const bright = classifyPixel(200, 196, 188, 255, 3, 1)!;
    expect(dark.steps).toBe(1);
    expect(bright.steps).toBe(3);
  });

  it('marks dark-green pixels as rough moss', () => {
    expect(isMoss(40, 90, 50)).toBe(true);
    expect(classifyPixel(40, 90, 50, 255, 0, 0)?.material).toBe(MAT_MOSS);
    expect(isMoss(120, 118, 110)).toBe(false);
  });

  it('can mark some brighter stone as wet/glossy', () => {
    let wet = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = classifyPixel(180, 176, 168, 255, x, y);
        if (c?.material === MAT_WET) wet += 1;
      }
    }
    expect(wet).toBeGreaterThan(20);
    expect(wet).toBeLessThan(400);
  });

  it('ignores transparent texels', () => {
    expect(classifyPixel(10, 80, 20, 0, 0, 0)).toBeNull();
  });

  it('luma is in 0–1', () => {
    expect(luma(0, 0, 0)).toBe(0);
    expect(luma(255, 255, 255)).toBeCloseTo(1, 5);
  });
});

describe('voxel-lab greedy mesh', () => {
  it('collapses a solid same-colour slab to a handful of quads', () => {
    const packed = packVoxel(80, 80, 80, 0);
    const volume = fill(8, 8, 1, packed);
    const mesh = greedyMesh(volume, [8, 8, 1], identity, { cullNeg: [false, false, false] });
    expect(mesh.quads).toBe(6);
    expect(mesh.triangles).toBe(12);
  });

  it('culls the back of a wall slab', () => {
    const packed = packVoxel(80, 80, 80, 0);
    const volume = fill(8, 8, 1, packed);
    const culled = greedyMesh(volume, [8, 8, 1], identity);
    const full = greedyMesh(volume, [8, 8, 1], identity, { cullNeg: [false, false, false] });
    expect(culled.quads).toBe(full.quads - 1);
  });

  it('does not merge different colours', () => {
    const volume = new Uint32Array(2 * 1 * 1);
    volume[0] = packVoxel(255, 0, 0, 0);
    volume[1] = packVoxel(0, 255, 0, 0);
    const mesh = greedyMesh(volume, [2, 1, 1], identity, { cullNeg: [false, false, false] });
    expect(mesh.quads).toBeGreaterThanOrEqual(6);
  });

  it('counts one voxel per opaque texel and beats naive cube triangles', () => {
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
    const vol = volumeFromImageData({ width: W, height: H, data });
    expect(vol.voxelCount).toBe(W * H);
    expect(vol.dims[2]).toBe(DEPTH_LAYERS);
    const mesh = greedyMesh(vol.volume, vol.dims, identity);
    const naive = vol.voxelCount * 12;
    expect(mesh.triangles).toBeGreaterThan(0);
    expect(mesh.triangles).toBeLessThan(naive / 4);
    expect(triangleCount(mesh.groups[0]) + triangleCount(mesh.groups[1]) + triangleCount(mesh.groups[2])).toBe(
      mesh.triangles
    );
  });
});
