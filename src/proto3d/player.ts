import * as THREE from 'three';
import { FloorData } from './types';

const CELL_SIZE = 2;
const MOVE_DURATION = 180;

export class Player {
  x: number;
  y: number;
  dir: number; // 0=N, 1=E, 2=S, 3=W
  camera: THREE.Camera;
  floorData: FloorData;
  
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
    this.floorData = floorData;
    this.x = floorData.startX;
    this.y = floorData.startY;
    this.dir = floorData.startDir;
    this.updateCameraPosition(1);
  }
  
  update(_deltaTime: number) {
    if (this.isMoving) {
      const elapsed = performance.now() - this.moveStartTime;
      const t = Math.min(elapsed / MOVE_DURATION, 1);
      const eased = this.easeInOutQuad(t);
      
      // Interpolate position
      const interpX = this.moveFromX + (this.moveToX - this.moveFromX) * eased;
      const interpY = this.moveFromY + (this.moveToY - this.moveFromY) * eased;
      
      // Interpolate rotation
      let fromRot = -this.moveFromDir * Math.PI / 2;
      let toRot = -this.moveToDir * Math.PI / 2;
      
      // Handle wrap-around for shortest path
      if (Math.abs(toRot - fromRot) > Math.PI) {
        if (toRot > fromRot) fromRot += Math.PI * 2;
        else toRot += Math.PI * 2;
      }
      
      const interpRot = fromRot + (toRot - fromRot) * eased;
      
      const wx = interpX * CELL_SIZE;
      const wz = interpY * CELL_SIZE;
      
      // Camera at proper eye height: 0.55 of wall height (walls are 2.0 high)
      this.camera.position.set(wx, 1.1, wz);
      this.camera.rotation.y = interpRot;
      
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
  
  updateCameraPosition(_t: number = 1) {
    const wx = this.x * CELL_SIZE;
    const wz = this.y * CELL_SIZE;
    const rot = -this.dir * Math.PI / 2;
    
    // Camera at proper eye height
    this.camera.position.set(wx, 1.1, wz);
    this.camera.rotation.y = rot;
    this.camera.updateMatrixWorld();
  }

  // Instant teleport for tests / query-string start poses.
  setPosition(x: number, y: number, dir: number) {
    this.isMoving = false;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.updateCameraPosition(1);
  }
  
  canMove(dx: number, dy: number): boolean {
    const newX = this.x + dx;
    const newY = this.y + dy;
    
    if (newX < 0 || newX >= this.floorData.width) return false;
    if (newY < 0 || newY >= this.floorData.height) return false;
    
    const tile = this.floorData.tiles[newY][newX];
    // Prototype has no key-use interaction; locked doors are walk-through
    // so the vault (and slime at tiles[2][7] = x=7,y=2) is reachable.
    return !tile.wall && !tile.secret;
  }
  
  moveForward() {
    if (this.isMoving) return;
    
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = dirs[this.dir];
    
    if (this.canMove(dx, dy)) {
      this.startMove(this.x + dx, this.y + dy, this.dir);
    }
  }
  
  moveBackward() {
    if (this.isMoving) return;
    
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = dirs[this.dir];
    
    if (this.canMove(-dx, -dy)) {
      this.startMove(this.x - dx, this.y - dy, this.dir);
    }
  }
  
  turnLeft() {
    if (this.isMoving) return;
    const newDir = (this.dir + 3) % 4;
    this.startMove(this.x, this.y, newDir);
  }
  
  turnRight() {
    if (this.isMoving) return;
    const newDir = (this.dir + 1) % 4;
    this.startMove(this.x, this.y, newDir);
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
