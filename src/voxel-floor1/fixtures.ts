import dressingAct1 from '../../public/levels/dressing_act1.json';
import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import {
  BRACKET_FLAME_LIFT,
  BRACKET_FLAME_OUT,
  BRACKET_LIGHT_FORWARD,
  BRACKET_LIGHT_UP,
  CELL,
  SCONCE_HEIGHT_TILES,
  SCONCE_WIDTH_TILES,
  WALL_MOUNT_INSET
} from './constants';
import { canCross, isWalkableTile, tileAt, type FloorMap } from './layout';

export type WallFace = 'N' | 'E' | 'S' | 'W';

export type SconceSpec = {
  x: number;
  y: number;
  face: WallFace;
  lit: boolean;
  capped?: boolean;
  empty?: boolean;
};

export type SunbeamSpec = {
  x: number;
  y: number;
  wx: number;
  wy: number;
  wz: number;
};

export type FallenBeamSpec = {
  x: number;
  y: number;
  mirror: boolean;
};

/** Same as proto3d FACE_INTO_ROOM — duplicated so this page does not import proto3d. */
export const FACE_INTO_ROOM: Record<WallFace, { nx: number; nz: number; rotY: number }> = {
  N: { nx: 0, nz: -1, rotY: Math.PI },
  E: { nx: 1, nz: 0, rotY: Math.PI / 2 },
  S: { nx: 0, nz: 1, rotY: 0 },
  W: { nx: -1, nz: 0, rotY: -Math.PI / 2 }
};

export const floor1Sconces: SconceSpec[] = (rawFloor1.sconces ?? []) as SconceSpec[];

const dressingFloor1 = dressingAct1.floor1 as { sunbeam?: Array<{ x: number; y: number }> };

/** Voxel page: drop the west-hall double crack; sit the guard-hall beam on the debris. */
const VOXEL_SKIP_BEAMS = new Set(['2,6']);
const VOXEL_MOVE_BEAMS: Record<string, { x: number; y: number }> = {
  '11,2': { x: 10, y: 1 }
};

export const floor1Sunbeams: SunbeamSpec[] = (dressingFloor1.sunbeam ?? []).flatMap((item) => {
  const key = `${item.x},${item.y}`;
  if (VOXEL_SKIP_BEAMS.has(key)) return [];
  const at = VOXEL_MOVE_BEAMS[key] ?? item;
  return [
    {
      x: at.x,
      y: at.y,
      wx: at.x * CELL,
      wy: CELL - 0.008,
      wz: at.y * CELL
    }
  ];
});

/** Map piles plus the crack square so debris reads as having come through the hole. */
export const floor1FallenBeams: FallenBeamSpec[] = (() => {
  const out: FallenBeamSpec[] = [];
  const seen = new Set<string>();
  for (let y = 0; y < rawFloor1.height; y++) {
    for (let x = 0; x < rawFloor1.width; x++) {
      const tile = rawFloor1.tiles[y][x] as { prop?: string; mirror?: boolean };
      if (tile.prop !== 'beams_fallen') continue;
      seen.add(`${x},${y}`);
      out.push({ x, y, mirror: !!tile.mirror });
    }
  }
  if (!seen.has('10,1')) out.push({ x: 10, y: 1, mirror: false });
  return out;
})();

export function sconceRoom(s: SconceSpec): { x: number; y: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  return { x: s.x + Math.round(nx), y: s.y + Math.round(nz) };
}

export function sconceIsLit(s: SconceSpec): boolean {
  return !!s.lit && !s.capped && !s.empty;
}

/** Classic sealed sconces — iron cap, no flame, no light. Dead unlit brackets are not capped. */
export function sconceIsCapped(s: SconceSpec): boolean {
  return !!s.capped;
}

/** Same line as public/log.json `torch_capped`. */
export const TORCH_CAPPED_PROMPT = "Sealed. It'll take forge-fire to open.";

export function sconceKey(s: Pick<SconceSpec, 'x' | 'y' | 'face'>): string {
  return `${s.x},${s.y},${s.face}`;
}

/** Party stands in the sconce's room square, facing the wall cell. Same as proto3d. */
export function facingSconce(
  sconces: SconceSpec[],
  playerX: number,
  playerY: number,
  dir: number
): SconceSpec | undefined {
  const deltas = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ] as const;
  const [dx, dy] = deltas[dir & 3];
  const fx = playerX + dx;
  const fy = playerY + dy;
  return sconces.find((s) => {
    const room = sconceRoom(s);
    return room.x === playerX && room.y === playerY && s.x === fx && s.y === fy;
  });
}

export function beamKey(b: Pick<SunbeamSpec, 'x' | 'y'>): string {
  return `beam:${b.x},${b.y}`;
}

/** Torch point/spot origin — in the flame, in front of the iron cup. */
export function torchWorldPos(s: SconceSpec): { x: number; y: number; z: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL / 2 + BRACKET_FLAME_OUT + BRACKET_LIGHT_FORWARD;
  return {
    x: s.x * CELL + nx * dist,
    y: CELL / 2 + BRACKET_FLAME_LIFT + BRACKET_LIGHT_UP,
    z: s.y * CELL + nz * dist
  };
}

export function torchBracketPoses(s: SconceSpec): {
  side: { x: number; y: number; z: number };
  front: { x: number; y: number; z: number };
  flame: { x: number; y: number; z: number };
} {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const wallX = s.x * CELL + nx * (CELL / 2);
  const wallZ = s.y * CELL + nz * (CELL / 2);
  const w = SCONCE_WIDTH_TILES * CELL;
  const h = SCONCE_HEIGHT_TILES * CELL;
  const inset = WALL_MOUNT_INSET;
  const flameH = 0.3125 * CELL;
  const midY = CELL / 2;
  const x = wallX + nx * inset;
  const z = wallZ + nz * inset;
  return {
    side: { x: wallX + nx * (w / 2), y: midY, z: wallZ + nz * (w / 2) },
    front: { x, y: midY, z },
    flame: { x, y: midY + h / 2 - flameH / 2, z }
  };
}

const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

/** Closed doors / secrets block flood the same way they block stepping. */
export function floodReach(map: FloorMap, originX: number, originY: number, radius: number): Set<string> {
  const reach = new Set<string>();
  if (!isWalkableTile(tileAt(map, originX, originY))) return reach;
  const queue: Array<[number, number]> = [[originX, originY]];
  reach.add(`${originX},${originY}`);
  let q = 0;
  while (q < queue.length) {
    const [x, y] = queue[q++];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (reach.has(key)) continue;
      if (!isWalkableTile(tileAt(map, nx, ny))) continue;
      if (!canCross(map, x, y, nx, ny)) continue;
      if (Math.hypot(nx - originX, ny - originY) > radius) continue;
      reach.add(key);
      queue.push([nx, ny]);
    }
  }
  return reach;
}

export function hideWallProp(
  wallX: number,
  wallY: number,
  face: WallFace,
  partyX: number,
  partyY: number,
  dir: number
): boolean {
  const room = sconceRoom({ x: wallX, y: wallY, face, lit: false });
  if (room.x !== partyX || room.y !== partyY) return false;
  const deltas = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ] as const;
  const [dx, dy] = deltas[dir & 3];
  return wallX !== partyX + dx || wallY !== partyY + dy;
}

