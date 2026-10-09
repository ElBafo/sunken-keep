import { FloorData } from './party';

// First floor of the Sunken Keep
export const floor1: FloorData = {
  width: 9,
  height: 9,
  startX: 1,
  startY: 7,
  startDir: 0,
  tiles: [
    // Row 0
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ],
    // Row 1
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret' }, {}, {}, { wall: true }
    ],
    // Row 2
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, { monster: 'tide_spawn', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 25, monsterMaxHp: 25 }, { wall: true }
    ],
    // Row 3
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, {}, { item: 'potion_red' }, {}, { wall: true }
    ],
    // Row 4
    [
      { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ],
    // Row 5
    [
      { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 20, monsterMaxHp: 20 }, { wall: true }
    ],
    // Row 6
    [
      { wall: true }, {}, {}, {}, { wall: true }, {}, { carving: 'carving_start' }, {}, { wall: true }
    ],
    // Row 7 (start)
    [
      { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true }
    ],
    // Row 8
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ]
  ]
};
