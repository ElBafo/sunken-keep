import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isSurfaceLitKind,
  patchSurfaceLightMaterial,
  createSurfaceLightLocal,
  createSurfaceLightShared,
  applyAlbedoLight,
  SURFACE_LIGHT_CACHE_KEY,
  SURFACE_LIGHT_GLSL
} from '../src/proto3d/surface-light';

describe('per-pixel wall/floor lighting', () => {
  it('marks dungeon surfaces and skips props', () => {
    expect(isSurfaceLitKind('wall')).toBe(true);
    expect(isSurfaceLitKind('floor')).toBe(true);
    expect(isSurfaceLitKind('ceiling')).toBe(true);
    expect(isSurfaceLitKind('secret')).toBe(true);
    expect(isSurfaceLitKind('door-panel')).toBe(true);
    expect(isSurfaceLitKind('water-shallow')).toBe(true);
    expect(isSurfaceLitKind('water-surface')).toBe(true);
    expect(isSurfaceLitKind('decal')).toBe(false);
    expect(isSurfaceLitKind('torch-flame')).toBe(false);
  });

  it('evaluates lantern+torch in the fragment at world position', () => {
    expect(SURFACE_LIGHT_GLSL).toContain('vec3 surfaceLightRgb(vec3 worldPos)');
    expect(SURFACE_LIGHT_GLSL).toContain('surfScreenAccum');
    expect(SURFACE_LIGHT_GLSL).toContain('surfSmoothFalloff');
    expect(SURFACE_LIGHT_GLSL).toContain('surfPartyFalloff');
    const src = readFileSync(resolve(__dirname, '../src/proto3d/surface-light.ts'), 'utf8');
    expect(src).toContain('diffuseColor.rgb = applySurfaceLight(albedo, vSurfWorldPos)');
    expect(src).toContain('return albedo * lighting');
    expect(src).toContain('vSurfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz');
  });

  it('multiplies albedo so dark mortar is not lifted to ambient grey', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/surface-light.ts'), 'utf8');
    expect(src).toContain('albedo * lighting');
    expect(src).not.toMatch(/albedo\s*\+\s*uAmbientRgb/);
    expect(src).not.toMatch(/max\s*\(\s*albedo/);
    expect(SURFACE_LIGHT_GLSL).not.toMatch(/albedo\s*\+/);

    const mortar: [number, number, number] = [0.05, 0.045, 0.04];
    const brick: [number, number, number] = [0.45, 0.42, 0.38];
    const lighting: [number, number, number] = [0.4, 0.36, 0.28];
    const ambient = 0.05848;
    const litM = applyAlbedoLight(mortar, lighting);
    const litB = applyAlbedoLight(brick, lighting);
    expect(litM[0] / litB[0]).toBeCloseTo(mortar[0] / brick[0], 10);
    expect(litM[0], 'mortar stays below ambient grey').toBeLessThan(ambient);
    expect(Math.max(mortar[0] * lighting[0], ambient), 'output-floor would lift mortar').toBeGreaterThan(
      litM[0]
    );
  });

  it('patches MeshBasicMaterial once and disables vertex colours', () => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const shared = createSurfaceLightShared();
    const local = createSurfaceLightLocal();
    patchSurfaceLightMaterial(mat, shared, local);
    patchSurfaceLightMaterial(mat, shared, local);
    expect(mat.vertexColors).toBe(false);
    expect(mat.userData.surfaceLightPatched).toBe(true);
    expect(mat.customProgramCacheKey()).toBe(SURFACE_LIGHT_CACHE_KEY);
    expect(typeof mat.onBeforeCompile).toBe('function');
  });
});
