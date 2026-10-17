import cameraSpec from '../../public/proto3d/camera.json';
import {
  LANTERN_COLOR,
  LANTERN_DISTANCE,
  LANTERN_FLICKER,
  LANTERN_FLICKER_MS,
  LANTERN_HOLD,
  LANTERN_INTENSITY,
  LANTERN_SPOT_ANGLE,
  LANTERN_SPOT_INTENSITY,
  LANTERN_SPOT_MAP_DESKTOP,
  LANTERN_SPOT_MAP_MOBILE,
  LAYER_SIZE,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  TORCH_COLOR
} from '../voxel-lab/constants';

/** Same grid / eye / FOV as proto3d. Lab materials still use LAYER_SIZE = 1 cm. */
export const CELL = cameraSpec.cellSize;
export const EYE_HEIGHT = cameraSpec.eyeHeight;
export const CAMERA_FOV = cameraSpec.fov;
export const CAMERA_NEAR = cameraSpec.near;
export const CAMERA_FAR = cameraSpec.far;
export const CAMERA_PITCH = (cameraSpec.pitchDeg * Math.PI) / 180;
export const BACK_OFFSET = cameraSpec.backOffsetTiles * CELL;
/** Same logical 3D view box as proto3d — keeps hall length matching Classic. */
export const CAMERA_VIEW_W = cameraSpec.view[0];
export const CAMERA_VIEW_H = cameraSpec.view[1];
export const CAMERA_VIEW_ASPECT = CAMERA_VIEW_W / CAMERA_VIEW_H;
/** Same fog window as proto3d so a far square does not vanish early. */
export const FOG_NEAR = 10;
export const FOG_FAR = 28;

/** Same step/turn window as proto3d. */
export const MOVE_MS = 180;
export const TURN_MS = 180;
export const SWIPE_THRESHOLD = 50;

/** Real cubes within this Chebyshev distance; flat-but-lit beyond. */
export const VOXEL_CHEB = 3;
/** Skip faces past fog / lantern reach. */
export const CULL_CHEB = 12;

export const WALL_VARIANTS = [
  'wall_plain.png',
  'wall_plain_2.png',
  'wall_plain_3.png',
  'wall_plain_4.png'
] as const;
export const FLOOR_VARIANTS = [
  'floor_stone.png',
  'floor_stone_2.png',
  'floor_stone_3.png',
  'floor_stone_4.png'
] as const;
export const CEILING_VARIANTS = ['ceiling.png', 'ceiling_2.png', 'ceiling_3.png', 'ceiling_4.png'] as const;
export const CRACKED_CEILING_FILE = 'ceiling_cracked.png';

/** Same wall-mount sizes / flicker window as proto3d; duplicated so this page does not import it. */
export const SCONCE_WIDTH_TILES = 0.25;
export const SCONCE_HEIGHT_TILES = 0.5;
export const SCONCE_WALL_OFFSET_TILES = 0.015;
export const WALL_MOUNT_INSET = Math.max(SCONCE_WALL_OFFSET_TILES * CELL, 0.08);
export const SCONCE_FRONT_OFFSET_TILES = 0.14;
export const SCONCE_ANIM_FPS = 5;
/** Game torch flood radius (tiles). Lab point/spot still do the per-pixel work. */
export const SCONCE_RADIUS_TILES = 2.5;
export const TORCH_DISTANCE = SCONCE_RADIUS_TILES * CELL;
/**
 * Lab uses 8 on a 2.5 m cell with the fill inside the mount — that blows out
 * floor-1 walls. Flame sits ~0.37 m off the wall; keep inverse-square modest.
 */
export const TORCH_INTENSITY = 3.2;
export const TORCH_SPOT_INTENSITY = 4;
export const TORCH_SPOT_DISTANCE = 7.5;
export const TORCH_SPOT_ANGLE = Math.PI / 4.8;
export const MAX_ACTIVE_TORCHES = 2;
export const MAX_ACTIVE_SUNBEAMS = 1;
export const TORCH_FADE_MS = 280;
export const SUNBEAM_COLOR = 0xb3d6ff;
export const SUNBEAM_INTENSITY = 0.38 * 8;
export const SUNBEAM_DISTANCE = CELL * 2.4;
export const SUNBEAM_RADIUS_TILES = 2.0;
export const SUNBEAM_ANGLE = Math.PI / 7;
export const SHAFT_WIDTH_TILES = 0.55;
export const SHAFT_OPACITY = 1;

/** Voxel iron bracket — painted-sconce dark iron, not pale silver. */
export const BRACKET_VOX = 0.05;
export const BRACKET_DIMS: [number, number, number] = [10, 20, 10];
export const BRACKET_WALL_GAP = 0.02;
export const BRACKET_FLAME_OUT = 0.37;
export const BRACKET_FLAME_LIFT = 0.29;
export const IRON_COLOR = 0x1a120e;
export const RUST_COLOR = 0x3a2214;
export const BRASS_COLOR = 0x4a3218;

export {
  LANTERN_COLOR,
  LANTERN_DISTANCE,
  LANTERN_FLICKER,
  LANTERN_FLICKER_MS,
  LANTERN_HOLD,
  LANTERN_INTENSITY,
  LANTERN_SPOT_ANGLE,
  LANTERN_SPOT_INTENSITY,
  LANTERN_SPOT_MAP_DESKTOP,
  LANTERN_SPOT_MAP_MOBILE,
  LAYER_SIZE,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  TORCH_COLOR
};
