export type WallFace = 'N' | 'E' | 'S' | 'W';

export type KnotWallSpec = {
  x: number;
  y: number;
  face: WallFace;
  note: string;
};

/** Old secret-wall carving, reused as a placed stone decoration. */
export const KNOT_WALL_FILE = 'secret_closed.png';

/**
 * Solid-wall faces that show the knot panel. Cell is the wall square; face is
 * the side that looks into the room. Never on or beside a secret.
 */
export const floor1KnotWalls: readonly KnotWallSpec[] = [
  {
    x: 11,
    y: 0,
    face: 'S',
    note: 'guard-hall north end, across from the sunbeam'
  },
  {
    x: 12,
    y: 11,
    face: 'N',
    note: "back wall of Pell the lamp-keeper's room"
  }
];

const FACE_INTO: Record<WallFace, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0]
};

export function knotWallFile(x: number, y: number, face: string): string | undefined {
  for (const spec of floor1KnotWalls) {
    if (spec.x === x && spec.y === y && spec.face === face) return KNOT_WALL_FILE;
  }
  return undefined;
}

export function knotWallViewer(spec: KnotWallSpec): { x: number; y: number } {
  const [dx, dy] = FACE_INTO[spec.face];
  return { x: spec.x + dx, y: spec.y + dy };
}

export const KNOT_FACE_NEIGHBORS: ReadonlyArray<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];
