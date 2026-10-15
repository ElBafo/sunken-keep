import type { FloorData } from './types';

// Floor 1: Upper Halls (Levie). Generated from levels/src/act1.py, edit the ASCII there and re-run.
// Map:
//   ######################
//   #~=~#S..#.....########
//   #~=~D.......F.d.....##
//   #~=~#...#.F...#####.##
//   #~~~#####...F.#####.##
//   #.......###########d##
//   #...#.......#######.##
//   #...#...###.#######.##
//   ##.###d##.....##.....#
//   ##.#....#...P.##.....#
//   ##.#.~~.#.....##>....#
//   ##.#~==~##############
//   ##.#~~~.##############
//   ##.#.S..##############
//   #...##################
//   ######################
// Notes:
//   (2,9) start corridor bark (after the cave-in)
//   (3,14) cave-in: becomes solid rubble after the opening scene
//   (4,5) pantry doorway, first time in
//   (4,13) behind the secret wall S at (5,13)
//   (5,7) pantry chest: a healing draught the cook hid
//   (6,8) door down to the flooded cellars
//   (8,6) hook clinks first heard here; dead torch above
//   (9,2) guard hall: first time in, Ilsevar/Mags sunlight lines
//   (9,4) moved off the slime trail (was (17,2))
//   (9,10) Pell's jar rack against the west wall; square stays walkable
//   (10,1) extra rat, sleeps under the beams
//   (10,3) fallen beams, mirrored (dressing_act1.json)
//   (11,2) sunbeam through ceiling_crack + shaft_2
//   (11,8) Pell the lamp-keeper's room, optional dead end
//   (12,8) Pell's flask, the only oil on floor 1
//   (12,9) desk with Pell's note (tap the desk)
//   (13,9) tap the capped lamp
//   (14,2) door east, slime trail starts
//   (19,3) dented helmet; ambience drops out
//   (19,4) autosave under the slime-scarred sconce
//   (19,5) lair door, sting plays, stays open
//   (19,7) 1-wide neck of the lair; splits at half HP
export const floor1: FloorData = {
  id: 1,
  sconces: [{ x: 0, y: 6, face: 'E', lit: true, capped: false }, { x: 4, y: 1, face: 'W', lit: true, capped: false }, { x: 6, y: 4, face: 'S', lit: true, capped: false }, { x: 4, y: 6, face: 'W', lit: false, capped: false }, { x: 8, y: 1, face: 'W', lit: false, capped: false }, { x: 8, y: 5, face: 'S', lit: false, capped: false }, { x: 14, y: 3, face: 'W', lit: false, capped: false }, { x: 0, y: 3, face: 'E', lit: false, capped: true }, { x: 9, y: 0, face: 'S', lit: false, capped: true }],
  width: 22,
  height: 16,
  startX: 3,
  startY: 14,
  startDir: 3,
  tiles: [
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret' }, {  }, {  }, { wall: true }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, {  }, {  }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { door: true, doorLocked: true, carving: 'carving_door' }, {  }, {  }, {  }, {  }, { bark: 'guard_hall_enter' }, {  }, { daylight: true }, { prop: 'beams_fallen', propPlacement: 'floor' }, {  }, { door: true, trigger: 'slime_trail_start', once: true }, {  }, { trigger: 'slime_trail_bones', once: true }, {  }, {  }, {  }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, { item: 'potion_red' }, {  }, { wall: true }, {  }, { prop: 'beams_fallen', mirror: true, propPlacement: 'floor' }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { trigger: 'slime_trail_helmet', once: true, ambienceOut: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, {  }, {  }, { prop: 'beams_fallen', propPlacement: 'floor' }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { trigger: 'slime_trail_save', autosave: true, once: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, { item: 'key' }, {  }, { bark: 'pantry' }, { item: 'potion_blue' }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { door: true, trigger: 'slime_lair_door', once: true, sting: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, {  }, {  }, {  }, { bark: 'lampkeeper_hooks_heard' }, {  }, {  }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, {  }, { wall: true }, { chest: true, chestItems: ['potion_red'] }, {  }, { item: 'potion_green' }, { wall: true }, { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { monster: 'slime', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 70, monsterMaxHp: 70, split: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { door: true, trigger: 'cellar_enter', once: true }, { wall: true }, { wall: true }, {  }, {  }, { bark: 'lampkeeper_enter' }, { item: 'oil_flask' }, {  }, { wall: true }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, { bark: 'f1_start' }, { wall: true }, {  }, {  }, {  }, { monster: 'keep_rat', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 14, monsterMaxHp: 14 }, { wall: true }, {  }, {  }, {  }, { prop: 'desk', readNote: 'note_lampkeeper', bark: 'lampkeeper_note_read', propPlacement: 'floor' }, { prop: 'lamp_capped', bark: 'lampkeeper_capped_lamp', propPlacement: 'wall', propWall: 'E' }, { wall: true }, { wall: true }, {  }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { item: 'potion_red' }, { shallowWater: true }, { shallowWater: true }, {  }, { wall: true }, { prop: 'jar_rack', propPlacement: 'wall', propWall: 'W' }, {  }, {  }, {  }, {  }, { wall: true }, { wall: true }, { stairs: 'down' }, {  }, {  }, {  }, {  }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { shallowWater: true }, { deepWater: true, monster: 'bog_leeches', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 12, monsterMaxHp: 12 }, { deepWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, {  }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, {  }, { wall: true }, { item: 'journal_page', journalPage: 1 }, { secret: true }, {  }, { monster: 'rust_crab', monsterState: 'idle', monsterAnimTime: 0, monsterHp: 24, monsterMaxHp: 24 }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, {  }, {  }, { trigger: 'cave_in', once: true, state: 'cave_in_done', rubbleAfter: 'cave_in_done' }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};

export const floor1Meta = { name: 'Upper Halls', area: 'halls', ambience: 'amb_upper_halls' };
export const floor1Sconces = [{ x: 0, y: 6, face: 'E', lit: true, capped: false }, { x: 4, y: 1, face: 'W', lit: true, capped: false }, { x: 6, y: 4, face: 'S', lit: true, capped: false }, { x: 4, y: 6, face: 'W', lit: false, capped: false }, { x: 8, y: 1, face: 'W', lit: false, capped: false }, { x: 8, y: 5, face: 'S', lit: false, capped: false }, { x: 14, y: 3, face: 'W', lit: false, capped: false }, { x: 0, y: 3, face: 'E', lit: false, capped: true }, { x: 9, y: 0, face: 'S', lit: false, capped: true }];
export const floor1Drips = [{ x: 2, y: 1 }, { x: 2, y: 3 }, { x: 1, y: 4 }];
export const floor1Dark = [{ x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }, { x: 13, y: 9 }, { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }];
export const floor1Puzzles = [];
export const floor1CaveIn = { at: { x: 3, y: 14 }, stepTo: { x: 2, y: 14 }, rubble: { x: 3, y: 14 }, endDir: 1, once: true, state: 'cave_in_done', bark: 'opening_cavein' };
