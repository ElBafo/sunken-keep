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
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, {}, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { ...m('bog_leeches', 10), shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime', 22), { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, m('rust_crab', 18), { item: 'potion_red' }, {}, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, m('keep_rat', 12), { wall: true } ],
    [ { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true }, {}, {}, {}, { wall: true } ],
    [ { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor1Sconces: readonly Sconce[] = [
  { x: 0, y: 6, face: 'E', lit: true },
  { x: 4, y: 1, face: 'W', lit: true },
  { x: 0, y: 3, face: 'E', lit: false },
  { x: 4, y: 6, face: 'W', lit: false },
  { x: 8, y: 6, face: 'W', lit: false },
  { x: 8, y: 1, face: 'W', lit: false },
];
