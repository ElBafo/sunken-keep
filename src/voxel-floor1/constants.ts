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
/** Hide wall mounts that would clip the near plane (same band as proto3d). */
export const WALL_MOUNT_NEAR_CULL = CAMERA_NEAR + 0.5;
export const CUTOUT_ALPHA_TEST = 0.5;
export const CAMERA_PITCH = (cameraSpec.pitchDeg * Math.PI) / 180;
export const BACK_OFFSET = cameraSpec.backOffsetTiles * CELL;
/** Classic 270×380 letterbox — kept as the reference that yields 61.61° horizontal FOV. */
export const CAMERA_VIEW_W = cameraSpec.view[0];
export const CAMERA_VIEW_H = cameraSpec.view[1];
export const CAMERA_VIEW_ASPECT = CAMERA_VIEW_W / CAMERA_VIEW_H;
export { CAMERA_HFOV_DEG } from './portrait-layout';
/** Same fog window as proto3d so a far square does not vanish early. */
export const FOG_NEAR = 10;
export const FOG_FAR = 28;

/** Same step/turn window as proto3d. */
export const MOVE_MS = 180;
export const TURN_MS = 180;
export const SWIPE_THRESHOLD = 50;

/** Same slide as proto3d: secret walls still ride up into the lintel. */
export const DOOR_SLIDE = 1.42;
export const DOOR_OPEN_MS = 1450;
export const DOOR_CLOSE_MS = 600;
export const DOOR_PANEL_INSET = 0.05;
export const DOOR_UNLOCK_LEAD_MS = 350;
/**
 * Door leaf rides up into the wall above the opening (portcullis).
 * Far enough that the lintel void is clear; the mesh is clipped
 * at the cornice and hidden when fully open so it never pokes through.
 */
export const DOOR_LEAF_SLIDE = 1.84;
export const DOOR_LEAF_MS = 600;

/** Real cubes within this Chebyshev distance; flat-but-lit beyond. */
export const VOXEL_CHEB = 3;
/**
 * Draw as far as Classic fog (FOG_FAR / CELL). Torch- and beam-flood faces
 * are kept even past this — the lit patch must stay visible down a long hall.
 */
export const CULL_CHEB = Math.ceil(FOG_FAR / CELL);

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
export const CEILING_VARIANTS = [
  'ceiling_rubble_1.png',
  'ceiling_rubble_2.png',
  'ceiling_rubble_3.png'
] as const;
export const PLANK_CEILING_VARIANTS = [
  'ceiling_planks_1.png',
  'ceiling_planks_2.png',
  'ceiling_planks_3.png'
] as const;
export const CRACKED_CEILING_FILE = 'ceiling_cracked.png';
/** One 256² rubble tile per 2 m cell — same density as the floor, readable on a phone. */
export const RUBBLE_UV_SCALE = 1;
/**
 * Room-side relief of a normal (non-door) wall plate (~3 cm).
 */
export const ARCH_FRONT = 0.03;
/**
 * Combined two-sided doorway wall (~30 cm). Each room owns half, sealed
 * with that room's stone. Not a passage cell.
 */
export const DOOR_WALL_DEPTH = 0.3;
export const DOOR_WALL_HALF = DOOR_WALL_DEPTH / 2;
/** Legacy deep-reveal helper depth. Door openings do not use this. */
export const ARCH_DEPTH = CELL * 0.48;
export const ARCH_LAYERS = Math.max(3, Math.round(ARCH_FRONT / LAYER_SIZE));
export const DOOR_LAYERS = Math.max(3, Math.round(DOOR_WALL_HALF / LAYER_SIZE));

