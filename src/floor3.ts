import type { FloorData } from './party';

// Floor 3: Barracks (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ##############
//   #.....#......#
//   #.TTT.#.b.b..#
//   #.....d......#
//   #.TTT.#.b.b..#
//   #.....###d####
//   #######.....V#
//   #r..#...###..#
//   #r..D...#g#..#
//   #...#.....#..#
//   #####.###.<..#
//   #..>d.#.~~~.##
//   #...#...b.b..#
//   ##############
// Notes:

export const floor3: FloorData = {
  id: 3,
  sconces: [{ x: 6, y: 1, face: 'W', lit: false }, { x: 6, y: 4, face: 'E', lit: false }, { x: 4, y: 9, face: 'W', lit: false }, { x: 13, y: 9, face: 'W', lit: false }],
  width: 14,
  height: 14,
  startX: 10,
  startY: 10,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, {  }, {  }, {  }, {  }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { chest: true }, { wall: true } ],
    [ { wall: true }, {  }, { prop: 'table' }, { prop: 'table' }, { prop: 'table' }, {  }, { wall: true }, {  }, { prop: 'bunk' }, {  }, { prop: 'bunk' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { item: 'key' }, {  }, {  }, { door: true }, {  }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { prop: 'table' }, { prop: 'table' }, { prop: 'table' }, {  }, { wall: true }, {  }, { prop: 'bunk' }, {  }, { prop: 'bunk' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, { item: 'potion_red' }, { wall: true }, { wall: true }, { wall: true }, { door: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 7, y: 6 }, { x: 11, y: 6 }] }, {  }, {  }, { wall: true, vent: { face: 'W' } }, { wall: true } ],
    [ { wall: true }, { prop: 'weapon_rack' }, { item: 'potion_blue' }, {  }, { wall: true }, {  }, {  }, {  }, { wall: true }, { wall: true }, { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, {  }, { wall: true } ],
    [ { wall: true }, { prop: 'weapon_rack' }, { item: 'iron_shield' }, {  }, { door: true, doorLocked: true }, {  }, {  }, {  }, { wall: true }, { wall: true, grate: { face: 'S' } }, { wall: true }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { item: 'chain_mail' }, { wall: true }, {  }, {  }, {  }, {  }, { dialogue: 'f3_grate_tam' }, { wall: true }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { stairs: 'up', bark: 'barracks_enter' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { stairs: 'down', bark: 'tam_below' }, { door: true }, {  }, { wall: true }, {  }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { shallowWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, {  }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 5, y: 9 }, { x: 5, y: 12 }] }, {  }, {  }, { prop: 'bunk' }, {  }, { prop: 'bunk' }, {  }, { item: 'potion_green' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor3Meta = { name: 'Barracks', area: 'barracks', ambience: 'amb_barracks' };
export const floor3Sconces = [{ x: 6, y: 1, face: 'W', lit: false }, { x: 6, y: 4, face: 'E', lit: false }, { x: 4, y: 9, face: 'W', lit: false }, { x: 13, y: 9, face: 'W', lit: false }];
export const floor3Drips = [{ x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }];
export const floor3Dark = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 11 }, { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }, { x: 5, y: 12 }, { x: 6, y: 12 }, { x: 7, y: 12 }, { x: 8, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 12, y: 12 }];
