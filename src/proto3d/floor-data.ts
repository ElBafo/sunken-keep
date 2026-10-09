import { FloorData, Sconce } from './types';

// Floor 1 data (copied from levels/floor1.ts)
const m = (monster: string, hp: number) => ({ 
  monster, 
  monsterState: 'idle' as const, 
  monsterAnimTime: 0, 
  monsterHp: hp, 
  monsterMaxHp: hp 
});

export const floor1: FloorData = {
  width: 9,
  height: 9,
  startX: 1,
  startY: 7,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, { stairs: 'down' }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { ...m('bog_leeches', 10), shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime', 22), { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, m('rust_crab', 18), { item: 'potion_red' }, {}, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, m('keep_rat', 12), { wall: true } ],
    [ { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true }, {}, { item: 'oil' }, {}, { wall: true } ],
    [ { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

/**
 * Proto3d only — do not copy this into shared floor1. Until combat is ported,
 * the locked door at (4,2) must have a free square in front at (3,2).
 * Move the leeches onto (3,3) in the water hall (same shallow-water floor height).
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

export const floor1Sconces: Sconce[] = [
  { x: 0, y: 6, face: 'E', lit: true, capped: false },
  { x: 4, y: 1, face: 'W', lit: true, capped: false },
  { x: 6, y: 4, face: 'S', lit: true, capped: false },
  { x: 4, y: 6, face: 'W', lit: false, capped: false },
  { x: 8, y: 1, face: 'W', lit: false, capped: false },
  { x: 0, y: 3, face: 'E', lit: false, capped: true },
  { x: 8, y: 6, face: 'W', lit: false, capped: true }
];
