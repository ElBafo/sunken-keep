import cameraSpec from '../../public/proto3d/camera.json';
import { Sconce, Tile } from './types';

export const CAMERA_SPEC = cameraSpec;

/** World units per grid tile. Wall quads are CELL_SIZE × CELL_SIZE. */
export const CELL_SIZE = cameraSpec.cellSize;
/** Tiles behind cell centre along the facing direction (EOB-style floor strip). */
export const CAMERA_BACK_OFFSET_TILES = cameraSpec.backOffsetTiles;
/** ~0.47 of wall height (walls are CELL_SIZE). */
export const CAMERA_EYE_HEIGHT = cameraSpec.eyeHeight;
/** Slight look-down only — floor strip comes mostly from back-offset + FOV. */
export const CAMERA_PITCH = (cameraSpec.pitchDeg * Math.PI) / 180;
export const CAMERA_FOV = cameraSpec.fov;
export const CAMERA_NEAR = cameraSpec.near;
export const CAMERA_FAR = cameraSpec.far;
/** Logical 3D view size in pixels [width, height]. */
export const CAMERA_VIEW = cameraSpec.view as [number, number];
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

/** Near-black — distant stone must be able to reach this, not a brown lift. */
export const FOG_COLOR = 0x010101;
/** Start well past a torch pool so distance does not dim torch light. */
export const FOG_NEAR = 10.0;
/** Slow fade only; CAMERA_FAR is 32. */
export const FOG_FAR = 28.0;

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
/** Front bracket / flame sit this far off the wall (artist spec). */
export const SCONCE_FRONT_OFFSET_TILES = 0.14;
/** Calm flame sprites (flame_calm_1..4). */
export const SCONCE_ANIM_FPS = 5;
export const FLARE_ANIM_FPS = 12;
export const TORCH_SNUFF_FPS = 10;
/** Ignore retaps while the ignite flare plays. */
export const TORCH_IGNITE_FLARE_MS = (1000 / FLARE_ANIM_FPS) * 6;
/** Extra lock after a flare or snuff finishes so a double tap cannot reverse it. */
export const TORCH_TAP_GUARD_MS = 1000;
/** Flame-frame multipliers used only when e2e pins flicker for measurement. */
export const SCONCE_FLICKER = [0.78, 0.58, 1.08] as const;
/** Live warmth: ±3% sine over 3.5 s. Sunbeams and water glints stay static. */
export const LIGHT_FLICKER_AMPLITUDE = 0.03;
export const LIGHT_FLICKER_PERIOD_MS = 3500;
/** Master footstep gain; variants add a little pitch / volume jitter. */
export const STEP_VOLUME = 0.4;
/** Lit torch pool — warm, smooth falloff. */
export const SCONCE_RADIUS_TILES = 2.5;
export const TORCH_INTENSITY = 1.45;
/** Wren's lantern with oil — full on the party square, near-ambient by 1.5. */
export const LANTERN_RADIUS_TILES = 1.5;
export const LANTERN_INTENSITY = 0.64;
/** Ember-only lantern — dies just past the next square's near edge. */
export const EMBER_RADIUS_TILES = 1.1;
export const EMBER_INTENSITY = 0.4;
/** Own-square floor stays full; falloff starts near the tile edge. */
export const LANTERN_CORE_TILES = 0.28;
/** Held-lantern height (world Y) so ceilings use 3D falloff. */
export const LANTERN_HEIGHT = 0.88;
/** Cold sunbeam from a ceiling crack. */
export const SUNBEAM_RADIUS_TILES = 2.0;
export const SUNBEAM_INTENSITY = 0.38;
/**
 * Per-floor ambient as a fraction of full white (never 0).
 * Floors 1–2: faint fill so unlit stone beyond the lantern is barely readable.
 * Floors 3+: near-black (~2%) beyond torch and lantern light.
 * Override the lookup with ?ambientFloor=N (floor 1 is the only playable map).
 */
export const FLOOR_AMBIENT: readonly number[] = [0, 0.068, 0.055, 0.018, 0.017, 0.016, 0.016, 0.016, 0.016];
export const AMBIENT_MIN = 0.014;
/** Torch/lantern weight below this counts as unlit for eye/item glints. */
export const DARK_LIGHT_THRESHOLD = 0.08;
export const EYE_ANIM_FPS = 8;
export const GLINT_ANIM_FPS = 12;
export const GLINT_REST_MIN_MS = 1500;
export const GLINT_REST_MAX_MS = 3000;
/** 3 dB duck on halls ambience in true dark. */
export const DARK_AMB_DUCK_DB = 3;

/** Clamp a floor index for FLOOR_AMBIENT. Missing / invalid values keep `fallback`. */
export function parseAmbientFloor(raw: string | null | undefined, fallback = 1): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(FLOOR_AMBIENT.length - 1, Math.floor(n)));
}
export const BRIGHT_MIN = 0.6;
export const BRIGHT_MAX = 1.6;
export const OIL_START = 2;
export const OIL_MAX = 4;
export const OIL_FLASK = 1;
export const OIL_TORCH_COST = 1;
/** Held wall-torch pool: small, follows the party square. */
export const CARRIED_TORCH_RADIUS_TILES = 1.35;
export const CARRIED_TORCH_INTENSITY = 1.05;
export const HAND_COOLDOWN_MS = 900;
/** After "hands full", the next hand tap swaps the torch in. Disarms on its own. */
export const SWAP_ARM_MS = 3000;
/** Flip to false to mute party hurt/down voices in one line. */
export const HERO_VOICES = true;
export const HERO_HURT_VOICE_GAP = 0.6;
/** 585-layout sizes live in art/ui/layout585/layout585.json (view, oilBar, hands, log). */
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

export const DIR_DELTA = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

export function cellInFront(x: number, y: number, dir: number): { x: number; y: number } {
  const [dx, dy] = DIR_DELTA[dir & 3];
  return { x: x + dx, y: y + dy };
}

export function wallPropRoom(
  wallX: number,
  wallY: number,
  face: Sconce['face']
): { x: number; y: number } {
  const { nx, nz } = FACE_INTO_ROOM[face];
  return { x: wallX + Math.round(nx), y: wallY + Math.round(nz) };
}

/**
 * Hide wall props in the party's own square that are not on the facing wall
 * (back wall + left/right). The facing-wall torch stays visible.
 */
export function hideWallProp(
  wallX: number,
  wallY: number,
  face: Sconce['face'],
  partyX: number,
  partyY: number,
  dir: number
): boolean {
  const room = wallPropRoom(wallX, wallY, face);
  if (room.x !== partyX || room.y !== partyY) return false;
  const front = cellInFront(partyX, partyY, dir);
  return wallX !== front.x || wallY !== front.y;
}

export function cameraOffsetXZ(rotY: number): [number, number] {
  const back = CAMERA_BACK_OFFSET_TILES * CELL_SIZE;
  return [Math.sin(rotY) * back, Math.cos(rotY) * back];
}

/** Faces where unflipped right-leaning art would point into the wall, not the corridor. */
export function sconceNeedsMirror(face: Sconce['face']): boolean {
  if (!MIRROR_BAKED_SCONCE_LEAN) return false;
  return face === 'W' || face === 'N';
}
