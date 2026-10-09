export type Direction = 0 | 1 | 2 | 3; // N, E, S, W

export interface Position {
  x: number;
  y: number;
}

export type MonsterState = 'idle' | 'alert' | 'attack' | 'hurt' | 'death';

export interface LatchState {
  turns: number;
  drainPerTurn: number;
}

export interface Tile {
  wall?: boolean;
  door?: boolean;
  doorLocked?: boolean;
  doorOpen?: boolean;
  secret?: boolean;
  secretOpen?: boolean;
  shallowWater?: boolean;
  deepWater?: boolean;
  item?: string;
  monster?: string;
  monsterState?: MonsterState;
  monsterAnimTime?: number;
  monsterHp?: number;
  monsterMaxHp?: number;
  monsterAlerted?: boolean;
  monsterArmor?: number;
  monsterLatch?: LatchState;
  carving?: string;
  chest?: boolean;
  chestOpen?: boolean;
  firstSightFired?: boolean; // Track if first sight bark has fired
  
  // Act 1 additions from floors 2-4
  stairs?: 'up' | 'down';
  dialogue?: string;
  then?: string;
  bark?: string;
  npc?: string;
  prop?: 'table' | 'bunk' | 'weapon_rack' | 'statue' | 'vent' | 'grate' | 'bars' | 'glassWater';
  glassWater?: boolean;
  lever?: { face: 'N'|'E'|'S'|'W'; opens: { x: number; y: number } };
  openedBy?: 'lever';
  grate?: { face: 'N'|'E'|'S'|'W' };
  vent?: { face: 'N'|'E'|'S'|'W' };
  bars?: { face: 'N'|'E'|'S'|'W' };
  gateOpensOn?: string;
  patrol?: { x: number; y: number }[];
  checkpoint?: boolean;
  daylight?: boolean;
  journalPage?: number;
  actEnd?: number;
}

export interface FloorData {
  id: number;
  width: number;
  height: number;
  tiles: Tile[][];
  startX: number;
  startY: number;
  startDir: Direction;
  sconces?: Sconce[];
}

export interface Sconce {
  x: number;  // Wall block x
  y: number;  // Wall block y
  face: 'N' | 'E' | 'S' | 'W';  // Which side of the wall block
  lit: boolean;
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
      // FIX: side < 0 (left) should use index 2 (-right), side > 0 (right) should use index 0 (right)
      x += dx[side < 0 ? 2 : 0];
      y += dy[side < 0 ? 2 : 0];
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
