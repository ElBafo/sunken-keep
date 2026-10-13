import {
  floor1 as rawFloor1,
  floor1CaveIn as rawCaveIn,
  floor1Sconces as rawSconces
} from '../../public/levels/floor1';
import { FloorData, Sconce } from './types';

export const floor1: FloorData = rawFloor1 as unknown as FloorData;
export const floor1Sconces: Sconce[] = rawSconces as Sconce[];
export const floor1CaveIn = rawCaveIn;

/**
 * Proto3d only — do not copy this into shared floor1.
 * The locked door at (4,2) must have a free square in front at (3,2);
 * move the leeches onto (3,3) in the water hall (same shallow-water floor height).
 */
function relocateLeechesOffDoor(floor: FloorData) {
  const front = floor.tiles[2][3];
  const dest = floor.tiles[3][3];
  if (front.monster !== 'bog_leeches' || dest.monster) return;
  dest.monster = front.monster;
  dest.monsterHp = front.monsterHp;
  dest.monsterMaxHp = front.monsterMaxHp;
  dest.monsterState = front.monsterState;
  dest.monsterAnimTime = front.monsterAnimTime;
  delete front.monster;
  delete front.monsterHp;
  delete front.monsterMaxHp;
  delete front.monsterState;
  delete front.monsterAnimTime;
}

relocateLeechesOffDoor(floor1);
