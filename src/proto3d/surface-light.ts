import * as THREE from 'three';
import {
  CARRIED_TORCH_INTENSITY,
  CARRIED_TORCH_RADIUS_TILES,
  CELL_SIZE,
  LANTERN_CORE_TILES,
  LANTERN_HEIGHT,
  SCONCE_RADIUS_TILES,
  SUNBEAM_INTENSITY,
  SUNBEAM_RADIUS_TILES,
  TORCH_INTENSITY,
  WALL_LANTERN_INTENSITY,
  WALL_LANTERN_RADIUS_TILES
} from './constants';

/** Max lit sconces that can reach one wall/floor tile (sconce radius is 2.5). */
export const SURFACE_MAX_TORCHES = 4;
export const SURFACE_MAX_SUNBEAMS = 4;
/** Floor verts below this Y use the 2D lantern disk (matches partyDistTiles). */
export const FLOOR_DISK_Y = 0.28;
/** Extra 3D falloff on untagged non-floor verts (matches partyDistTiles). */
export const NONFLOOR_HEIGHT_PENALTY = 0.55;
export const PARTY_FALLOFF_CORE_FRAC = 0.45;

export const SURFACE_LIGHT_CACHE_KEY = 'surf-light-frag-v3';
export type LightDebugMode =
  | 'final'
  | 'albedo'
  | 'lantern'
  | 'torch'
  | 'ambient'
  | 'lighting'
  | 'light'
  | 'nofog'
  | 'nomip'
  | 'nopalette'
  | 'nodust';

const LIGHT_DEBUG_MODES: readonly LightDebugMode[] = [
  'final',
  'albedo',
  'lantern',
  'torch',
  'ambient',
  'lighting',
  'light',
  'nofog',
  'nomip',
  'nopalette',
  'nodust'
];

export function parseLightDebugMode(raw: string | null | undefined): LightDebugMode | null {
  if (!raw) return null;
  if (raw === '1' || raw === 'true') return null;
  if ((LIGHT_DEBUG_MODES as readonly string[]).includes(raw)) {
    return raw === 'light' ? 'lighting' : (raw as LightDebugMode);
  }
  return null;
}

/**
 * Painted albedo × lighting factor. Never add ambient onto the texel —
 * that lifts dark mortar gaps to a flat grey.
 */
export function applyAlbedoLight(
  albedo: [number, number, number],
  lighting: [number, number, number]
): [number, number, number] {
  return [albedo[0] * lighting[0], albedo[1] * lighting[1], albedo[2] * lighting[2]];
}

/** Dungeon geometry that must light per pixel (not gameplay tile-light, not props). */
export function isSurfaceLitKind(kind: unknown): boolean {
  if (typeof kind !== 'string') return false;
  if (kind === 'wall' || kind === 'secret' || kind === 'ceiling' || kind.startsWith('door')) return true;
  return (
    kind === 'floor' ||
    kind === 'water-deep' ||
    kind === 'water-shallow' ||
    kind === 'water-surface'
  );
}

export interface SurfaceLightShared {
  uAmbientRgb: { value: THREE.Vector3 };
  uBright: { value: number };
  uFlicker: { value: number };
  uPartyX: { value: number };
  uPartyY: { value: number };
  uOil: { value: number };
  uLanternRgb: { value: THREE.Vector3 };
  uLanternIntensity: { value: number };
  uLanternRadius: { value: number };
  uWallLanternIntensity: { value: number };
  uWallLanternRadius: { value: number };
  uLanternCore: { value: number };
  uCarriedTorch: { value: number };
  uCarriedIntensity: { value: number };
  uCarriedRadius: { value: number };
  uTorchRgb: { value: THREE.Vector3 };
  uTorchIntensity: { value: number };
  uTorchRadius: { value: number };
  uSunbeamRgb: { value: THREE.Vector3 };
  uSunbeamIntensity: { value: number };
  uSunbeamRadius: { value: number };
  uSunbeamCount: { value: number };
  uSunbeamPos: { value: THREE.Vector2[] };
  uCellSize: { value: number };
  uLanternHeight: { value: number };
  uFloorDiskY: { value: number };
  uHeightPenalty: { value: number };
  uCoreFrac: { value: number };
  uDebugMode: { value: number };
}

export interface SurfaceLightLocal {
  uPartyReach: { value: number };
  uIsWall: { value: number };
  uIsDark: { value: number };
  uLightGround: { value: number };
  uGroundPos: { value: THREE.Vector3 };
  uTorchCount: { value: number };
  uTorchPos: { value: THREE.Vector3[] };
}

