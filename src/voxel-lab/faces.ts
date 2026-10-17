import { CELL, ROOM } from './constants';

export type FaceId = 'N' | 'S' | 'E' | 'W' | 'floor' | 'ceiling';
export type TileOrigin = 'corner' | 'center';

/** South-west corner of a tile. Game cells are centred on (x, z) * cell. */
export function tileCorner(
  tileX: number,
  tileZ: number,
  cell: number,
  origin: TileOrigin = 'corner'
): { ox: number; oz: number } {
  if (origin === 'center') {
    return { ox: (tileX - 0.5) * cell, oz: (tileZ - 0.5) * cell };
  }
  return { ox: tileX * cell, oz: tileZ * cell };
}

/**
 * Map voxel-corner (u, v, d) to world metres.
 * u along the texture X, v up the wall (or along floor Z), d extruded into the room.
 * Mappings are rotations (even number of axis flips) so greedy winding stays CCW.
 */
export function makeToWorld(
  face: FaceId,
  tileX: number,
  tileZ: number,
  dims: [number, number, number],
  layerSize: number,
  cell: number = CELL,
  origin: TileOrigin = 'corner'
): (u: number, v: number, d: number) => [number, number, number] {
  const [W, H] = dims;
  const sx = cell / W;
  const sy = cell / H;
  const { ox, oz } = tileCorner(tileX, tileZ, cell, origin);

  switch (face) {
    case 'N':
      return (u, v, d) => [ox + u * sx, v * sy, oz + d * layerSize];
    case 'S':
      return (u, v, d) => [ox + cell - u * sx, v * sy, oz + cell - d * layerSize];
    case 'W':
      return (u, v, d) => [ox + d * layerSize, v * sy, oz + cell - u * sx];
    case 'E':
      return (u, v, d) => [ox + cell - d * layerSize, v * sy, oz + u * sx];
    case 'floor':
      return (u, v, d) => [ox + u * sx, d * layerSize, oz + cell - v * sy];
    case 'ceiling':
      return (u, v, d) => [ox + u * sx, cell - d * layerSize, oz + v * sy];
  }
}

export function flatPlanePose(face: FaceId, tileX: number, tileZ: number): {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
} {
  const ox = (tileX + 0.5) * CELL;
  const oz = (tileZ + 0.5) * CELL;
  switch (face) {
    case 'N':
      return { x: ox, y: CELL / 2, z: 0, rotX: 0, rotY: 0 };
    case 'S':
      return { x: ox, y: CELL / 2, z: ROOM, rotX: 0, rotY: Math.PI };
    case 'W':
      return { x: 0, y: CELL / 2, z: oz, rotX: 0, rotY: Math.PI / 2 };
    case 'E':
      return { x: ROOM, y: CELL / 2, z: oz, rotX: 0, rotY: -Math.PI / 2 };
    case 'floor':
      return { x: ox, y: 0, z: oz, rotX: -Math.PI / 2, rotY: 0 };
    case 'ceiling':
      return { x: ox, y: CELL, z: oz, rotX: Math.PI / 2, rotY: 0 };
  }
}

/**
 * Per-tile flat pose for a dungeon (not the lab's single-room perimeter).
 * Front faces into the walkable cell, same winding as makeToWorld.
 */
export function tileFlatPose(
  face: FaceId,
  tileX: number,
  tileZ: number,
  cell: number,
  origin: TileOrigin = 'center'
): { x: number; y: number; z: number; rotX: number; rotY: number } {
  const { ox, oz } = tileCorner(tileX, tileZ, cell, origin);
  const cx = ox + cell / 2;
  const cz = oz + cell / 2;
  switch (face) {
    case 'N':
      return { x: cx, y: cell / 2, z: oz, rotX: 0, rotY: 0 };
    case 'S':
      return { x: cx, y: cell / 2, z: oz + cell, rotX: 0, rotY: Math.PI };
    case 'W':
      return { x: ox, y: cell / 2, z: cz, rotX: 0, rotY: Math.PI / 2 };
    case 'E':
      return { x: ox + cell, y: cell / 2, z: cz, rotX: 0, rotY: -Math.PI / 2 };
    case 'floor':
      return { x: cx, y: 0, z: cz, rotX: -Math.PI / 2, rotY: 0 };
    case 'ceiling':
      return { x: cx, y: cell, z: cz, rotX: Math.PI / 2, rotY: 0 };
  }
}