/** One brick-course band, flush on the wall. 256×64 tile spans two cells. */
export const CORNICE_HEIGHT = 0.18;
export const CORNICE_DEPTH = 0.09;
/** Bite into the wall so the underside covers the wall top (no light leak). */
export const CORNICE_WALL_INSET = 0.03;
export const CORNICE_TEXELS_U = 256;
export const CORNICE_TEXELS_V = 64;
/** Painted shadow line on the strip — mapped to the underside, not the front. */
export const CORNICE_SHADOW_ROWS = { brick: 10, slab: 12 } as const;

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
/** Same decay the PointLight and the far bake use (Three.js physically-correct). */
export const TORCH_DECAY = 2;
/**
 * Lab uses 8 on a 2.5 m cell with the fill inside the mount — that blows out
 * floor-1 walls. Flame sits ~0.37 m off the wall; keep inverse-square modest.
 * Far bake uses this same candela value so the pool does not change at the switch.
 */
export const TORCH_INTENSITY = 3.2;
/** Linear RGB of TORCH_COLOR — shared by PointLights and the far bake. */
export const TORCH_RGB: [number, number, number] = [
  ((TORCH_COLOR >> 16) & 255) / 255,
  ((TORCH_COLOR >> 8) & 255) / 255,
  (TORCH_COLOR & 255) / 255
];
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
/** Same penumbra / decay the SpotLight and the far bake use. */
export const SUNBEAM_PENUMBRA = 0.45;
export const SUNBEAM_DECAY = 1.2;
/** Linear RGB of SUNBEAM_COLOR — shared by SpotLights and the far bake. */
export const SUNBEAM_RGB: [number, number, number] = [
  ((SUNBEAM_COLOR >> 16) & 255) / 255,
  ((SUNBEAM_COLOR >> 8) & 255) / 255,
  (SUNBEAM_COLOR & 255) / 255
];
export const SHAFT_WIDTH_TILES = 0.55;
export const SHAFT_OPACITY = 1;
/** Outer-shell bulge, as a fraction of one square. JSON caps it at 0.04. */
export const WALL_BULGE_FRAC = 0.04;

/** Wall `tex3d` PNGs are 128² on a CELL-metre face. Bracket voxels match that. */
export const WALL_TEXELS = 128;
export const BRACKET_VOX = CELL / WALL_TEXELS;
export const BRACKET_DIMS: [number, number, number] = [16, 48, 22];
/** Back of the 1-texel plate just past the 3 cm stone relief. */
export const BRACKET_WALL_GAP = 2 * BRACKET_VOX;
/** Gold cup top-centre in occupancy (u, v, d). Flame base anchors here. */
export const BRACKET_CUP_U = 8.5;
export const BRACKET_CUP_V = 42;
export const BRACKET_CUP_D = 11.5;
export const BRACKET_FLAME_OUT = BRACKET_CUP_D * BRACKET_VOX + BRACKET_WALL_GAP;
export const BRACKET_FLAME_LIFT = 0.04 + (BRACKET_CUP_V - BRACKET_DIMS[1] / 2) * BRACKET_VOX;
export const BRACKET_HANDLE_TILT = (18 * Math.PI) / 180;
/**
 * Teardrop ~plate-wide and ~1/3 handle tall. PNG is 16×14 with 4 px of empty
 * tip, so the plane is a little larger than the visible flame.
 */
export const BRACKET_FLAME_W = 14 * BRACKET_VOX;
export const BRACKET_FLAME_H = 15 * BRACKET_VOX;
/** Drop the sprite into the cup so the wide base overlaps the gold rim. */
export const BRACKET_FLAME_SINK = 1.5 * BRACKET_VOX;
/** Point light in the short flame above the gold cup. */
export const BRACKET_LIGHT_FORWARD = 0.03;
export const BRACKET_LIGHT_UP = 0.05;
/** Plate darker than the stone mid; bevel a step lighter so the edge reads. */
export const IRON_COLOR = 0x2a2826;
export const RUST_COLOR = 0x4a4844;
export const WOOD_COLOR = 0x5c3318;
export const GOLD_COLOR = 0xb07a18;
/** Recessed rune grooves — dull banked-coal, not a light and not brass. */
export const EMBER_COLOR = 0x8a3f16;
export const BRACKET_LAYER = 1;

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
