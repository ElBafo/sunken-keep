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
  SHADOW_MAP_MOBILE
} from '../voxel-lab/constants';

/** Same grid / eye / FOV as proto3d. Lab materials still use LAYER_SIZE = 1 cm. */
export const CELL = cameraSpec.cellSize;
export const EYE_HEIGHT = cameraSpec.eyeHeight;
export const CAMERA_FOV = cameraSpec.fov;
export const CAMERA_NEAR = cameraSpec.near;
export const CAMERA_FAR = cameraSpec.far;
export const CAMERA_PITCH = (cameraSpec.pitchDeg * Math.PI) / 180;
export const BACK_OFFSET = cameraSpec.backOffsetTiles * CELL;

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
  SHADOW_MAP_MOBILE
};
