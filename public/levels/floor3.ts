import type { FloorData } from './types';

// Floor 3: Barracks (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ##############
//   #.....#......#
//   #.TTT.#.b.b..#
//   #.....d......#
//   #.TTT.#.b.b..#
//   #.....###d####
//   #######.....V#
//   #r..#B..###..#
//   #r..W...#g#..#
//   #...#.....#..#
//   #####.###.<..#
//   #..>d.#.~~~.##
//   #...#...b.b..#
//   ##############
// Notes:
//   (1,4) mess hall barrels
//   (4,8) water doorway into the armoury, parts when the bowl is lit
//   (6,1) the lit sconce on the mess-hall wall here (x6,y1 facing W) can be taken as a torch
//   (12,1) barracks chest: an officer kept his own medicine
export const floor3: FloorData = {
  id: 3,
  sconces: [{ x: 6, y: 1, face: 'W', lit: true, capped: false }, { x: 13, y: 10, face: 'W', lit: true, capped: false }, { x: 4, y: 9, face: 'W', lit: false, capped: false }, { x: 6, y: 6, face: 'E', lit: false, capped: false }, { x: 0, y: 12, face: 'E', lit: false, capped: false }, { x: 13, y: 2, face: 'W', lit: false, capped: false }, { x: 6, y: 4, face: 'E', lit: false, capped: true }, { x: 13, y: 9, face: 'W', lit: false, capped: true }],
  width: 14,
  height: 14,
  startX: 10,
  startY: 10,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, {  }, {  }, {  }, {  }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { chest: true, chestItems: ['potion_red', 'potion_green'] }, { wall: true } ],
    [ { wall: true }, {  }, { prop: 'table', propPlacement: 'floor' }, { prop: 'table', propPlacement: 'floor' }, { prop: 'table', propPlacement: 'floor' }, {  }, { wall: true }, {  }, { prop: 'bunk', propPlacement: 'floor' }, {  }, { prop: 'bunk', propPlacement: 'floor' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, {  }, { door: true }, {  }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { item: 'oil_flask' }, { prop: 'table', propPlacement: 'floor' }, { prop: 'table', propPlacement: 'floor' }, { prop: 'table', propPlacement: 'floor' }, {  }, { wall: true }, {  }, { prop: 'bunk', propPlacement: 'floor' }, {  }, { prop: 'bunk', propPlacement: 'floor' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, { item: 'potion_red' }, { wall: true }, { wall: true }, { wall: true }, { door: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, {  }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 7, y: 6 }, { x: 11, y: 6 }] }, {  }, {  }, { wall: true, vent: { face: 'W' } }, { wall: true } ],
    [ { wall: true }, { prop: 'weapon_rack', propPlacement: 'wall', propWall: 'W' }, { item: 'potion_blue' }, {  }, { wall: true }, { prop: 'offering_bowl', bowl: { puzzle: 'f3_offering', lanternLog: 'floor3_offering.bowl_lantern' }, bark: 'bowl_first_sight', propPlacement: 'floor' }, {  }, {  }, { wall: true }, { wall: true }, { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, {  }, { wall: true } ],
    [ { wall: true }, { prop: 'weapon_rack', propPlacement: 'wall', propWall: 'W' }, { item: 'iron_shield' }, {  }, { wall: true, glassWater: true, opens: true, waterDoor: { opensOn: 'f3_bowl_lit' }, bumpLog: 'blocked_waterdoor' }, { carving: 'carving_bowl', lanternOnly: true }, {  }, {  }, { wall: true }, { wall: true, grate: { face: 'S' } }, { wall: true }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { item: 'oil_flask' }, {  }, { item: 'chain_mail' }, { wall: true }, {  }, {  }, {  }, {  }, { dialogue: 'f3_grate_tam' }, { wall: true }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { stairs: 'up', bark: 'barracks_enter' }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { stairs: 'down', bark: 'tam_below' }, { door: true }, {  }, { wall: true }, {  }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { shallowWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, {  }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 5, y: 9 }, { x: 5, y: 12 }] }, {  }, {  }, { prop: 'bunk', propPlacement: 'floor' }, {  }, { prop: 'bunk', propPlacement: 'floor' }, { item: 'oil_flask' }, { item: 'potion_green' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor3Meta = { name: 'Barracks', area: 'barracks', ambience: 'amb_barracks' };
export const floor3Sconces = [{ x: 6, y: 1, face: 'W', lit: true, capped: false }, { x: 13, y: 10, face: 'W', lit: true, capped: false }, { x: 4, y: 9, face: 'W', lit: false, capped: false }, { x: 6, y: 6, face: 'E', lit: false, capped: false }, { x: 0, y: 12, face: 'E', lit: false, capped: false }, { x: 13, y: 2, face: 'W', lit: false, capped: false }, { x: 6, y: 4, face: 'E', lit: false, capped: true }, { x: 13, y: 9, face: 'W', lit: false, capped: true }];
export const floor3Drips = [{ x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }];
export const floor3Dark = [{ x: 5, y: 11 }, { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }, { x: 5, y: 12 }, { x: 6, y: 12 }, { x: 7, y: 12 }, { x: 8, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 12, y: 12 }];
export const floor3Puzzles = [{ id: 'f3_offering', type: 'offering_bowl', text: 'floor3_offering', torchFrom: { sconce: { x: 6, y: 1 } }, bowl: { x: 5, y: 7 }, opens: { x: 4, y: 8 }, darkAfter: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }], note: 'taking the mess-hall torch to the bowl opens the armoury; the mess hall then turns dark (lantern only)' }];
