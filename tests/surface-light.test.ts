import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isSurfaceLitKind,
  patchSurfaceLightMaterial,
  createSurfaceLightLocal,
  createSurfaceLightShared,
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
    expect(src).toContain('diffuseColor.rgb *= surfaceLightRgb(vSurfWorldPos)');
    expect(src).toContain('vSurfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz');
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
