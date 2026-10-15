import { CELL, ROOM } from './constants';

export type FaceId = 'N' | 'S' | 'E' | 'W' | 'floor' | 'ceiling';

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
  layerSize: number
): (u: number, v: number, d: number) => [number, number, number] {
  const [W, H] = dims;
  const sx = CELL / W;
  const sy = CELL / H;
  const ox = tileX * CELL;
  const oz = tileZ * CELL;

  switch (face) {
    case 'N':
      return (u, v, d) => [ox + u * sx, v * sy, oz + d * layerSize];
    case 'S':
      return (u, v, d) => [ox + CELL - u * sx, v * sy, oz + CELL - d * layerSize];
    case 'W':
      return (u, v, d) => [ox + d * layerSize, v * sy, oz + CELL - u * sx];
    case 'E':
      return (u, v, d) => [ox + CELL - d * layerSize, v * sy, oz + u * sx];
    case 'floor':
      return (u, v, d) => [ox + u * sx, d * layerSize, oz + CELL - v * sy];
    case 'ceiling':
      return (u, v, d) => [ox + u * sx, CELL - d * layerSize, oz + v * sy];
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
