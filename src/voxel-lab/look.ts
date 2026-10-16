import {
  LAMP_COLOR,
  LANTERN_COLOR,
  TORCH_COLOR
} from './constants';

export type Rgb = [number, number, number];

export function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export const NEUTRAL_RGB: Rgb = [1, 1, 1];

/**
 * proto3d vertex-lighting colours — duplicated on purpose (do not import proto3d).
 * Torch [1, 0.86, 0.58], lantern [0.92, 0.82, 0.64], ambient [0.82, 0.86, 0.9].
 */
export const GAME_TORCH_RGB: Rgb = [1.0, 0.86, 0.58];
export const GAME_LANTERN_RGB: Rgb = [0.92, 0.82, 0.64];
export const GAME_AMBIENT_RGB: Rgb = [0.82, 0.86, 0.9];
export const GAME_FOG = 0x010101;
export const LAB_FOG = 0x050403;

export interface LookColors {
  torch: Rgb;
  lantern: Rgb;
  lamp: Rgb;
  ambientSky: Rgb;
  ambientGround: Rgb;
  ambientFill: Rgb;
  fog: number;
}

/** warmth 0 = white lights; 1 = lab-warm or game-warm depending on matchGame. */
export function lookColors(warmth: number, matchGame: boolean): LookColors {
  const w = Math.min(1, Math.max(0, warmth));
  if (matchGame) {
    const sky = lerpRgb(NEUTRAL_RGB, GAME_AMBIENT_RGB, w);
    return {
      torch: lerpRgb(NEUTRAL_RGB, GAME_TORCH_RGB, w),
      lantern: lerpRgb(NEUTRAL_RGB, GAME_LANTERN_RGB, w),
      lamp: lerpRgb(NEUTRAL_RGB, GAME_LANTERN_RGB, w),
      ambientSky: sky,
      ambientGround: lerpRgb([0.35, 0.35, 0.35], [0.55, 0.58, 0.62], w),
      ambientFill: sky,
      fog: GAME_FOG
    };
  }
  return {
    torch: lerpRgb(NEUTRAL_RGB, hexToRgb(TORCH_COLOR), w),
    lantern: lerpRgb(NEUTRAL_RGB, hexToRgb(LANTERN_COLOR), w),
    lamp: lerpRgb(NEUTRAL_RGB, hexToRgb(LAMP_COLOR), w),
    ambientSky: lerpRgb(NEUTRAL_RGB, hexToRgb(0x2a241c), w),
    ambientGround: lerpRgb([0.2, 0.2, 0.2], hexToRgb(0x080605), w),
    ambientFill: lerpRgb(NEUTRAL_RGB, hexToRgb(0x1c1814), w),
    fog: LAB_FOG
  };
}
