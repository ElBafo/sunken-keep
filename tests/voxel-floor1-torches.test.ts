import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseGridCamera } from '../src/voxel-floor1/camera';
import {
  BRACKET_DIMS,
  BRACKET_VOX,
  BRACKET_WALL_GAP,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_VIEW_ASPECT,
  CELL,
  CUTOUT_ALPHA_TEST,
  WALL_MOUNT_NEAR_CULL,
  WALL_TEXELS
} from '../src/voxel-floor1/constants';
import { FACE_INTO_ROOM, floor1Sconces, hideWallProp, sconceRoom, torchWorldPos } from '../src/voxel-floor1/fixtures';
import { buildBracketOccupancy, cupWorldPos, MAT_GOLD, MAT_WOOD, meshBracket } from '../src/voxel-floor1/bracket';
import { cameraSpaceDepth, nearPlaneCulled, objectNearPlaneCulled } from '../src/voxel-floor1/near-cull';

const lit = floor1Sconces.find((s) => s.x === 0 && s.y === 6)!;

function makeCam(x: number, y: number, dir: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW_ASPECT, CAMERA_NEAR, CAMERA_FAR);
  const rotY = (-(dir & 3) * Math.PI) / 2;
  poseGridCamera(cam, x, y, rotY);
  return cam;
}

