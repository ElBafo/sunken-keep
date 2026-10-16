/** Standalone voxel-lab constants. Duplicated on purpose — do not import proto3d. */

/** One dungeon square, metres. Walls are this tall. */
export const CELL = 2.5;
/** Interior walkable grid (3×3 squares). */
export const ROOM_TILES = 3;
export const ROOM = CELL * ROOM_TILES;

/** Game eye height is 0.94 at 2 m walls; scale to 2.5 m. */
export const EYE_HEIGHT = 0.94 * (CELL / 2);
export const CAMERA_FOV = 80;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 28;

/** Relief: darker mortar ~1 cm, bright stone ~3 cm. */
export const DEPTH_LAYERS = 3;
export const LAYER_SIZE = 0.01;

export const MOVE_MS = 260;
/** 90° turns — same ease window as proto3d (180 ms). */
export const TURN_MS = 180;
export const LOOK_SENS = 0.00135;
export const PITCH_MAX = 0.72;

/** Cubemap faces; 128 was too coarse for brick relief + sconce silhouettes. */
export const SHADOW_MAP_MOBILE = 256;
export const SHADOW_MAP_DESKTOP = 512;

export const TORCH_COLOR = 0xff9a48;
/** Local pools so a second torch cannot fill in the first torch's umbra. */
export const TORCH_INTENSITY = 8;
export const TORCH_DISTANCE = 3.2;
export const LAMP_COLOR = 0xffc070;
export const LAMP_INTENSITY = 9;
export const LAMP_DISTANCE = 6;

/** Held lantern — long enough to throw crate/pillar silhouettes onto the far wall. */
export const LANTERN_COLOR = 0xead1a3;
export const LANTERN_INTENSITY = 8.5;
export const LANTERN_DISTANCE = 2.2 * CELL;
export const LANTERN_FLICKER = 0.03;
export const LANTERN_FLICKER_MS = 3500;
/** Camera-local: +X right, +Y up, −Z forward. Slightly below eye, right hand. */
export const LANTERN_HOLD: readonly [number, number, number] = [0.16, -0.07, -0.22];
/** Forward spot so crate/pillar umbras read on the far wall (cubemaps stay on the torches). */
export const LANTERN_SPOT_MAP_MOBILE = 512;
export const LANTERN_SPOT_MAP_DESKTOP = 1024;
export const LANTERN_SPOT_ANGLE = Math.PI / 4.2;
export const LANTERN_SPOT_INTENSITY = 7;

export const MAT_DRY = 0;
export const MAT_WET = 1;
export const MAT_MOSS = 2;
/** Roughness map bytes (G channel). Wet glints vs moss/mortar matte. */
export const ROUGH_WET = 64;
export const ROUGH_STONE = 150;
export const ROUGH_MATTE = 252;
/** Drop 1–2 texel sparkles; keep a 2×2 (or bigger) wet highlight. */
export const MIN_WET_NEIGHBORS = 2;
export const MIN_WET_BLOB = 4;
/** Push greedy faces out along their normal so coplanar cube edges do not z-fight. */
export const FACE_INSET = 0.00025;
export type MaterialId = typeof MAT_DRY | typeof MAT_WET | typeof MAT_MOSS;
export const MATERIAL_NAMES = ['dry', 'wet', 'moss'] as const;

export const WALL_FILES = [
  'wall_plain.png',
  'wall_plain_2.png',
  'wall_plain_3.png',
  'wall_knot.png'
] as const;

export const FLOOR_FILES = ['floor_stone.png', 'floor_stone_2.png', 'floor_stone_3.png'] as const;
export const CEILING_FILES = ['ceiling.png', 'ceiling_2.png', 'ceiling_3.png'] as const;

export const FLAME_FILES = [
  'torch/flame_calm_1.png',
  'torch/flame_calm_2.png',
  'torch/flame_calm_3.png',
  'torch/flame_calm_4.png'
] as const;

export const SCONCE_FILE = 'torch/bracket_lit_front.png';
export const LAMP_FILE = '../atmo/lamp_capped.png';

/** Game sprites, loaded by URL only — do not import proto3d. */
export const CHEST_SPRITE_FILE = 'art/dungeon/item_chest_near.png';
export const SLIME_SPRITE_FILE = 'art/dungeon/monsters_v2/slime_idle_1_near.png';
