// Simplified types for the prototype
export interface Tile {
  wall?: boolean;
  door?: boolean;
  doorLocked?: boolean;
  doorOpen?: boolean;
  deepWater?: boolean;
  shallowWater?: boolean;
  monster?: string;
  monsterHp?: number;
  item?: string;
  secret?: boolean;
  secretOpen?: boolean;
  [key: string]: any;
}

export interface FloorData {
  width: number;
  height: number;
  startX: number;
  startY: number;
  startDir: number;
  tiles: Tile[][];
}

export interface Sconce {
  x: number;
  y: number;
  face: 'N' | 'E' | 'S' | 'W';
  lit: boolean;
}

export interface SpriteData {
  x: number;
  y: number;
  type: 'monster' | 'item' | 'sconce';
  name: string;
  frames?: string[];
}
