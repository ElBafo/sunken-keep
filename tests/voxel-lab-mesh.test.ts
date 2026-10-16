import { describe, expect, it } from 'vitest';
import { classifyPixel, filterIsolatedWet, isMoss, luma, volumeFromImageData } from '../src/voxel-lab/classify';
import { DEPTH_LAYERS, FACE_INSET, MAT_DRY, MAT_MOSS, MAT_WET, ROUGH_MATTE, ROUGH_STONE, ROUGH_WET } from '../src/voxel-lab/constants';
import { greedyMesh, triangleCount } from '../src/voxel-lab/mesher';

function identity(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

function fill(w: number, h: number, d: number): Uint8Array {
  const vol = new Uint8Array(w * h * d);
  vol.fill(1);
  return vol;
}

describe('voxel-lab classify', () => {
  it('recesses dark mortar and pushes bright stone out 1–3 layers', () => {
    const dark = classifyPixel(30, 28, 26, 255)!;
    const bright = classifyPixel(200, 196, 188, 255)!;
    expect(dark.steps).toBe(1);
    expect(bright.steps).toBe(3);
  });

  it('marks dark-green pixels as rough moss', () => {
    expect(isMoss(40, 90, 50)).toBe(true);
    expect(classifyPixel(40, 90, 50, 255)?.material).toBe(MAT_MOSS);
    expect(isMoss(120, 118, 110)).toBe(false);
  });

  it('marks painted stone highlights as wet/glossy and mid-stone as dry', () => {
    expect(classifyPixel(200, 196, 188, 255)?.material).toBe(MAT_WET);
    expect(classifyPixel(90, 88, 80, 255)?.material).toBe(MAT_DRY);
  });

  it('writes matte roughness for moss/mortar and glossy for wet highlights', () => {
    const pixel = (r: number, g: number, b: number) => {
      const data = new Uint8ClampedArray([r, g, b, 255]);
      return volumeFromImageData({ width: 1, height: 1, data }).roughness[0];
    };
    expect(pixel(40, 90, 50)).toBe(ROUGH_MATTE);
    expect(pixel(28, 26, 24)).toBe(ROUGH_MATTE);
    expect(pixel(90, 88, 80)).toBe(ROUGH_STONE);
  });

  it('drops stray glossy texels but keeps a coherent wet patch', () => {
    const W = 8;
    const H = 8;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      data[o] = 90;
      data[o + 1] = 88;
      data[o + 2] = 80;
      data[o + 3] = 255;
    }
    const paint = (x: number, y: number) => {
      const o = (y * W + x) * 4;
      data[o] = 200;
      data[o + 1] = 196;
      data[o + 2] = 188;
    };
    paint(7, 0);
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) paint(x, y);
    const vol = volumeFromImageData({ width: W, height: H, data });
    expect(vol.roughness[7]).toBe(ROUGH_STONE);
    expect(vol.roughness[2 + 3 * W]).toBe(ROUGH_WET);
  });

  it('filterIsolatedWet demotes a lone wet texel and keeps a 2×2 blob', () => {
    const W = 4;
    const H = 4;
    const cells = new Array(W * H).fill(null).map(() => ({ steps: 2, material: MAT_DRY as const }));
    cells[0] = { steps: 3, material: MAT_WET };
    cells[5] = { steps: 3, material: MAT_WET };
    cells[6] = { steps: 3, material: MAT_WET };
    cells[9] = { steps: 3, material: MAT_WET };
    cells[10] = { steps: 3, material: MAT_WET };
    filterIsolatedWet(cells, W, H);
    expect(cells[0].material).toBe(MAT_DRY);
    expect(cells[5].material).toBe(MAT_WET);
    expect(cells[10].material).toBe(MAT_WET);
  });

  it('ignores transparent texels', () => {
    expect(classifyPixel(10, 80, 20, 0)).toBeNull();
  });

  it('luma is in 0–1', () => {
    expect(luma(0, 0, 0)).toBe(0);
    expect(luma(255, 255, 255)).toBeCloseTo(1, 5);
  });
});

describe('voxel-lab greedy mesh', () => {
  it('insets greedy faces along their normal to avoid coplanar z-fighting', () => {
    const volume = fill(1, 1, 1);
    const mesh = greedyMesh(volume, [1, 1, 1], identity, { cullNeg: [false, false, false] });
    const zs: number[] = [];
    for (let i = 2; i < mesh.mesh.positions.length; i += 3) zs.push(mesh.mesh.positions[i]);
    expect(Math.max(...zs)).toBeCloseTo(1 + FACE_INSET, 6);
    expect(Math.min(...zs)).toBeCloseTo(0 - FACE_INSET, 6);
  });

  it('collapses a solid same-depth slab to a handful of quads', () => {
    const volume = fill(8, 8, 1);
    const mesh = greedyMesh(volume, [8, 8, 1], identity, { cullNeg: [false, false, false] });
    expect(mesh.quads).toBe(6);
    expect(mesh.triangles).toBe(12);
  });

  it('culls the back of a wall slab', () => {
    const volume = fill(8, 8, 1);
    const culled = greedyMesh(volume, [8, 8, 1], identity);
    const full = greedyMesh(volume, [8, 8, 1], identity, { cullNeg: [false, false, false] });
    expect(culled.quads).toBe(full.quads - 1);
  });

  it('merges mixed colours at the same depth so a noisy brick is one front face', () => {
    const W = 8;
    const H = 8;
    const volume = fill(W, H, 1);
    const mesh = greedyMesh(volume, [W, H, 1], identity);
    expect(mesh.quads).toBeLessThan(10);
    expect(mesh.mesh.uvs.length).toBe(mesh.mesh.positions.length / 3 * 2);
  });

  it('blurs luma so noisy bricks still greedy-merge', () => {
    const W = 16;
    const H = 16;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const n = 70 + ((x * 13 + y * 7) % 40);
        data[o] = n;
        data[o + 1] = n;
        data[o + 2] = n - 4;
        data[o + 3] = 255;
      }
    }
    const vol = volumeFromImageData({ width: W, height: H, data });
    const mesh = greedyMesh(vol.volume, vol.dims, identity);
    expect(mesh.quads).toBeLessThan(40);
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
    expect(mesh.triangles).toBeLessThan(naive / 8);
    expect(triangleCount(mesh.mesh)).toBe(mesh.triangles);
  });
});
