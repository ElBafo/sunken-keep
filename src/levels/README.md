# Levels (Levie)

- `floor1.ts` .. `floor4.ts`: Act 1. Floors 2-4 are generated from `src/act1.py` (ASCII map + overlays).
  Edit the ASCII there and run `python3 src/act1.py`; it checks the map (every item, monster and
  dialogue reachable, key not behind its own door, sconces and vents face open squares, escape path
  unbroken) before writing the .ts files.
- `types-act1.ts`: new optional tile fields. Floors also export `floorNSconces`, `floorNDrips`,
  `floorNDark` (lantern-only squares), `floorNMeta`, and floor 4 exports `floor4Escape`.
- Stairs line up: F1 down (7,1) = F2 start, F2 down (10,10) = F3 start, F3 down (3,11) = F4 start.
- `monsters.json`, `actions.json`: stats and hero actions.

## Floor 2, Lower Halls (12x12)
Arrive in daylight. Singing starts at (6,3). NW storeroom: spider, chest, and the hidden lever at (3,2)
that opens the secret wall at (10,8) in the rat room (2 rats + leeches). Glass-water doorway at (6,8)
with `f2_glass_door`. SW nook: spider guarding Orrun's journal page 2. Stairs down (10,10) sit next to the
glowing vent (9,10) and the last daylight shaft.

## Floor 3, Barracks (14x14)
Arrive at (10,10); `f3_grate_tam` fires at (9,9), facing the grate. Drowned dwarf patrols the vent
corridor. Dark mess hall with long tables holds the armoury key; the armoury (locked) has the iron shield
and chain mail. Lower bunk room is dark and flooded (leeches). A second patrol guards the way to the
stairs (3,11).

## Floor 4, Barracks Deep (14 rows x 16)
Arrive at (3,11). Officers' quarters on the west. Key at (7,1) opens the captain's hall; `f4_captain` at
(9,4). The cell wing door (13,5) opens once the captain is talked down or beaten. Down the east corridor
into the flooded drill yard (dark), Tam behind bars; `f4_tam_cell` at (12,11), then `f4_tide_wakes` and
the escape: 13 squares to the stairs at (5,9), checkpoints at (12,13) and (8,13). The stairs stay shut
until the escape starts, so you can see the way out from the yard but not skip Tam.
