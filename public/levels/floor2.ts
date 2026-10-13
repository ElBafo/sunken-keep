import type { FloorData } from './types';

// Floor 2: Lower Halls (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ############
//   #....#.<...#
//   #.#L.#.....#
//   #.#..#.##d##
//   #.####.#...#
//   #......#.~.#
//   ###dLL##~~~#
//   #......#.~.#
//   #.####G###S#
//   #.#..#===#.#
//   #....#===V>#
//   ############
// Notes:
//   (1,5) Hobb calls from the stores before the levers can be faced
//   (2,5) Hobb calls from the stores before the levers can be faced
//   (3,3) storeroom chest
//   (3,5) Hobb calls from the stores before the levers can be faced
//   (3,9) Orrun journal page 2: 'My people keep breathing. Mostly.'
//   (3,10) talk facing E; freeing him sets frogcatcher_freed and he wades off to the stairs up
//   (4,5) Hobb calls from the stores before the levers can be faced
//   (4,6) RIGHT lever: cistern (rat room) drains, stores nook floods
//   (4,10) pinned under a fallen shelf in the stores nook; knows Tam
//   (5,5) Hobb calls from the stores before the levers can be faced
//   (5,6) LEFT lever: stores nook drains, cistern floods. Plate text LEFT: STORES. RIGHT: CISTERN.
//   (6,5) Hobb calls from the stores before the levers can be faced
//   (9,4) way into the cistern; bump while flooded
export const floor2: FloorData = {
  id: 2,
  sconces: [{ x: 5, y: 1, face: 'W', lit: true, capped: false }, { x: 8, y: 0, face: 'S', lit: true, capped: false }, { x: 2, y: 6, face: 'N', lit: true, capped: false }, { x: 6, y: 6, face: 'N', lit: true, capped: false }, { x: 5, y: 4, face: 'E', lit: false, capped: false }, { x: 11, y: 5, face: 'W', lit: false, capped: false }, { x: 0, y: 10, face: 'E', lit: false, capped: false }, { x: 11, y: 9, face: 'W', lit: false, capped: false }, { x: 0, y: 5, face: 'E', lit: false, capped: true }, { x: 7, y: 7, face: 'W', lit: false, capped: true }],
  width: 12,
  height: 12,
  startX: 7,
  startY: 1,
  startDir: 2,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { monster: 'cellar_spider', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 20, monsterMaxHp: 20 }, { wall: true }, {  }, { stairs: 'up', daylight: true, bark: 'stairs_dead_lamp' }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true, lever: { face: 'E', opens: { x: 10, y: 8 }, pullLog: 'lever_far_click' } }, { item: 'oil_flask' }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { chest: true, chestItems: ['potion_red', 'potion_blue'] }, { item: 'potion_red' }, { wall: true }, { dialogue: 'f2_singing' }, { wall: true }, { wall: true }, { door: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, {  }, { log: 'enter_cistern', bumpLog: 'blocked_cistern' }, {  }, { wall: true } ],
    [ { wall: true }, { bark: 'hobb_shout' }, { bark: 'hobb_shout' }, { bark: 'hobb_shout' }, { bark: 'hobb_shout' }, { bark: 'hobb_shout' }, { bark: 'hobb_shout' }, { wall: true }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { shallowWater: true }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { door: true }, { wall: true, lever: { face: 'N', puzzle: 'f2_vents', side: 'right' } }, { wall: true, lever: { face: 'N', puzzle: 'f2_vents', side: 'left' } }, { wall: true }, { wall: true }, { shallowWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { shallowWater: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, {  }, {  }, { dialogue: 'f2_glass_door' }, { wall: true }, { item: 'oil_flask' }, { shallowWater: true }, { item: 'potion_blue' }, { wall: true } ],
    [ { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true, glassWater: true }, { wall: true }, { wall: true }, { wall: true }, { secret: true, openedBy: 'lever' }, { wall: true } ],
    [ { wall: true }, { monster: 'cellar_spider', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 20, monsterMaxHp: 20, bark: 'stores_frogs', log: 'enter_stores' }, { wall: true }, { item: 'journal_page', journalPage: 2 }, {  }, { wall: true }, { deepWater: true }, { deepWater: true }, { deepWater: true }, { wall: true }, {  }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { dialogue: 'f2_frogcatcher' }, { npc: 'hobb' }, { wall: true }, { deepWater: true }, { deepWater: true }, { deepWater: true }, { wall: true, vent: { face: 'E' }, bark: 'first_vent' }, { stairs: 'down', daylight: true, bark: 'singing_louder' }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor2Meta = { name: 'Lower Halls', area: 'halls', ambience: 'amb_upper_halls' };
export const floor2Sconces = [{ x: 5, y: 1, face: 'W', lit: true, capped: false }, { x: 8, y: 0, face: 'S', lit: true, capped: false }, { x: 2, y: 6, face: 'N', lit: true, capped: false }, { x: 6, y: 6, face: 'N', lit: true, capped: false }, { x: 5, y: 4, face: 'E', lit: false, capped: false }, { x: 11, y: 5, face: 'W', lit: false, capped: false }, { x: 0, y: 10, face: 'E', lit: false, capped: false }, { x: 11, y: 9, face: 'W', lit: false, capped: false }, { x: 0, y: 5, face: 'E', lit: false, capped: true }, { x: 7, y: 7, face: 'W', lit: false, capped: true }];
export const floor2Drips = [{ x: 9, y: 5 }, { x: 9, y: 6 }, { x: 8, y: 6 }, { x: 10, y: 6 }, { x: 9, y: 7 }, { x: 7, y: 9 }];
export const floor2Dark = [];
export const floor2Puzzles = [{ id: 'f2_vents', type: 'vent_switch', text: 'floor2_vents', levers: { left: { x: 5, y: 6 }, right: { x: 4, y: 6 } }, zones: { cistern: [{ x: 8, y: 4 }, { x: 9, y: 4 }, { x: 10, y: 4 }, { x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 8, y: 6 }, { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }], stores: [{ x: 1, y: 9 }, { x: 1, y: 10 }, { x: 2, y: 10 }, { x: 3, y: 10 }, { x: 3, y: 9 }, { x: 4, y: 9 }, { x: 4, y: 10 }] }, start: 'left', leverDry: { left: 'stores', right: 'cistern' }, trapped: { npc: 'hobb', at: { x: 4, y: 10 }, freedFlag: 'frogcatcher_freed', ifFloodedFirst: 'frogcatcher_drowned', note: 'if the RIGHT lever floods the stores before f2_frogcatcher has freed him, he drowns: set frogcatcher_drowned, play the flood, and the party barks' }, floodedTile: { deepWater: true, blocked: true }, note: 'flooded zone is blocked; start state: cistern flooded, so the right lever is needed to reach the stairs, and the journal nook floods unless you grabbed the page first' }];
