import type { FloorData } from './types';

// Floor 4: Barracks Deep (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ################
//   #.....#.######.#
//   #.###.#.######.#
//   #.#.#.#.#KKKK#.#
//   #.#.d...D....#.#
//   #.#.#.#A#....d.#
//   #.###.###KKKK#.#
//   #.....########.#
//   ##.#####~~~~~~~#
//   #...#>######~~~#
//   #.#.#.###==#~~~#
//   #.#<#.###=.|~~~#
//   #.S.#.######~~~#
//   #...#..~~~~~~~~#
//   ################
// Notes:
//   (1,12) step off and back on for the second hammer
//   (2,12) hidden weapon rack, opens when the drill is done
//   (3,10) Shield. Hammer. Hammer. Oath. Right in front of the start
//   (3,11) stairs up from floor 3
//   (5,9) stairs are flooded-shut until the escape starts
//   (8,4) sealed riddle door, carving on the door
//   (10,11) Tam chained chin-deep; bars at (11,11)
//   (11,5) only fights if f4_captain ends in a fight; otherwise sets captain_spared and steps aside
//   (12,10) first view of the cell: Tam's tally on the far wall
//   (12,11) talk facing W through the bars; f4_tide_wakes ends with start_escape
//   (13,5) cell-wing door: opens with captain_key (Dural gives it in f4_captain.spare2 or drops it when beaten)
//   (13,9) last flask before Tam; lighting (4,13) before the escape helps the run
export const floor4: FloorData = {
  id: 4,
  sconces: [{ x: 0, y: 11, face: 'E', lit: true, capped: false }, { x: 10, y: 12, face: 'N', lit: true, capped: false }, { x: 6, y: 3, face: 'E', lit: true, capped: false }, { x: 2, y: 11, face: 'E', lit: true, capped: false }, { x: 8, y: 5, face: 'E', lit: true, capped: false }, { x: 15, y: 4, face: 'W', lit: false, capped: false }, { x: 15, y: 9, face: 'W', lit: false, capped: false }, { x: 4, y: 12, face: 'W', lit: false, capped: false }, { x: 6, y: 1, face: 'W', lit: false, capped: false }, { x: 4, y: 13, face: 'E', lit: false, capped: false }, { x: 0, y: 9, face: 'E', lit: false, capped: true }],
  width: 16,
  height: 15,
  startX: 3,
  startY: 11,
  startDir: 0,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, {  }, {  }, {  }, {  }, { wall: true }, { item: 'potion_green' }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, {  }, { wall: true }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { wall: true }, { item: 'potion_blue' }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { item: 'potion_red' }, { door: true }, {  }, {  }, {  }, { door: true, doorLocked: true, riddleDoor: { puzzle: 'f4_riddle' }, bark: 'riddle_first_sight' }, { dialogue: 'f4_captain' }, {  }, {  }, {  }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, { wall: true }, {  }, { wall: true }, { prop: 'altar', altar: { puzzle: 'f4_riddle', accepts: ['torch', 'lantern'] }, propPlacement: 'floor' }, { wall: true }, {  }, {  }, { npc: 'dural', monster: 'captain_dural', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 60, monsterMaxHp: 60 }, {  }, { door: true, gate: { opensWith: 'captain_key' }, bumpLog: 'blocked_cellgate', openLog: 'gate_unlocked' }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { prop: 'statue', propPlacement: 'floor' }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35, patrol: [{ x: 5, y: 1 }, { x: 5, y: 7 }] }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { monster: 'drowned_dwarf', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 35, monsterMaxHp: 35 }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { stairs: 'down', actEnd: 1, gateOpensOn: 'start_escape', bumpLog: 'blocked_stairs_f4' }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true, item: 'oil_flask' }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, { plate: { symbol: 'shield', puzzle: 'f4_drill' } }, { wall: true }, { carving: 'carving_drill' }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { deepWater: true }, { deepWater: true }, { wall: true }, { shallowWater: true, bark: 'tam_tally' }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { stairs: 'up', bark: 'deep_enter' }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { deepWater: true }, { npc: 'tam' }, { wall: true, bars: { face: 'E' } }, { shallowWater: true, dialogue: 'f4_tam_cell', then: 'f4_tide_wakes' }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, { plate: { symbol: 'hammer', puzzle: 'f4_drill', stepOffLog: 'floor4_drill_tiles.step_off_hammer' } }, { secret: true, openedBy: 'f4_drill', item: 'ashmantle_hammer' }, {  }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, { plate: { symbol: 'oath', puzzle: 'f4_drill' } }, {  }, { wall: true }, {  }, {  }, { shallowWater: true }, { shallowWater: true, checkpoint: true, barkIf: [{ flag: 'saved_tam', value: true, bark: 'escape_tam_saved_2' }] }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true, checkpoint: true, barkIf: [{ flag: 'saved_tam', value: true, bark: 'escape_tam_saved' }, { flag: 'saved_tam', value: false, bark: 'tam_left' }] }, { shallowWater: true }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor4Meta = { name: 'Barracks Deep', area: 'barracks_deep', ambience: 'amb_barracks_deep' };
