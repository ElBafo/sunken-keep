import type { Camera } from 'three';
import { BACK_OFFSET, CAMERA_PITCH, CELL, EYE_HEIGHT, MOVE_MS, TURN_MS } from './constants';
import { canCross, type FloorMap } from './layout';

export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

export function dirToRot(dir: number): number {
  return (-(dir & 3) * Math.PI) / 2;
}

export function facingCell(x: number, y: number, dir: number, sign: 1 | -1 = 1): { x: number; y: number } {
  const [dx, dy] = DIRS[dir & 3];
  return { x: x + dx * sign, y: y + dy * sign };
}

export function poseGridCamera(
  camera: Camera,
  gridX: number,
  gridY: number,
  rotY: number
): void {
  const ox = Math.sin(rotY) * BACK_OFFSET;
  const oz = Math.cos(rotY) * BACK_OFFSET;
  camera.position.set(gridX * CELL + ox, EYE_HEIGHT, gridY * CELL + oz);
  camera.rotation.order = 'YXZ';
  camera.rotation.x = CAMERA_PITCH;
  camera.rotation.y = rotY;
  camera.rotation.z = 0;
  camera.updateMatrixWorld();
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export type MoveKind = 'idle' | 'step' | 'turn';

export class GridMover {
  x: number;
  y: number;
  dir: number;
  moving = false;
  /** When true, snap/update leave the camera so setShotPose can hold. */
  hold = false;
  kind: MoveKind = 'idle';
  toX = 0;
  toY = 0;
  toDir = 0;
  private fromX = 0;
  private fromY = 0;
  private fromDir = 0;
  private t0 = 0;
  private duration = MOVE_MS;

  constructor(
    private camera: Camera,
    private map: FloorMap
  ) {
    this.x = map.startX;
    this.y = map.startY;
    this.dir = map.startDir;
    this.snap();
  }

  snap(): void {
    if (this.hold) return;
    poseGridCamera(this.camera, this.x, this.y, dirToRot(this.dir));
  }

  setPosition(x: number, y: number, dir: number): void {
    this.moving = false;
    this.kind = 'idle';
    this.x = x;
    this.y = y;
    this.dir = dir & 3;
    this.snap();
  }

  update(now: number): boolean {
    if (this.hold) return false;
    if (!this.moving) return false;
    const t = Math.min(1, (now - this.t0) / this.duration);
    const k = easeInOutQuad(t);
    const gx = this.fromX + (this.toX - this.fromX) * k;
    const gy = this.fromY + (this.toY - this.fromY) * k;
    let fromRot = dirToRot(this.fromDir);
    let toRot = dirToRot(this.toDir);
    if (Math.abs(toRot - fromRot) > Math.PI) {
      if (toRot > fromRot) fromRot += Math.PI * 2;
      else toRot += Math.PI * 2;
    }
    poseGridCamera(this.camera, gx, gy, fromRot + (toRot - fromRot) * k);
    if (t >= 1) {
      this.moving = false;
      this.kind = 'idle';
      this.x = this.toX;
      this.y = this.toY;
      this.dir = this.toDir;
      this.snap();
      return true;
    }
    return false;
  }

  step(dirSign: 1 | -1): boolean {
    if (this.moving) return false;
    const [dx, dy] = DIRS[this.dir];
    const nx = this.x + dx * dirSign;
    const ny = this.y + dy * dirSign;
    if (!canCross(this.map, this.x, this.y, nx, ny)) return false;
    this.start(nx, ny, this.dir, MOVE_MS, 'step');
    return true;
  }

  turn(dirSign: 1 | -1): boolean {
    if (this.moving) return false;
    const next = (this.dir + (dirSign === 1 ? 3 : 1)) & 3;
    this.start(this.x, this.y, next, TURN_MS, 'turn');
    return true;
  }

  /** +1 right, −1 left, facing unchanged. */
  strafe(dirSign: 1 | -1): boolean {
    if (this.moving) return false;
    const [dx, dy] = DIRS[(this.dir + (dirSign === 1 ? 1 : 3)) & 3];
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (!canCross(this.map, this.x, this.y, nx, ny)) return false;
    this.start(nx, ny, this.dir, MOVE_MS, 'step');
    return true;
  }

  private start(toX: number, toY: number, toDir: number, duration: number, kind: MoveKind): void {
    this.moving = true;
    this.kind = kind;
    this.fromX = this.x;
    this.fromY = this.y;
    this.fromDir = this.dir;
    this.toX = toX;
    this.toY = toY;
    this.toDir = toDir;
    this.duration = duration;
    this.t0 = performance.now();
  }
}
