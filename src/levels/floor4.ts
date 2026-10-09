import { FloorData } from './party';

// Floor 4: Barracks Deep (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ################
//   #.....#.######.#
//   #.###.#.######.#
//   #.#.#.#.#KKKK#.#
//   #.#.d...D....#.#
//   #.#.#.#.#....d.#
//   #.###.#.#KKKK#.#
//   #.....#.######.#
//   ##.#####~~~~~~~#
//   #...#>######~~~#
//   #.#.#.###==#~~~#
//   #.#<#.###=.|~~~#
//   #.#.#.######~~~#
//   #...#..~~~~~~~~#
//   ################
// Notes:
//   (3,11) stairs up from floor 3
//   (5,9) stairs are flooded-shut until the escape starts
//   (10,11) Tam chained chin-deep; bars at (11,11)
//   (11,5) only fights if f4_captain ends in a fight; otherwise sets captain_spared and steps aside
//   (12,11) talk facing W through the bars; f4_tide_wakes ends with start_escape
//   (13,5) door to the cell wing stays shut until the captain is talked down or beaten
export const floor4: FloorData = {
  width: 16,
  height: 15,
  startX: 3,
  startY: 11,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, {  }, {  }, {  }, {  }, { wall: true }, { item: 'key' }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { prop: 'statue' }, { prop: 'statue' }, { prop: 'statue' }, { prop: 'statue' }, { wall: true }, { item: 'potion_blue' }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { item: 'potion_red' }, { door: true }, {  }, {  }, {  }, { door: true, doorLocked: true }, { dialogue: 'f4_captain' }, {  }, {  }, {  }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, {  }, { npc: 'captain', monster: 'captain_dural', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 60, monsterMaxHp: 60 }, {  }, { door: true, gateOpensOn: 'f4_captain_done' }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { prop: 'statue' }, { prop: 'statue' }, { prop: 'statue' }, { prop: 'statue' }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 5, y: 1 }, { x: 5, y: 7 }] }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { stairsDown: true, actEnd: 1, gateOpensOn: 'start_escape' }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { deepWater: true }, { deepWater: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { stairsUp: true, bark: 'deep_enter' }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { deepWater: true }, { npc: 'tam' }, { wall: true, bars: { face: 'E' } }, { shallowWater: true, dialogue: 'f4_tam_cell', then: 'f4_tide_wakes' }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, {  }, {  }, { shallowWater: true }, { shallowWater: true, checkpoint: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true, checkpoint: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor4Meta = { name: 'Barracks Deep', area: 'barracks_deep', ambience: 'amb_barracks_deep' };
export const floor4Sconces = [{ x: 6, y: 3, face: 'E', lit: true }, { x: 15, y: 4, face: 'W', lit: false }, { x: 0, y: 9, face: 'E', lit: false }];
export const floor4Drips = [{ x: 12, y: 9 }, { x: 13, y: 10 }, { x: 14, y: 12 }, { x: 9, y: 13 }, { x: 10, y: 10 }];
export const floor4Dark = [{ x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }, { x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 }, { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }, { x: 12, y: 9 }, { x: 13, y: 9 }, { x: 14, y: 9 }, { x: 5, y: 10 }, { x: 6, y: 10 }, { x: 7, y: 10 }, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 }, { x: 5, y: 11 }, { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 11 }, { x: 14, y: 11 }, { x: 5, y: 12 }, { x: 6, y: 12 }, { x: 7, y: 12 }, { x: 8, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 12, y: 12 }, { x: 13, y: 12 }, { x: 14, y: 12 }, { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 7, y: 13 }, { x: 8, y: 13 }, { x: 9, y: 13 }, { x: 10, y: 13 }, { x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 }];
export const floor4Escape = { start: { x: 12, y: 11 }, waterStepsPerMove: 0.5, path: [{ x: 12, y: 12 }, { x: 12, y: 13 }, { x: 11, y: 13 }, { x: 10, y: 13 }, { x: 9, y: 13 }, { x: 8, y: 13 }, { x: 7, y: 13 }, { x: 6, y: 13 }, { x: 5, y: 13 }, { x: 5, y: 12 }, { x: 5, y: 11 }, { x: 5, y: 10 }, { x: 5, y: 9 }], manualSaveOff: true, waterHeightBySquaresBehind: { 4: 'ankle', 3: 'knee', 2: 'waist', 1: 'over_head' } };
