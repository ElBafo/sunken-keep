import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { LAMP_COLOR, LANTERN_COLOR, TORCH_COLOR, WALL_FILES } from '../src/voxel-lab/constants';
import {
  GAME_AMBIENT_RGB,
  GAME_LANTERN_RGB,
  GAME_TORCH_RGB,
  hexToRgb,
  lerpRgb,
  lookColors,
  NEUTRAL_RGB
} from '../src/voxel-lab/look';

describe('voxel-lab wall texels match the game files', () => {
  const texDir = resolve(__dirname, '../public/proto3d/tex3d');
  const room = readFileSync(resolve(__dirname, '../src/voxel-lab/room.ts'), 'utf8');
  const materials = readFileSync(resolve(__dirname, '../src/voxel-lab/materials.ts'), 'utf8');
  const look = readFileSync(resolve(__dirname, '../src/voxel-lab/look.ts'), 'utf8');
  const vertex = readFileSync(resolve(__dirname, '../src/proto3d/vertex-lighting.ts'), 'utf8');
  const renderer = readFileSync(resolve(__dirname, '../src/proto3d/renderer.ts'), 'utf8');

  it('loads the same tex3d PNGs the game ships, without recolouring the bitmap', () => {
    for (const file of WALL_FILES) {
      expect(existsSync(resolve(texDir, file)), file).toBe(true);
    }
    expect(materials).toContain("return `${base}proto3d/tex3d/${file}`");
    expect(materials).toContain('new THREE.Texture(img)');
    expect(materials).toContain('texture.colorSpace = THREE.SRGBColorSpace');
    expect(materials).not.toMatch(/fillStyle|globalCompositeOperation|multiplyScalar/);
    expect(room).toContain("from './materials'");
    expect(room).not.toMatch(/fillStyle|globalCompositeOperation|multiplyScalar/);
  });

  it('duplicates the game torch/lantern/ambient RGB (does not import proto3d)', () => {
    expect(vertex).toContain('const TORCH_RGB: [number, number, number] = [1.0, 0.86, 0.58]');
    expect(vertex).toContain('const LANTERN_RGB: [number, number, number] = [0.92, 0.82, 0.64]');
    expect(vertex).toContain('const AMBIENT_RGB: [number, number, number] = [0.82, 0.86, 0.9]');
    expect(GAME_TORCH_RGB).toEqual([1.0, 0.86, 0.58]);
    expect(GAME_LANTERN_RGB).toEqual([0.92, 0.82, 0.64]);
    expect(GAME_AMBIENT_RGB).toEqual([0.82, 0.86, 0.9]);
    expect(look).not.toContain('proto3d/');
    expect(renderer).toContain('outputColorSpace = THREE.LinearSRGBColorSpace');
  });
});

describe('lookColors', () => {
  it('lerps from white to the lab orange stack', () => {
    expect(lerpRgb(NEUTRAL_RGB, NEUTRAL_RGB, 1)).toEqual(NEUTRAL_RGB);
    const cold = lookColors(0, false);
    expect(cold.torch).toEqual(NEUTRAL_RGB);
    expect(cold.lantern).toEqual(NEUTRAL_RGB);
    const hot = lookColors(1, false);
    expect(hot.torch[0]).toBeCloseTo(hexToRgb(TORCH_COLOR)[0], 5);
    expect(hot.torch[1]).toBeCloseTo(hexToRgb(TORCH_COLOR)[1], 5);
    expect(hot.torch[2]).toBeCloseTo(hexToRgb(TORCH_COLOR)[2], 5);
    expect(hot.lantern).toEqual(hexToRgb(LANTERN_COLOR));
    expect(hot.lamp).toEqual(hexToRgb(LAMP_COLOR));
    expect(hot.torch[1]).toBeLessThan(0.65);
  });

  it('match-game warm endpoint is the milder vertex-lighting torch, not 0xff9a48', () => {
    const game = lookColors(1, true);
    expect(game.torch).toEqual(GAME_TORCH_RGB);
    expect(game.lantern).toEqual(GAME_LANTERN_RGB);
    expect(game.torch[1]).toBeGreaterThan(hexToRgb(TORCH_COLOR)[1]);
    expect(game.fog).toBe(0x010101);
    const white = lookColors(0, true);
    expect(white.torch).toEqual(NEUTRAL_RGB);
  });
});
