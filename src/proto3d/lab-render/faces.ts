import { CELL_SIZE, WALL_BOTTOM, WALL_TOP } from '../constants';
import type { LabFaceId } from './occupancy';

/**
 * Map voxel-corner (u, v, d) to game world metres (cellSize 2, walls from
 * WALL_BOTTOM so water beds do not show a black gap). Same winding as the
 * voxel-lab mesher: u along texture X, v up the wall, d extruded into the solid.
 */
export function makeGameToWorld(
  face: LabFaceId,
  tileX: number,
  tileZ: number,
  dims: [number, number, number],
  layerSize: number,
  cell = CELL_SIZE,
  y0 = WALL_BOTTOM,
  y1 = WALL_TOP
): (u: number, v: number, d: number) => [number, number, number] {
  const [W, H] = dims;
  const sx = cell / W;
  const wallH = y1 - y0;
  const sy = wallH / H;
  const ox = tileX * cell;
  const oz = tileZ * cell;

  switch (face) {
    case 'N':
      return (u, v, d) => [ox + u * sx, y0 + v * sy, oz + d * layerSize];
    case 'S':
      return (u, v, d) => [ox + cell - u * sx, y0 + v * sy, oz + cell - d * layerSize];
    case 'W':
      return (u, v, d) => [ox + d * layerSize, y0 + v * sy, oz + cell - u * sx];
    case 'E':
      return (u, v, d) => [ox + cell - d * layerSize, y0 + v * sy, oz + u * sx];
    case 'floor':
      return (u, v, d) => [ox + u * sx, d * layerSize, oz + cell - v * sy];
    case 'ceiling':
      return (u, v, d) => [ox + u * sx, cell - d * layerSize, oz + v * sy];
  }
}

export function flatPlanePose(
  face: LabFaceId,
  tileX: number,
  tileZ: number,
  cell = CELL_SIZE,
  y0 = WALL_BOTTOM,
  y1 = WALL_TOP
): { x: number; y: number; z: number; rotX: number; rotY: number } {
  const ox = (tileX + 0.5) * cell;
  const oz = (tileZ + 0.5) * cell;
  const midY = (y0 + y1) / 2;
  switch (face) {
    case 'N':
      return { x: ox, y: midY, z: tileZ * cell, rotX: 0, rotY: 0 };
    case 'S':
      return { x: ox, y: midY, z: tileZ * cell + cell, rotX: 0, rotY: Math.PI };
    case 'W':
      return { x: tileX * cell, y: midY, z: oz, rotX: 0, rotY: Math.PI / 2 };
    case 'E':
      return { x: tileX * cell + cell, y: midY, z: oz, rotX: 0, rotY: -Math.PI / 2 };
    case 'floor':
      return { x: ox, y: 0, z: oz, rotX: -Math.PI / 2, rotY: 0 };
    case 'ceiling':
      return { x: ox, y: cell, z: oz, rotX: Math.PI / 2, rotY: 0 };
  }
}

export function flatPlaneSize(face: LabFaceId, cell = CELL_SIZE, y0 = WALL_BOTTOM, y1 = WALL_TOP): {
  w: number;
  h: number;
} {
  if (face === 'floor' || face === 'ceiling') return { w: cell, h: cell };
  return { w: cell, h: y1 - y0 };
}

/**
 * DoorSystem planes live in holder local space (XY, +Z into the room).
 * Extrude height along −Z so relief goes into the wall, not the corridor.
 */
export function makeDoorToWorld(
  dims: [number, number, number],
  layerSize: number,
  cell = CELL_SIZE
): (u: number, v: number, d: number) => [number, number, number] {
  const [W, H] = dims;
  const sx = cell / W;
  const sy = cell / H;
  return (u, v, d) => [u * sx - cell / 2, v * sy - cell / 2, -d * layerSize];
}
