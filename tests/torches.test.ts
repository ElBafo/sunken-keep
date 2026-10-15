import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_VIEW,
  SCONCE_NEAR_CULL,
  WALL_MOUNT_NEAR_CULL,
  hideWallProp
} from '../src/proto3d/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { Player } from '../src/proto3d/player';
import {
  sconceCulledByCamera,
  torchBracketPoses,
  torchWorldPos
} from '../src/proto3d/torches';

function makePlayer(x: number, y: number, dir: number): Player {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW[0] / CAMERA_VIEW[1], CAMERA_NEAR, 32);
  const player = new Player(cam, floor1);
  player.setPosition(x, y, dir);
  return player;
}

describe('sconce near-plane bracket cull', () => {
  const unlit = floor1Sconces.find((s) => s.x === 4 && s.y === 6)!;
  const lit = floor1Sconces.find((s) => s.x === 0 && s.y === 6)!;

  it('keeps the unlit (4,6) W bracket (QA flash: backing from (2,6) facing west)', () => {
    expect(unlit.face).toBe('W');
    expect(unlit.lit).toBe(false);
    const poses = torchBracketPoses(unlit);
    expect(poses.side.x).toBeCloseTo(poses.front.x, 1);
  });

  it('culls the unlit bracket as the camera arrives on its wall (QA: (2,6,3) then back)', () => {
    const player = makePlayer(2, 6, 3);
    const rotY = (-3 * Math.PI) / 2;
    const frames: Array<{ t: number; culled: boolean; hideGrid: boolean }> = [];

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = 2 + (3 - 2) * eased;
      player.poseCamera(x, 6, rotY, 0);
      const hideGrid = hideWallProp(unlit.x, unlit.y, unlit.face, 2, 6, 3);
      const culled = hideGrid || sconceCulledByCamera(unlit, player.camera);
      frames.push({ t, culled, hideGrid });
    }

    const flash = frames.filter((f) => f.t >= 0.85);
    expect(flash.length).toBeGreaterThan(0);
    expect(
      flash.every((f) => f.culled),
      `late-step frames must hide the bracket (got ${JSON.stringify(flash)})`
    ).toBe(true);
    expect(
      frames.some((f) => f.culled && !f.hideGrid),
      'camera-depth cull must hide the bracket before own-square hideWallProp'
    ).toBe(true);
  });

  it('still shows the bracket when facing the sconce from its room', () => {
    const player = makePlayer(3, 6, 1);
    expect(hideWallProp(unlit.x, unlit.y, unlit.face, 3, 6, 1)).toBe(false);
    expect(sconceCulledByCamera(unlit, player.camera)).toBe(false);
    expect(torchWorldPos(unlit).x).toBeGreaterThan(3 * 2);
  });

  it('still shows the lit west-wall torch when facing it at (1,6)', () => {
    const player = makePlayer(1, 6, 3);
    expect(hideWallProp(lit.x, lit.y, lit.face, 1, 6, 3)).toBe(false);
    expect(sconceCulledByCamera(lit, player.camera)).toBe(false);
  });

  it('hides the own-square side/back torch (existing hideWallProp rule)', () => {
    expect(hideWallProp(lit.x, lit.y, lit.face, 1, 6, 1)).toBe(true);
    expect(hideWallProp(lit.x, lit.y, lit.face, 1, 6, 0)).toBe(true);
  });

  it(`uses a cull distance past CAMERA_NEAR (${CAMERA_NEAR}) so a 0.5-wide bracket cannot straddle the clip plane`, () => {
    expect(SCONCE_NEAR_CULL).toBeGreaterThan(CAMERA_NEAR);
    expect(SCONCE_NEAR_CULL).toBeGreaterThanOrEqual(0.5);
    expect(SCONCE_NEAR_CULL).toBe(WALL_MOUNT_NEAR_CULL);
  });
});
