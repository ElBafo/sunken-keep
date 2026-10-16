import { describe, expect, it } from 'vitest';
import { floor1 } from '../public/levels/floor1';
import {
  WALL_EYE_MARGIN,
  cameraWorldXZ,
  clearCameraFromWalls,
  emitWallPlanes,
  isNearWallClip,
  minWallClearance
} from '../src/proto3d/camera-wall-clear';
import { CAMERA_NEAR, CELL_SIZE, cameraOffsetXZ } from '../src/proto3d/constants';
import { isBlockingProp } from '../src/proto3d/wall-props';

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

function walkable(x: number, y: number): boolean {
  const tile = floor1.tiles[y]?.[x];
  if (!tile || tile.wall) return false;
  if (tile.secret && !tile.secretOpen) return false;
  if (tile.door && !tile.doorOpen) return false;
  if (isBlockingProp(tile)) return false;
  if (tile.monster) return false;
  return true;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function rot(dir: number): number {
  return (-dir * Math.PI) / 2;
}

function rawEye(gridX: number, gridY: number, dir: number): { x: number; z: number } {
  const [ox, oz] = cameraOffsetXZ(rot(dir));
  return { x: gridX * CELL_SIZE + ox, z: gridY * CELL_SIZE + oz };
}

function countNearFrames(
  fromX: number,
  fromY: number,
  fromDir: number,
  toX: number,
  toY: number,
  toDir: number,
  planes: ReturnType<typeof emitWallPlanes>,
  clamp: boolean
): number {
  let near = 0;
  for (let i = 0; i <= 180; i++) {
    const t = i / 180;
    const e = easeInOutQuad(t);
    const gx = fromX + (toX - fromX) * e;
    const gy = fromY + (toY - fromY) * e;
    let fromRot = rot(fromDir);
    let toRot = rot(toDir);
    if (Math.abs(toRot - fromRot) > Math.PI) {
      if (toRot > fromRot) fromRot += Math.PI * 2;
      else toRot += Math.PI * 2;
    }
    const r = fromRot + (toRot - fromRot) * e;
    const pos = clamp ? cameraWorldXZ(gx, gy, r, planes) : (() => {
      const [ox, oz] = cameraOffsetXZ(r);
      return { x: gx * CELL_SIZE + ox, z: gy * CELL_SIZE + oz };
    })();
    if (isNearWallClip(pos.x, pos.z, planes)) near++;
  }
  return near;
}

describe('camera wall clearance', () => {
  const planes = emitWallPlanes(floor1);

  it('raw EOB eye sits inside the (8,5) sconce wall when facing south in the alcove', () => {
    const raw = rawEye(8, 6, 2);
    expect(minWallClearance(raw.x, raw.z, planes), 'unclamped eye is on the wall plane').toBeLessThan(
      CAMERA_NEAR
    );
    const cleared = clearCameraFromWalls(raw.x, raw.z, planes);
    expect(minWallClearance(cleared.x, cleared.z, planes)).toBeGreaterThanOrEqual(WALL_EYE_MARGIN - 1e-6);
    expect(isNearWallClip(cleared.x, cleared.z, planes)).toBe(false);
  });

  it('turning onto south in the (8,6) alcove never clips the sconce wall', () => {
    // (8,7) is solid; the walkable square south of the (8,5) sconce is (8,6).
    expect(walkable(8, 6)).toBe(true);
    expect(walkable(8, 7)).toBe(false);
    expect(countNearFrames(8, 6, 1, 8, 6, 2, planes, true)).toBe(0);
    expect(countNearFrames(8, 6, 3, 8, 6, 2, planes, true)).toBe(0);
    expect(countNearFrames(8, 6, 1, 8, 6, 2, planes, false)).toBeGreaterThan(0);
  });

  it('keeps 0 near-wall frames on every back-step, including toward the (8,5) sconce', () => {
    let paths = 0;
    let near = 0;
    let rawNear = 0;
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        if (!walkable(x, y)) continue;
        for (let dir = 0; dir < 4; dir++) {
          const [dx, dy] = DIRS[dir];
          const tx = x - dx;
          const ty = y - dy;
          if (!walkable(tx, ty)) continue;
          paths++;
          near += countNearFrames(x, y, dir, tx, ty, dir, planes, true);
          rawNear += countNearFrames(x, y, dir, tx, ty, dir, planes, false);
        }
      }
    }
    expect(paths, 'sampled back-steps on floor 1').toBeGreaterThan(20);
    expect(near, '0 near-wall frames on clamped back-steps').toBe(0);
    expect(rawNear, 'unclamped EOB eye does clip a wall during some back-steps').toBeGreaterThan(0);
  });

  it('keeps 0 near-wall frames on strafes and turns that swing onto a back wall', () => {
    let near = 0;
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        if (!walkable(x, y)) continue;
        for (let dir = 0; dir < 4; dir++) {
          near += countNearFrames(x, y, dir, x, y, (dir + 1) % 4, planes, true);
          const [sx, sy] = DIRS[(dir + 1) % 4];
          if (walkable(x + sx, y + sy)) {
            near += countNearFrames(x, y, dir, x + sx, y + sy, dir, planes, true);
          }
        }
      }
    }
    expect(near, '0 near-wall frames on turns and strafes').toBe(0);
  });
});