export const floor4Sconces = [{ x: 0, y: 11, face: 'E', lit: true, capped: false }, { x: 10, y: 12, face: 'N', lit: true, capped: false }, { x: 6, y: 3, face: 'E', lit: true, capped: false }, { x: 2, y: 11, face: 'E', lit: true, capped: false }, { x: 8, y: 5, face: 'E', lit: true, capped: false }, { x: 15, y: 4, face: 'W', lit: false, capped: false }, { x: 15, y: 9, face: 'W', lit: false, capped: false }, { x: 4, y: 12, face: 'W', lit: false, capped: false }, { x: 6, y: 1, face: 'W', lit: false, capped: false }, { x: 4, y: 13, face: 'E', lit: false, capped: false }, { x: 0, y: 9, face: 'E', lit: false, capped: true }];
export const floor4Drips = [{ x: 12, y: 9 }, { x: 13, y: 10 }, { x: 14, y: 12 }, { x: 9, y: 13 }, { x: 10, y: 10 }];
export const floor4Dark = [{ x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }, { x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 }, { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }, { x: 12, y: 9 }, { x: 13, y: 9 }, { x: 14, y: 9 }, { x: 5, y: 10 }, { x: 6, y: 10 }, { x: 7, y: 10 }, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 }, { x: 5, y: 11 }, { x: 6, y: 11 }, { x: 7, y: 11 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 11 }, { x: 14, y: 11 }, { x: 5, y: 12 }, { x: 6, y: 12 }, { x: 7, y: 12 }, { x: 8, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 12, y: 12 }, { x: 13, y: 12 }, { x: 14, y: 12 }, { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 7, y: 13 }, { x: 8, y: 13 }, { x: 9, y: 13 }, { x: 10, y: 13 }, { x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 }];
export const floor4Puzzles = [{ id: 'f4_drill', type: 'step_sequence', text: 'floor4_drill_tiles', plates: { shield: { x: 1, y: 10 }, hammer: { x: 1, y: 12 }, oath: { x: 2, y: 13 } }, order: ['shield', 'hammer', 'hammer', 'oath'], opens: { x: 2, y: 12 }, optional: true }, { id: 'f4_riddle', type: 'altar_riddle', text: 'floor4_riddle_door', altar: { x: 7, y: 5 }, door: { x: 8, y: 4 }, accepts: ['torch', 'lantern'], torchFrom: { sconce: { x: 6, y: 3 } }, note: 'a lit torch from the sconce at (6,3), or Wren lifting her lantern, opens the captain hall' }];
export const floor4Escape = { start: { x: 12, y: 11 }, waterStepsPerMove: 0.5, path: [{ x: 12, y: 12 }, { x: 12, y: 13 }, { x: 11, y: 13 }, { x: 10, y: 13 }, { x: 9, y: 13 }, { x: 8, y: 13 }, { x: 7, y: 13 }, { x: 6, y: 13 }, { x: 5, y: 13 }, { x: 5, y: 12 }, { x: 5, y: 11 }, { x: 5, y: 10 }, { x: 5, y: 9 }], manualSaveOff: true, waterHeightBySquaresBehind: { 4: 'ankle', 3: 'knee', 2: 'waist', 1: 'over_head' } };
