import * as THREE from 'three';
import {
  CAMERA_EYE_HEIGHT,
  CAMERA_PITCH,
  CELL_SIZE,
  STEP_BOB_AMPLITUDE,
  cameraOffsetXZ
} from './constants';
import { FloorData, Tile } from './types';

const MOVE_DURATION = 180;

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

export type MoveResult = 'ok' | 'busy' | 'bounds' | 'wall' | 'secret' | 'door' | 'monster';

export class Player {
  x: number;
  y: number;
  dir: number; // 0=N, 1=E, 2=S, 3=W
  camera: THREE.Camera;
  floorData: FloorData;
  hasKey = false;
  /** Live combat occupancy; when set, this overrides the static tile.monster flag. */
  isOccupiedByMonster: ((x: number, y: number) => boolean) | null = null;

  isMoving = false;
  moveStartTime = 0;
  moveFromX = 0;
  moveFromY = 0;
  moveFromDir = 0;
  moveToX = 0;
  moveToY = 0;
  moveToDir = 0;

  constructor(camera: THREE.Camera, floorData: FloorData) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    this.floorData = floorData;
    this.x = floorData.startX;
    this.y = floorData.startY;
    this.dir = floorData.startDir;
    this.updateCameraPosition(1);
  }

  tileAt(x: number, y: number): Tile | undefined {
    if (x < 0 || y < 0 || x >= this.floorData.width || y >= this.floorData.height) {
      return undefined;
    }
    return this.floorData.tiles[y][x];
  }

  facingDelta(): readonly [number, number] {
    return DIRS[this.dir];
  }

  facingPos(steps = 1): { x: number; y: number } {
    const [dx, dy] = this.facingDelta();
    return { x: this.x + dx * steps, y: this.y + dy * steps };
  }

  update(_deltaTime: number) {
    if (this.isMoving) {
      const elapsed = performance.now() - this.moveStartTime;
      const t = Math.min(elapsed / MOVE_DURATION, 1);
      const eased = this.easeInOutQuad(t);

      const interpX = this.moveFromX + (this.moveToX - this.moveFromX) * eased;
      const interpY = this.moveFromY + (this.moveToY - this.moveFromY) * eased;

      let fromRot = (-this.moveFromDir * Math.PI) / 2;
      let toRot = (-this.moveToDir * Math.PI) / 2;

      if (Math.abs(toRot - fromRot) > Math.PI) {
        if (toRot > fromRot) fromRot += Math.PI * 2;
        else toRot += Math.PI * 2;
      }

      const interpRot = fromRot + (toRot - fromRot) * eased;
      const translating = this.moveToX !== this.moveFromX || this.moveToY !== this.moveFromY;
      const bob = translating ? Math.sin(t * Math.PI) * STEP_BOB_AMPLITUDE : 0;
      this.poseCamera(interpX, interpY, interpRot, bob);

      if (t >= 1) {
        this.isMoving = false;
        this.x = this.moveToX;
        this.y = this.moveToY;
        this.dir = this.moveToDir;
      }
    }
  }

  easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  poseCamera(gridX: number, gridY: number, rotY: number, bob = 0) {
    const [ox, oz] = cameraOffsetXZ(rotY);
    this.camera.position.set(
      gridX * CELL_SIZE + ox,
      CAMERA_EYE_HEIGHT + bob,
      gridY * CELL_SIZE + oz
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = CAMERA_PITCH;
    this.camera.rotation.y = rotY;
    this.camera.rotation.z = 0;
    this.camera.updateMatrixWorld();
  }

  updateCameraPosition(_t: number = 1) {
    const rot = (-this.dir * Math.PI) / 2;
    this.poseCamera(this.x, this.y, rot, 0);
  }

  setPosition(x: number, y: number, dir: number) {
    this.isMoving = false;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.updateCameraPosition(1);
  }

  blockReason(x: number, y: number): MoveResult {
    const tile = this.tileAt(x, y);
    if (!tile) return 'bounds';
    if (tile.wall) return 'wall';
    if (tile.secret && !tile.secretOpen) return 'secret';
    if (tile.door && !tile.doorOpen) return 'door';
    if (this.isOccupiedByMonster) {
      if (this.isOccupiedByMonster(x, y)) return 'monster';
    } else if (tile.monster) {
      return 'monster';
    }
    if (tile.prop === 'beams_fallen' || tile.prop === 'desk') return 'wall';
    return 'ok';
  }

  canMove(dx: number, dy: number): boolean {
    return this.blockReason(this.x + dx, this.y + dy) === 'ok';
  }

  moveForward(): MoveResult {
    if (this.isMoving) return 'busy';
    const [dx, dy] = DIRS[this.dir];
    const reason = this.blockReason(this.x + dx, this.y + dy);
    if (reason === 'ok') {
      this.startMove(this.x + dx, this.y + dy, this.dir);
      return 'ok';
    }
    return reason;
  }

  moveBackward(): MoveResult {
    if (this.isMoving) return 'busy';
    const [dx, dy] = DIRS[this.dir];
    const reason = this.blockReason(this.x - dx, this.y - dy);
    if (reason === 'ok') {
      this.startMove(this.x - dx, this.y - dy, this.dir);
      return 'ok';
    }
    return reason;
  }

  turnLeft(): MoveResult {
    if (this.isMoving) return 'busy';
    const newDir = (this.dir + 3) % 4;
    this.startMove(this.x, this.y, newDir);
    return 'ok';
  }

  turnRight(): MoveResult {
    if (this.isMoving) return 'busy';
    const newDir = (this.dir + 1) % 4;
    this.startMove(this.x, this.y, newDir);
    return 'ok';
  }

  startMove(toX: number, toY: number, toDir: number) {
    this.isMoving = true;
    this.moveStartTime = performance.now();
    this.moveFromX = this.x;
    this.moveFromY = this.y;
    this.moveFromDir = this.dir;
    this.moveToX = toX;
    this.moveToY = toY;
    this.moveToDir = toDir;
  }
}