export function createSurfaceLightShared(): SurfaceLightShared {
  return {
    uAmbientRgb: { value: new THREE.Vector3() },
    uBright: { value: 1 },
    uFlicker: { value: 1 },
    uPartyX: { value: 0 },
    uPartyY: { value: 0 },
    uOil: { value: 1 },
    uLanternRgb: { value: new THREE.Vector3() },
    uLanternIntensity: { value: 0 },
    uLanternRadius: { value: 0 },
    uWallLanternIntensity: { value: WALL_LANTERN_INTENSITY },
    uWallLanternRadius: { value: WALL_LANTERN_RADIUS_TILES },
    uLanternCore: { value: LANTERN_CORE_TILES },
    uCarriedTorch: { value: 0 },
    uCarriedIntensity: { value: CARRIED_TORCH_INTENSITY },
    uCarriedRadius: { value: CARRIED_TORCH_RADIUS_TILES },
    uTorchRgb: { value: new THREE.Vector3(1.0, 0.86, 0.58) },
    uTorchIntensity: { value: TORCH_INTENSITY },
    uTorchRadius: { value: SCONCE_RADIUS_TILES },
    uSunbeamRgb: { value: new THREE.Vector3(0.7, 0.84, 1.0) },
    uSunbeamIntensity: { value: SUNBEAM_INTENSITY },
    uSunbeamRadius: { value: SUNBEAM_RADIUS_TILES },
    uSunbeamCount: { value: 0 },
    uSunbeamPos: {
      value: Array.from({ length: SURFACE_MAX_SUNBEAMS }, () => new THREE.Vector2())
    },
    uCellSize: { value: CELL_SIZE },
    uLanternHeight: { value: LANTERN_HEIGHT },
    uFloorDiskY: { value: FLOOR_DISK_Y },
    uHeightPenalty: { value: NONFLOOR_HEIGHT_PENALTY },
    uCoreFrac: { value: PARTY_FALLOFF_CORE_FRAC },
    uDebugMode: { value: 0 }
  };
}

export function createSurfaceLightLocal(): SurfaceLightLocal {
  return {
    uPartyReach: { value: 0 },
    uIsWall: { value: 0 },
    uIsDark: { value: 0 },
    uLightGround: { value: 0 },
    uGroundPos: { value: new THREE.Vector3() },
    uTorchCount: { value: 0 },
    uTorchPos: {
      value: Array.from({ length: SURFACE_MAX_TORCHES }, () => new THREE.Vector3())
    }
  };
}

/**
 * Same lantern+torch screen-blend as shadeVertex, evaluated at the fragment's
 * world position so Gouraud interpolation cannot open a dark valley.
 */
