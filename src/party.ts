export type Direction = 0 | 1 | 2 | 3; // N, E, S, W

export interface Position {
  x: number;
  y: number;
}

export interface Tile {
  wall?: boolean;
  door?: boolean;
  doorLocked?: boolean;
  doorOpen?: boolean;
  secret?: boolean;
  secretOpen?: boolean;
  deepWater?: boolean;
  item?: string;
  monster?: string;
  carving?: string;
}

export interface FloorData {
  width: number;
  height: number;
  tiles: Tile[][];
  startX: number;
  startY: number;
  startDir: Direction;
}

export class Party {
  x: number;
  y: number;
  dir: Direction;

  constructor(x: number, y: number, dir: Direction) {
    this.x = x;
    this.y = y;
    this.dir = dir;
  }

  getForward(): Position {
    const dx = [0, 1, 0, -1][this.dir];
    const dy = [-1, 0, 1, 0][this.dir];
    return { x: this.x + dx, y: this.y + dy };
  }

  getPosition(distance: number, side: number): Position {
    // distance: 1-3 (near to far)
    // side: -1 (left), 0 (front), 1 (right)
    const fwd = [0, 1, 0, -1][this.dir];
    const right = [1, 0, -1, 0][this.dir];
    
    const dx = [right, fwd, -right, -fwd];
    const dy = [fwd, -right, -fwd, right];

    let x = this.x;
    let y = this.y;

    for (let d = 0; d < distance; d++) {
      x += dx[1];
      y += dy[1];
    }

    if (side !== 0) {
      x += dx[side < 0 ? 0 : 2];
      y += dy[side < 0 ? 0 : 2];
    }

    return { x, y };
  }

  turnLeft() {
    this.dir = ((this.dir + 3) % 4) as Direction;
  }

  turnRight() {
    this.dir = ((this.dir + 1) % 4) as Direction;
  }

  moveForward(floor: FloorData): boolean {
    const pos = this.getForward();
    if (this.canMoveTo(pos, floor)) {
      this.x = pos.x;
      this.y = pos.y;
      return true;
    }
    return false;
  }

  moveBackward(floor: FloorData): boolean {
    const backDir = ((this.dir + 2) % 4) as Direction;
    const dx = [0, 1, 0, -1][backDir];
    const dy = [-1, 0, 1, 0][backDir];
    const pos = { x: this.x + dx, y: this.y + dy };
    
    if (this.canMoveTo(pos, floor)) {
      this.x = pos.x;
      this.y = pos.y;
      return true;
    }
    return false;
  }

  strafeLeft(floor: FloorData): boolean {
    const leftDir = ((this.dir + 3) % 4) as Direction;
    const dx = [0, 1, 0, -1][leftDir];
    const dy = [-1, 0, 1, 0][leftDir];
    const pos = { x: this.x + dx, y: this.y + dy };
    
    if (this.canMoveTo(pos, floor)) {
      this.x = pos.x;
      this.y = pos.y;
      return true;
    }
    return false;
  }

  strafeRight(floor: FloorData): boolean {
    const rightDir = ((this.dir + 1) % 4) as Direction;
    const dx = [0, 1, 0, -1][rightDir];
    const dy = [-1, 0, 1, 0][rightDir];
    const pos = { x: this.x + dx, y: this.y + dy };
    
    if (this.canMoveTo(pos, floor)) {
      this.x = pos.x;
      this.y = pos.y;
      return true;
    }
    return false;
  }

  private canMoveTo(pos: Position, floor: FloorData): boolean {
    if (pos.x < 0 || pos.x >= floor.width || pos.y < 0 || pos.y >= floor.height) {
      return false;
    }

    const tile = floor.tiles[pos.y][pos.x];
    
    if (tile.wall) return false;
    if (tile.secret && !tile.secretOpen) return false;
    if (tile.door && tile.doorLocked && !tile.doorOpen) return false;
    
    return true;
  }
}
