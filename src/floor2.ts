import type { FloorData } from './party';

// Floor 2: Lower Halls (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ############
//   #....#.<...#
//   #.#L.#.....#
//   #.#..#.##d##
//   #.####.#...#
//   #......#.~.#
//   ###d####~~~#
//   #......#.~.#
//   #.####G###S#
//   #.#..#===#.#
//   #....#===V>#
//   ############
// Notes:
//   (3,9) Orrun journal page 2: 'My people keep breathing. Mostly.'
export const floor2: FloorData = {
  id: 2,
  sconces: [{ x: 5, y: 1, face: 'W', lit: true }, { x: 0, y: 5, face: 'E', lit: false }, { x: 7, y: 7, face: 'W', lit: false }, { x: 11, y: 5, face: 'W', lit: false }],
  width: 12,
  height: 12,
  startX: 7,
  startY: 1,
  startDir: 2,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { monster: 'cellar_spider', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 20, monsterMaxHp: 20 }, { wall: true }, {  }, { stairs: 'up', daylight: true, bark: 'stairs_dead_lamp' }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true, lever: { face: 'E', opens: { x: 10, y: 8 } } }, {  }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { chest: true }, { item: 'potion_red' }, { wall: true }, { dialogue: 'f2_singing' }, { wall: true }, { wall: true }, { door: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, {  }, {  }, { wall: true }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { shallowWater: true }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { door: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, {  }, { dialogue: 'f2_glass_door' }, { wall: true }, {  }, { shallowWater: true }, { item: 'potion_blue' }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true, glassWater: true }, { wall: true }, { wall: true }, { wall: true }, { secret: true, openedBy: 'lever' }, { wall: true } ],
    [ { wall: true }, { monster: 'cellar_spider', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 20, monsterMaxHp: 20 }, { wall: true }, { item: 'scroll', journalPage: 2 }, {  }, { wall: true }, { deepWater: true }, { deepWater: true }, { deepWater: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, { wall: true }, { deepWater: true }, { deepWater: true }, { deepWater: true }, { wall: true, vent: { face: 'E' }, bark: 'first_vent' }, { stairs: 'down', daylight: true, bark: 'singing_louder' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor2Meta = { name: 'Lower Halls', area: 'halls', ambience: 'amb_upper_halls' };
export const floor2Sconces = [{ x: 5, y: 1, face: 'W', lit: true }, { x: 0, y: 5, face: 'E', lit: false }, { x: 7, y: 7, face: 'W', lit: false }, { x: 11, y: 5, face: 'W', lit: false }];
export const floor2Drips = [{ x: 9, y: 5 }, { x: 9, y: 6 }, { x: 8, y: 6 }, { x: 10, y: 6 }, { x: 9, y: 7 }, { x: 7, y: 9 }];
export const floor2Dark = [];
