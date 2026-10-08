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
      { wall: true }, {}, { deepWater: true }, {}, { wall: true }, { secret: true, carving: 'carving_secret' }, {}, {}, { wall: true }
    ],
    // Row 2
    [
      { wall: true }, {}, { deepWater: true }, {}, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, { monster: 'slime' }, { wall: true }
    ],
    // Row 3
    [
      { wall: true }, {}, { deepWater: true }, {}, { wall: true }, {}, {}, {}, { wall: true }
    ],
    // Row 4
    [
      { wall: true }, {}, {}, {}, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ],
    // Row 5
    [
      { wall: true }, {}, { item: 'key' }, {}, {}, {}, {}, {}, { wall: true }
    ],
    // Row 6
    [
      { wall: true }, {}, {}, {}, { wall: true }, {}, { carving: 'carving_start' }, {}, { wall: true }
    ],
    // Row 7 (start)
    [
      { wall: true }, {}, {}, {}, { wall: true }, {}, {}, {}, { wall: true }
    ],
    // Row 8
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ]
  ]
};
