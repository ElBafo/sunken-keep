import { Sconce, Tile } from './types';

/** World units per grid tile. Wall quads are CELL_SIZE × CELL_SIZE. */
export const CELL_SIZE = 2;

/** Tiles behind cell centre along the facing direction (EOB-style floor strip). */
export const CAMERA_BACK_OFFSET_TILES = 0.5;
/** ~0.47 of wall height (walls are CELL_SIZE). */
export const CAMERA_EYE_HEIGHT = 0.94;
/** Slight look-down only — floor strip comes mostly from back-offset + FOV. */
export const CAMERA_PITCH = (-3.5 * Math.PI) / 180;
export const CAMERA_FOV = 80;
export const CAMERA_NEAR = 0.08;
export const CAMERA_FAR = 32;
export const STEP_BOB_AMPLITUDE = 0.038;

/** Shallow flooded bed. Deep lane sinks further; the translucent surface sits at y 0. */
export const WATER_SHALLOW_Y = -0.15;
export const WATER_DEEP_Y = -0.4;
export const WATER_SURFACE_Y = 0;
/** @deprecated alias for WATER_SHALLOW_Y */
export const WATER_Y = WATER_SHALLOW_Y;
/** Walls drop to the deep bed so no black gap shows beside deep water. */
export const WALL_BOTTOM = WATER_DEEP_Y;
export const WALL_TOP = CELL_SIZE;
export const WATER_SURFACE_FPS = 6;
/** Billboards sit this far above a floor or water surface so they pass the depth test. */
export const SPRITE_SURFACE_LIFT = 0.04;

export function tileBedY(tile: Pick<Tile, 'deepWater' | 'shallowWater'>): number {
  if (tile.deepWater) return WATER_DEEP_Y;
  if (tile.shallowWater) return WATER_SHALLOW_Y;
  return 0;
}

export function isWaterTile(tile: Pick<Tile, 'deepWater' | 'shallowWater'>): boolean {
  return !!(tile.deepWater || tile.shallowWater);
}

export const FOG_COLOR = 0x060504;
export const FOG_NEAR = 3.2;
export const FOG_FAR = 12.0;

/** Panel slides up this far (texture door is ~1.33 tall); thud at 1.45s / slam at 0.6s. */
export const DOOR_SLIDE = 1.42;
export const DOOR_OPEN_MS = 1450;
export const DOOR_CLOSE_MS = 600;
export const DOOR_PANEL_INSET = 0.05;
export const DOOR_UNLOCK_LEAD_MS = 350;

/**
 * Old sconce art leaned right; flip UVs on faces where that lean goes into the wall.
 * v2 cut-outs are straight-on — leave this off. Switch on if the leaning sprites return.
 */
export const MIRROR_BAKED_SCONCE_LEAN = false;

/** Sconce / glow sizes in tile units (artist spec assumes 1×1 tiles). */
export const SCONCE_WIDTH_TILES = 0.25;
export const SCONCE_HEIGHT_TILES = 0.5;
export const SCONCE_WALL_OFFSET_TILES = 0.015;
export const SCONCE_ANIM_FPS = 8;
/** Flame-frame multipliers for the sconce warm term (keep flicker readable). */
export const SCONCE_FLICKER = [0.78, 0.58, 1.08] as const;
export const SCONCE_RADIUS_TILES = 1.5;
export const FACE_SEGMENTS = 4;
export const CUTOUT_ALPHA_TEST = 0.5;

/** Unit normal into the room and Y-rotation so a PlaneGeometry faces that way. */
export const FACE_INTO_ROOM: Record<
  Sconce['face'],
  { nx: number; nz: number; rotY: number }
> = {
  N: { nx: 0, nz: -1, rotY: Math.PI },
  E: { nx: 1, nz: 0, rotY: Math.PI / 2 },
  S: { nx: 0, nz: 1, rotY: 0 },
  W: { nx: -1, nz: 0, rotY: -Math.PI / 2 }
};

export function cameraOffsetXZ(rotY: number): [number, number] {
  const back = CAMERA_BACK_OFFSET_TILES * CELL_SIZE;
  return [Math.sin(rotY) * back, Math.cos(rotY) * back];
}

/** Faces where unflipped right-leaning art would point into the wall, not the corridor. */
export function sconceNeedsMirror(face: Sconce['face']): boolean {
  if (!MIRROR_BAKED_SCONCE_LEAN) return false;
  return face === 'W' || face === 'N';
}
