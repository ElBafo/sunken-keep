import * as THREE from 'three';
import {
  LANTERN_COLOR,
  LANTERN_DISTANCE,
  LANTERN_FLICKER,
  LANTERN_FLICKER_MS,
  LANTERN_HOLD,
  LANTERN_INTENSITY,
  LANTERN_SPOT_ANGLE,
  LANTERN_SPOT_INTENSITY
} from '../../voxel-lab/constants';
import { CELL_SIZE, EMBER_INTENSITY, LANTERN_RADIUS_TILES } from '../constants';

/** Lab hold offset, camera-local (+X right, +Y up, −Z forward). */
export const GAME_LANTERN_HOLD = LANTERN_HOLD;

/**
 * Keep the lab's warm lantern, but cap range to the game oil puddle so the
 * lair at (19,8) stays ambient when the party is three squares away.
 */
export const GAME_LANTERN_DISTANCE = Math.min(LANTERN_DISTANCE, LANTERN_RADIUS_TILES * CELL_SIZE * 1.12);

export const GAME_LANTERN_COLOR = LANTERN_COLOR;
export const GAME_LANTERN_INTENSITY = LANTERN_INTENSITY;
export const GAME_LANTERN_SPOT_INTENSITY = LANTERN_SPOT_INTENSITY;
export const GAME_LANTERN_SPOT_ANGLE = LANTERN_SPOT_ANGLE;
export const GAME_EMBER_SCALE = EMBER_INTENSITY / 0.64;

export function lanternFlicker(nowMs: number, base: number): number {
  const w = (nowMs % LANTERN_FLICKER_MS) / LANTERN_FLICKER_MS;
  return base * (1 + LANTERN_FLICKER * Math.sin(w * Math.PI * 2));
}

/** World-space lantern origin from a posed camera. Follows step/turn tweens. */
export function lanternWorldFromCamera(
  camera: THREE.Object3D,
  hold: readonly [number, number, number] = GAME_LANTERN_HOLD,
  target = new THREE.Vector3()
): THREE.Vector3 {
  camera.updateMatrixWorld(true);
  target.set(hold[0], hold[1], hold[2]);
  return camera.localToWorld(target);
}

export function attachLanternToCamera(
  camera: THREE.Object3D,
  light: THREE.Object3D,
  hold: readonly [number, number, number] = GAME_LANTERN_HOLD
): void {
  if (light.parent !== camera) camera.add(light);
  light.position.set(hold[0], hold[1], hold[2]);
}
