import { FloorData, Sconce } from './types';

const m = (monster: string, hp: number) => ({
  monster,
  monsterState: 'idle' as const,
  monsterAnimTime: 0,
  monsterHp: hp,
  monsterMaxHp: hp
});

// Floor 1: Upper Halls 15×12 (from levels/floor1.ts)
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
export const floor1: FloorData = {
  width: 15,
  height: 12,
  startX: 1,
  startY: 7,
  startDir: 0,
  tiles: [
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ],
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true },
      { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, {}, { wall: true }, {},
      m('keep_rat', 14), {}, {}, {}, { wall: true }
    ],
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true, ...m('bog_leeches', 12) },
      { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime', 40), {},
      { bark: 'guard_hall_enter' }, {}, { daylight: true }, { prop: 'beams_fallen' }, {}, { wall: true }
    ],
    [
      { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true },
      m('rust_crab', 24), { item: 'potion_red' }, {}, { wall: true }, {},
      { prop: 'beams_fallen', mirror: true }, {}, {}, {}, { wall: true }
    ],
    [
      { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, {},
      {}, {}, { prop: 'beams_fallen' }, { stairs: 'down' }, { wall: true }
    ],
    [
      { wall: true }, {}, { item: 'key' }, {}, {},
      { item: 'potion_blue' }, {}, m('keep_rat', 14), { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ],
    [
      { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true },
      {}, { item: 'oil_flask' }, {}, { bark: 'lampkeeper_hooks_heard' }, {},
      {}, {}, { wall: true }, { wall: true }, { wall: true }
    ],
    [
      { wall: true }, {}, {}, {}, { wall: true },
      { chest: true }, {}, { item: 'potion_green' }, { wall: true }, { wall: true },
      { wall: true }, {}, { wall: true }, { wall: true }, { wall: true }
    ],
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, {},
      {}, { bark: 'lampkeeper_enter' }, { item: 'oil_flask' }, {}, { wall: true }
    ],
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, {},
      {}, {}, { prop: 'desk', readNote: 'note_lampkeeper', bark: 'lampkeeper_note_read' },
      { prop: 'lamp_capped', bark: 'lampkeeper_capped_lamp' }, { wall: true }
    ],
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { prop: 'jar_rack' },
      {}, {}, {}, {}, { wall: true }
    ],
    [
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true },
      { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }
    ]
  ]
};

/**
 * Proto3d only — do not copy this into shared floor1. Until combat is ported,
 * the locked door at (4,2) must have a free square in front at (3,2).
 * Move the leeches onto (3,3) in the water hall (same shallow-water floor height).
 */
function relocateLeechesOffDoor(floor: FloorData) {
  const front = floor.tiles[2][3];
  const dest = floor.tiles[3][3];
  if (front.monster !== 'bog_leeches' || dest.monster) return;
  dest.monster = front.monster;
  dest.monsterHp = front.monsterHp;
  dest.monsterMaxHp = front.monsterMaxHp;
  dest.monsterState = front.monsterState;
  dest.monsterAnimTime = front.monsterAnimTime;
  delete front.monster;
  delete front.monsterHp;
  delete front.monsterMaxHp;
  delete front.monsterState;
  delete front.monsterAnimTime;
}

relocateLeechesOffDoor(floor1);

export const floor1Sconces: Sconce[] = [
  { x: 0, y: 6, face: 'E', lit: true, capped: false },
  { x: 4, y: 1, face: 'W', lit: true, capped: false },
  { x: 6, y: 4, face: 'S', lit: true, capped: false },
  { x: 4, y: 6, face: 'W', lit: false, capped: false },
  { x: 8, y: 1, face: 'W', lit: false, capped: false },
  { x: 8, y: 5, face: 'S', lit: false, capped: false },
  { x: 14, y: 3, face: 'W', lit: false, capped: false },
  { x: 0, y: 3, face: 'E', lit: false, capped: true },
  { x: 9, y: 0, face: 'S', lit: false, capped: true }
];