describe('voxel-floor1 sconce near-cull', () => {
  it('matches wall texel size and sits flush', () => {
    expect(BRACKET_VOX).toBeCloseTo(CELL / WALL_TEXELS, 8);
    expect(BRACKET_VOX).toBeCloseTo(CELL / 128, 8);
    expect(BRACKET_WALL_GAP).toBe(0);
    expect(CUTOUT_ALPHA_TEST).toBe(0.5);
    expect(WALL_MOUNT_NEAR_CULL).toBeGreaterThan(CAMERA_NEAR);
  });

  it('uses a tall narrow mid-grey plate, tapered tilted wood, and a gold cup', () => {
    const { volume, dims, voxelCount } = buildBracketOccupancy(false);
    expect(voxelCount).toBeGreaterThan(30);
    const [W, H, D] = dims;
    expect(D).toBe(BRACKET_DIMS[2]);
    let plateUMin = W;
    let plateUMax = 0;
    let plateVMin = H;
    let plateVMax = 0;
    let plateDMax = 0;
    let offWallWide = 0;
    for (let d = 0; d < D; d++) {
      for (let v = 0; v < H; v++) {
        for (let u = 0; u < W; u++) {
          if (!volume[u + v * W + d * W * H]) continue;
          if (d <= 2) {
            if (u < plateUMin) plateUMin = u;
            if (u > plateUMax) plateUMax = u;
            if (v < plateVMin) plateVMin = v;
            if (v > plateVMax) plateVMax = v;
            if (d > plateDMax) plateDMax = d;
          }
          if (d > 0 && (u < 2 || u > 13)) offWallWide += 1;
        }
      }
    }
    const plateW = (plateUMax - plateUMin + 1) * BRACKET_VOX;
    const plateH = (plateVMax - plateVMin + 1) * BRACKET_VOX;
    const plateT = (plateDMax + 1) * BRACKET_VOX;
    expect(plateW).toBeGreaterThan(0.12);
    expect(plateW).toBeLessThan(0.2);
    expect(plateH).toBeGreaterThan(0.45);
    expect(plateH).toBeLessThan(0.65);
    expect(plateT).toBeGreaterThan(0.02);
    expect(plateT).toBeLessThan(0.06);
    expect(offWallWide).toBe(0);
    expect(volume.includes(MAT_WOOD)).toBe(true);
    expect(volume.includes(MAT_GOLD)).toBe(true);
    let woodMinV = H;
    let woodMaxV = 0;
    let woodBotD = 0;
    let woodTopD = 0;
    let woodBotSpan = 0;
    let woodTopSpan = 0;
    for (let d = 0; d < D; d++) {
      for (let v = 0; v < H; v++) {
        for (let u = 0; u < W; u++) {
          if (volume[u + v * W + d * W * H] !== MAT_WOOD) continue;
          if (v < woodMinV) {
            woodMinV = v;
            woodBotD = d;
            woodBotSpan = 1;
          } else if (v === woodMinV) {
            woodBotSpan += 1;
            if (d > woodBotD) woodBotD = d;
          }
          if (v > woodMaxV) {
            woodMaxV = v;
            woodTopD = d;
            woodTopSpan = 1;
          } else if (v === woodMaxV) {
            woodTopSpan += 1;
            if (d > woodTopD) woodTopD = d;
          }
        }
      }
    }
    const handleH = (woodMaxV - woodMinV + 1) * BRACKET_VOX;
    expect(handleH).toBeGreaterThan(0.38);
    expect(handleH).toBeLessThan(0.5);
    expect(woodTopD).toBeGreaterThan(woodBotD);
    expect(woodTopSpan).toBeGreaterThan(woodBotSpan);
    let goldMinV = H;
    let goldMaxV = 0;
    let woodUMin = W;
    let woodUMax = 0;
    for (let d = 0; d < D; d++) {
      for (let v = 0; v < H; v++) {
        for (let u = 0; u < W; u++) {
          const id = volume[u + v * W + d * W * H];
          if (id === MAT_GOLD) {
            if (v < goldMinV) goldMinV = v;
            if (v > goldMaxV) goldMaxV = v;
          }
          if (id === MAT_WOOD) {
            if (u < woodUMin) woodUMin = u;
            if (u > woodUMax) woodUMax = u;
          }
        }
      }
    }
    const goldH = (goldMaxV - goldMinV + 1) * BRACKET_VOX;
    const handleW = (woodUMax - woodUMin + 1) * BRACKET_VOX;
    expect(goldH).toBeGreaterThan(0.03);
    expect(goldH).toBeLessThan(handleH * 0.22);
    expect(plateW).toBeGreaterThanOrEqual(handleW * 2 - BRACKET_VOX);
  });

  it('shows the torch at rest in its room looking along the wall', () => {
    const room = sconceRoom(lit);
    expect(room).toEqual({ x: 1, y: 6 });
    const along = makeCam(1, 6, 0);
    const pos = cupWorldPos(lit);
    const depth = cameraSpaceDepth(pos.x, pos.y, pos.z, along);
    expect(nearPlaneCulled(depth), `along-wall depth ${depth}`).toBe(false);
    const group = meshBracket(lit);
    expect(objectNearPlaneCulled(group, along)).toBe(false);
    expect(hideWallProp(lit.x, lit.y, lit.face, 1, 6, 0)).toBe(true);
    expect(depth).toBeGreaterThan(WALL_MOUNT_NEAR_CULL);
  });

  it('hides the torch when the camera is back-to it in its own square', () => {
    const away = makeCam(1, 6, 1);
    const pos = torchWorldPos(lit);
    const depth = cameraSpaceDepth(pos.x, pos.y, pos.z, away);
    expect(depth).toBeLessThan(WALL_MOUNT_NEAR_CULL);
    expect(nearPlaneCulled(depth)).toBe(true);
    const group = meshBracket(lit);
    expect(objectNearPlaneCulled(group, away)).toBe(true);
  });

  it('keeps the torch hidden at the first step-away pose (no flash)', () => {
    const start = makeCam(1, 6, 1);
    const dest = makeCam(2, 6, 1);
    const group = meshBracket(lit);
    expect(objectNearPlaneCulled(group, start)).toBe(true);
    expect(objectNearPlaneCulled(group, dest)).toBe(true);
  });

  it('still shows the torch when facing it from its room', () => {
    const face = makeCam(1, 6, 3);
    const pos = torchWorldPos(lit);
    expect(pos.x).toBeGreaterThan(0 * CELL + FACE_INTO_ROOM.E.nx * (CELL / 2) + 0.2);
    expect(nearPlaneCulled(cameraSpaceDepth(pos.x, pos.y, pos.z, face))).toBe(false);
    expect(objectNearPlaneCulled(meshBracket(lit), face)).toBe(false);
  });
});
