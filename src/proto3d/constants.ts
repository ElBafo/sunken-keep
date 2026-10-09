import { Sconce } from './types';

/** World units per grid tile. Wall quads are CELL_SIZE × CELL_SIZE. */
export const CELL_SIZE = 2;

/** Tiles behind cell centre along the facing direction (EOB-style floor strip). */
export const CAMERA_BACK_OFFSET_TILES = 0.4;
export const CAMERA_EYE_HEIGHT = 1.1;
/** Negative = look down, so the current-square floor stays in frame. */
export const CAMERA_PITCH = (-10 * Math.PI) / 180;
export const CAMERA_FOV = 78;
export const CAMERA_NEAR = 0.08;
export const CAMERA_FAR = 32;

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
/** Flame-frame multipliers for the sconce warm term (subtle wall flicker). */
export const SCONCE_FLICKER = [0.85, 0.7, 1.0] as const;
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
