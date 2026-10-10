import type { FloorData } from './types';

// Floor 1: Upper Halls (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ###############
//   #~=~#S..#.....#
//   #~=~D.......F.#
//   #~=~#...#.F...#
//   #~~~#####...F>#
//   #.......#######
//   #...#.......###
//   #...#...###.###
//   #########.....#
//   #########...P.#
//   #########.....#
//   ###############
// Notes:
//   (7,2) slime now guards the arch into the guard hall
//   (8,6) hook clinks (sfx_lamp_hooks_loop) first heard here; dead torch above
//   (9,2) guard hall: first time in, Ilsevar/Mags sunlight lines
//   (10,1) extra rat, sleeps under the beams
//   (11,2) sunbeam through ceiling_crack + shaft_2
//   (11,8) Pell the lamp-keeper's room, optional dead end
//   (12,9) desk with Pell's note (tap the desk); capped lamp prop stands at (13,9)
//   (13,9) tap the capped lamp
export const floor1: FloorData = {
  id: 1,
  sconces: [{ x: 0, y: 6, face: 'E', lit: true, capped: false }, { x: 4, y: 1, face: 'W', lit: true, capped: false }, { x: 6, y: 4, face: 'S', lit: true, capped: false }, { x: 4, y: 6, face: 'W', lit: false, capped: false }, { x: 8, y: 1, face: 'W', lit: false, capped: false }, { x: 8, y: 5, face: 'S', lit: false, capped: false }, { x: 14, y: 3, face: 'W', lit: false, capped: false }, { x: 0, y: 3, face: 'E', lit: false, capped: true }, { x: 9, y: 0, face: 'S', lit: false, capped: true }],
  width: 15,
  height: 12,
  startX: 1,
  startY: 7,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {  }, {  }, { wall: true }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { door: true, doorLocked: true, carving: 'carving_door' }, {  }, {  }, { monster: 'slime', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 40, monsterMaxHp: 40 }, {  }, { bark: 'guard_hall_enter' }, {  }, { daylight: true }, { prop: 'beams_fallen' }, {  }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, { item: 'potion_red' }, {  }, { wall: true }, {  }, { prop: 'beams_fallen' }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, {  }, { prop: 'beams_fallen' }, { stairs: 'down' }, { wall: true } ],
    [ { wall: true }, {  }, { item: 'key' }, {  }, {  }, { item: 'potion_blue' }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { carving: 'carving_start' }, {  }, {  }, { wall: true }, {  }, { item: 'oil_flask' }, {  }, { bark: 'lampkeeper_hooks_heard' }, {  }, {  }, {  }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { chest: true, chestItems: ['potion_red'] }, {  }, { item: 'potion_green' }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, { bark: 'lampkeeper_enter' }, { item: 'oil_flask' }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, {  }, { prop: 'desk', readNote: 'note_lampkeeper', bark: 'lampkeeper_note_read' }, { prop: 'lamp_capped', bark: 'lampkeeper_capped_lamp' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor1Meta = { name: 'Upper Halls', area: 'halls', ambience: 'amb_upper_halls' };
export const floor1Sconces = [{ x: 0, y: 6, face: 'E', lit: true, capped: false }, { x: 4, y: 1, face: 'W', lit: true, capped: false }, { x: 6, y: 4, face: 'S', lit: true, capped: false }, { x: 4, y: 6, face: 'W', lit: false, capped: false }, { x: 8, y: 1, face: 'W', lit: false, capped: false }, { x: 8, y: 5, face: 'S', lit: false, capped: false }, { x: 14, y: 3, face: 'W', lit: false, capped: false }, { x: 0, y: 3, face: 'E', lit: false, capped: true }, { x: 9, y: 0, face: 'S', lit: false, capped: true }];
export const floor1Drips = [{ x: 2, y: 1 }, { x: 2, y: 3 }, { x: 1, y: 4 }];
export const floor1Dark = [{ x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }, { x: 13, y: 9 }, { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }];
export const floor1Puzzles = [];
