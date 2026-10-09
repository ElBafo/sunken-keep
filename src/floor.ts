import { FloorData } from './party';

// Floor 1 of the Sunken Keep, gentler pass (Levie).
// Path: start -> west corridor (carving 1) -> key -> leech-filled water hall
// -> locked door (carving 2) -> crab + slime -> secret wall (carving 3 + Orrun's journal).
// Side room: the old pantry with the keep rat, the chest and a potion.
// Drowned dwarf and tide spawn are moved to deeper floors.
const m = (monster: string, hp: number) => ({ monster, monsterState: 'idle' as const, monsterAnimTime: 0, monsterHp: hp, monsterMaxHp: hp });

export const floor1: FloorData = {
  width: 9,
  height: 9,
  startX: 1,
  startY: 7,
  startDir: 0,
  sconces: [
    { x: 0, y: 6, face: 'E', lit: true },   // beside the first carving, warm light at the start
    { x: 4, y: 1, face: 'W', lit: true },   // wall above the locked door
    { x: 0, y: 3, face: 'E', lit: false },  // flooded hall, dead
    { x: 4, y: 6, face: 'W', lit: false },  // west corridor, dead
    { x: 8, y: 6, face: 'W', lit: false },  // pantry, dead
    { x: 8, y: 1, face: 'W', lit: false },  // vault behind the slime, dead
  ],
  tiles: [
    // Row 0
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    // Row 1: flooded hall | secret wall with the last carving and Orrun's journal behind it
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, { secret: true, carving: 'carving_secret', item: 'scroll' }, {}, {}, { wall: true } ],
    // Row 2: leeches wait in the shallows by the locked door; slime guards the back of the vault
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { ...m('bog_leeches', 10), shallowWater: true }, { door: true, doorLocked: true, carving: 'carving_door' }, {}, {}, m('slime', 22), { wall: true } ],
    // Row 3: a rust crab sits just inside the door
    [ { wall: true }, { shallowWater: true }, { deepWater: true }, { shallowWater: true }, { wall: true }, m('rust_crab', 18), { item: 'potion_red' }, {}, { wall: true } ],
    // Row 4
    [ { wall: true }, { shallowWater: true }, { shallowWater: true }, { shallowWater: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ],
    // Row 5: key in the corridor; the pantry opens to the east
    [ { wall: true }, {}, { item: 'key' }, {}, {}, { item: 'potion_blue' }, { chest: true }, m('keep_rat', 12), { wall: true } ],
    // Row 6: first carving right in front of the party at the start
    [ { wall: true }, { carving: 'carving_start' }, {}, {}, { wall: true }, {}, {}, {}, { wall: true } ],
    // Row 7 (start)
    [ { wall: true }, {}, {}, {}, { wall: true }, {}, {}, { item: 'potion_green' }, { wall: true } ],
    // Row 8
    [ { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true }, { wall: true } ]
  ]
};