export const SURFACE_LIGHT_GLSL = /* glsl */ `
uniform vec3 uAmbientRgb;
uniform float uBright;
uniform float uFlicker;
uniform float uPartyX;
uniform float uPartyY;
uniform float uOil;
uniform vec3 uLanternRgb;
uniform float uLanternIntensity;
uniform float uLanternRadius;
uniform float uWallLanternIntensity;
uniform float uWallLanternRadius;
uniform float uLanternCore;
uniform float uCarriedTorch;
uniform float uCarriedIntensity;
uniform float uCarriedRadius;
uniform vec3 uTorchRgb;
uniform float uTorchIntensity;
uniform float uTorchRadius;
uniform vec3 uSunbeamRgb;
uniform float uSunbeamIntensity;
uniform float uSunbeamRadius;
uniform float uSunbeamCount;
uniform vec2 uSunbeamPos[4];
uniform float uCellSize;
uniform float uLanternHeight;
uniform float uFloorDiskY;
uniform float uHeightPenalty;
uniform float uCoreFrac;
uniform float uDebugMode;
uniform float uPartyReach;
uniform float uIsWall;
uniform float uIsDark;
uniform float uLightGround;
uniform vec3 uGroundPos;
uniform float uTorchCount;
uniform vec3 uTorchPos[4];

float surfSmoothFalloff(float distTiles, float radius) {
  if (radius <= 0.0 || distTiles >= radius) return 0.0;
  float t = 1.0 - distTiles / radius;
  return t * t * (3.0 - 2.0 * t);
}

float surfPartyFalloff(float distTiles, float radius) {
  if (radius <= 0.0 || distTiles >= radius) return 0.0;
  float core = min(uLanternCore, radius * uCoreFrac);
  if (distTiles <= core) return 1.0;
  float t = 1.0 - (distTiles - core) / (radius - core);
  return t * t * t * t;
}

float surfPartyDist(vec3 wp) {
  float dx = wp.x / uCellSize - uPartyX;
  float dz = wp.z / uCellSize - uPartyY;
  float horiz = sqrt(dx * dx + dz * dz);
  float dy = (wp.y - uLanternHeight) / uCellSize;
  float d = sqrt(horiz * horiz + dy * dy);
  if (uIsWall > 0.5) return d;
  if (wp.y < uFloorDiskY) return horiz;
  return d + uHeightPenalty;
}

void surfScreenAccum(inout vec3 rgb, float weight, vec3 color) {
  if (weight <= 0.0) return;
  rgb = 1.0 - (1.0 - rgb) * (1.0 - min(vec3(1.0), weight * color));
}

vec3 surfaceLightRgb(vec3 worldPos) {
  vec3 wp = mix(worldPos, uGroundPos, step(0.5, uLightGround));
  vec3 rgb = vec3(0.0);

  if (uPartyReach > 0.5) {
    float partyDist = surfPartyDist(wp);
    if (uIsWall > 0.5) {
      float rad = uOil > 0.5 ? uWallLanternRadius : uLanternRadius;
      float inten = uOil > 0.5 ? uWallLanternIntensity : uLanternIntensity;
      surfScreenAccum(rgb, inten * surfSmoothFalloff(partyDist, rad), uLanternRgb);
    } else {
      surfScreenAccum(rgb, uLanternIntensity * surfPartyFalloff(partyDist, uLanternRadius), uLanternRgb);
    }
    if (uCarriedTorch > 0.5) {
      surfScreenAccum(rgb, uCarriedIntensity * surfPartyFalloff(partyDist, uCarriedRadius), uTorchRgb);
    }
  }

  if (uIsDark < 0.5) {
    float torchWorldR = uTorchRadius * uCellSize;
    if (uTorchCount > 0.5) {
      float dist = length(wp - uTorchPos[0]);
      if (dist < torchWorldR) {
        surfScreenAccum(rgb, uTorchIntensity * surfSmoothFalloff(dist / uCellSize, uTorchRadius) * uFlicker, uTorchRgb);
      }
    }
    if (uTorchCount > 1.5) {
      float dist = length(wp - uTorchPos[1]);
      if (dist < torchWorldR) {
        surfScreenAccum(rgb, uTorchIntensity * surfSmoothFalloff(dist / uCellSize, uTorchRadius) * uFlicker, uTorchRgb);
      }
    }
    if (uTorchCount > 2.5) {
      float dist = length(wp - uTorchPos[2]);
      if (dist < torchWorldR) {
        surfScreenAccum(rgb, uTorchIntensity * surfSmoothFalloff(dist / uCellSize, uTorchRadius) * uFlicker, uTorchRgb);
      }
    }
    if (uTorchCount > 3.5) {
      float dist = length(wp - uTorchPos[3]);
      if (dist < torchWorldR) {
        surfScreenAccum(rgb, uTorchIntensity * surfSmoothFalloff(dist / uCellSize, uTorchRadius) * uFlicker, uTorchRgb);
      }
    }
    if (uSunbeamCount > 0.5) {
      vec2 d0 = vec2(wp.x / uCellSize, wp.z / uCellSize) - uSunbeamPos[0];
      surfScreenAccum(rgb, uSunbeamIntensity * surfSmoothFalloff(length(d0), uSunbeamRadius), uSunbeamRgb);
    }
    if (uSunbeamCount > 1.5) {
      vec2 d1 = vec2(wp.x / uCellSize, wp.z / uCellSize) - uSunbeamPos[1];
      surfScreenAccum(rgb, uSunbeamIntensity * surfSmoothFalloff(length(d1), uSunbeamRadius), uSunbeamRgb);
    }
    if (uSunbeamCount > 2.5) {
      vec2 d2 = vec2(wp.x / uCellSize, wp.z / uCellSize) - uSunbeamPos[2];
      surfScreenAccum(rgb, uSunbeamIntensity * surfSmoothFalloff(length(d2), uSunbeamRadius), uSunbeamRgb);
    }
    if (uSunbeamCount > 3.5) {
      vec2 d3 = vec2(wp.x / uCellSize, wp.z / uCellSize) - uSunbeamPos[3];
      surfScreenAccum(rgb, uSunbeamIntensity * surfSmoothFalloff(length(d3), uSunbeamRadius), uSunbeamRgb);
    }
  }

  // Lighting *factor* (0–1). Ambient is a floor on this factor only.
  // Applied as albedo * lighting — never added onto the texel.
  vec3 lighting = min(vec3(1.0), max(uAmbientRgb, rgb) * uBright);
  return lighting;
}

vec3 applySurfaceLight(vec3 albedo, vec3 worldPos) {
  if (uDebugMode > 0.5 && uDebugMode < 1.5) return albedo;
  vec3 lighting = surfaceLightRgb(worldPos);
  if (uDebugMode > 1.5 && uDebugMode < 2.5) return lighting;
  return albedo * lighting;
}
`;

export function patchSurfaceLightMaterial(
  material: THREE.MeshBasicMaterial,
  shared: SurfaceLightShared,
  local: SurfaceLightLocal
): void {
  if (material.userData.surfaceLightPatched) return;
  material.userData.surfaceLightPatched = true;
  material.userData.surfaceLightLocal = local;
  material.vertexColors = false;
  material.needsUpdate = true;
  material.customProgramCacheKey = () => SURFACE_LIGHT_CACHE_KEY;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, local);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSurfWorldPos;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vSurfWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${SURFACE_LIGHT_GLSL}
varying vec3 vSurfWorldPos;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 albedo = diffuseColor.rgb;
  diffuseColor.rgb = applySurfaceLight(albedo, vSurfWorldPos);
}`
      );
  };
}
