import type { FloorData, TileState } from './types';
import { combatController } from './combat-controller';
import type { GameState } from './types';

const SIGHT_RANGE = 4;
const CARDINALS: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function inBounds(floor: FloorData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < floor.width && y < floor.height;
}

function tileBlocksMovement(tile: TileState | undefined): boolean {
  if (!tile) return true;
  if (tile.wall) return true;
  if (tile.secret && !tile.secretOpen) return true;
  if (tile.door && tile.doorLocked && !tile.doorOpen) return true;
  return false;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function hasLineOfSight(floor: FloorData, x0: number, y0: number, x1: number, y1: number): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (x !== x1 || y !== y1) {
    if (!(x === x0 && y === y0)) {
      if (!inBounds(floor, x, y) || tileBlocksMovement(floor.tiles[y][x])) {
        return false;
      }
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return true;
}

function canSeeParty(floor: FloorData, mx: number, my: number, px: number, py: number): boolean {
  if (chebyshev(mx, my, px, py) > SIGHT_RANGE) return false;
  return hasLineOfSight(floor, mx, my, px, py);
}

function isOrthogonallyAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return manhattan(ax, ay, bx, by) === 1;
}

function moveMonsterFields(from: TileState, to: TileState): void {
  to.monster = from.monster;
  to.monsterHp = from.monsterHp;
  to.monsterMaxHp = from.monsterMaxHp;
  to.monsterState = from.monsterState;
  to.monsterAnimTime = from.monsterAnimTime;
  from.monster = undefined;
  from.monsterHp = undefined;
  from.monsterMaxHp = undefined;
  from.monsterState = undefined;
  from.monsterAnimTime = undefined;
}

interface MonsterPos {
  x: number;
  y: number;
}

function listMonsters(floor: FloorData): MonsterPos[] {
  const found: MonsterPos[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.tiles[y][x];
      if (tile.monster && (tile.monsterHp === undefined || tile.monsterHp > 0)) {
        found.push({ x, y });
      }
    }
  }
  return found;
}

function occupyBlocked(floor: FloorData, x: number, y: number, px: number, py: number): boolean {
  if (!inBounds(floor, x, y)) return true;
  if (x === px && y === py) return true;
  const tile = floor.tiles[y][x];
  if (tileBlocksMovement(tile)) return true;
  if (tile.monster) return true;
  return false;
}

function stepToward(
  floor: FloorData,
  mx: number,
  my: number,
  px: number,
  py: number
): { x: number; y: number } | null {
  const current = manhattan(mx, my, px, py);
  let best: { x: number; y: number } | null = null;
  let bestDist = current;

  for (const [dx, dy] of CARDINALS) {
    const nx = mx + dx;
    const ny = my + dy;
    if (nx === px && ny === py) continue;
    if (occupyBlocked(floor, nx, ny, px, py)) continue;
    const dist = manhattan(nx, ny, px, py);
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

// After each party turn: monsters that can see the party within ~4 squares
// step toward it, then attack once they share an edge.
export function processMonsterTurn(state: GameState): void {
  if (combatController.isInCombat()) return;

  const floor = state.floors.get(state.party.floor);
  if (!floor) return;

  const px = state.party.x;
  const py = state.party.y;

  for (const pos of listMonsters(floor)) {
    if (combatController.isInCombat()) return;

    const tile = floor.tiles[pos.y][pos.x];
    if (!tile.monster) continue;

    if (isOrthogonallyAdjacent(pos.x, pos.y, px, py)) {
      combatController.startCombat(state, tile.monster, pos.x, pos.y);
      return;
    }

    if (!canSeeParty(floor, pos.x, pos.y, px, py)) continue;

    const next = stepToward(floor, pos.x, pos.y, px, py);
    if (!next) continue;

    const dest = floor.tiles[next.y][next.x];
    tile.monsterState = 'alert';
    moveMonsterFields(tile, dest);

    if (isOrthogonallyAdjacent(next.x, next.y, px, py)) {
      combatController.startCombat(state, dest.monster!, next.x, next.y);
      return;
    }
  }
}
