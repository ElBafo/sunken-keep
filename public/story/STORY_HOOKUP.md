# Act 1 story hookup checklist (floors 1-4), for Gamie

Every story trigger Act 1 needs, the system that fires it, and whether the 3D build fires it yet. Code checked: `main` @ `7d080ad` (PR #14), `src/proto3d/`. **Exact firing rules live in `story/triggers_act1.json`** (condition, floor, square, once/repeat). This file is the status view of the same list.

**Status key:** ✅ wired (fires from the data file) · 🟡 partial (hardcoded EN text, or the tile field is in `floor-data.ts` but nothing reads it) · ⬜ not yet  
**repeat:** once = once per save · once_per_floor · every = every time · pool = repeating flavour bark (unused line until spent) · until_freed = re-arms (Hobb)  
**Story files:** `barks.json`, `bark_rules.json`, `log.json`, `story/dialogue.json`, `story/puzzles_act1.json`, `story/note_lampkeeper.json`, `story/journal_act1.json`, `story/names.json`, `story/title_text.json`, `story/triggers_act1.json`. Greek: `story/el/*.el.json`, same keys (all in sync).

## Totals
| type | count | ✅ | 🟡 | ⬜ |
|---|---|---|---|---|
| barks | 50 | 0 | 6 | 44 |
| log | 65 | 2 | 6 | 57 |
| dialogue | 7 | 0 | 0 | 7 |
| puzzle text | 14 | 0 | 0 | 14 |
| notes | 3 | 1 | 0 | 2 |
| flags | 8 | 0 | 0 | 8 |
| title/save UI groups | 7 | 0 | 0 | 7 |
| **total** | **154** | **3** | **12** | **139** |

Barks = 41 `barks.json` triggers + 9 puzzle bark triggers. A key that is both a bark and a log (`leech_latch`, `lantern_gutter`) counts once per type. 3D today fires only `oil_pickup`, `torch_snuffed` and Pell's note, in English only: it fetches EN `log.json` and the note, and `public/` has no `story/el/`.

## Runtime rules to build once (from `bark_rules.json`)
- Tiers: **tutorial** plays once, the first time. **story** plays once, never suppressed. **flavour** only plays if no bark played in the last 120 s, at most one per 180 s. `pool` triggers draw an unused line until spent.
- Never during dialogue, and never in a combat round that already has a story bark.
- **first_sight_*** is story tier: one random line, once. When it fires, `new_monster` is suppressed for that sighting. `new_monster` only covers slime, cellar spider, tide spawn and the captain.
- **condition** `{flag: value}` on a line: only matching lines are eligible (unset = false). Used by `frogcatcher_drowned` (`met_hobb`).
- **act** `N`: ignore before act N (`torch_draws_monster` is act 2).
- Puzzle barks live in `puzzles_act1.json` `<puzzle>.barks` (now with tiers), so merge them with `barks.json`.
- Log entries with `lines` (`carving_bowl`, `carving_drill`) show one log line per entry. `ref` names the puzzle text they mirror.
- Dialogue re-entry: `f2_frogcatcher` starts at node `return` on later visits until Hobb is freed or drowned.
- Names for `{hero}`/`{monster}`: `story/names.json` / `story/el/names.el.json`. Greek lines use the `{hero}: …` form, so names never decline.
- 2D reference code (`src/barks.ts`, `src/dialogue-system.ts`) has no tiers or once-per-save, drops `false` flags, ignores `cost`, and only logs actions. Don't port it as-is.

## 1. Movement / exploration
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `enter_floor1` | log | on arriving on floor 1 for the first time | 1 |  | once | ⬜ |
| `enter_floor2` | log | on arriving on floor 2 for the first time | 2 |  | once | ⬜ |
| `enter_floor3` | log | on arriving on floor 3 for the first time | 3 |  | once | ⬜ |
| `enter_floor4` | log | on arriving on floor 4 for the first time | 4 |  | once | ⬜ |
| `water_shallow` | log | first step into shallow water | any |  | once | ⬜ |
| `water_deep` | log | first step into deep water | any |  | once | ⬜ |
| `water_dry` | log | stepping from water onto dry stone | any |  | once_per_floor | ⬜ |
| `deep_water` | bark | each step into deep water (flavour, rate-limited) | any |  | pool | ⬜ |
| `bump_wall` | log | walking into a wall; at most once per 2 s, alongside the bump sound | any |  | every | ⬜ |
| `pantry` | bark | first step onto the pantry doorway (4,5), the gap in the west wall of the pantry room (x5-7, y5-7). Needs bark:"pantry" added on (4,5) in levels/src/act1.py (Levie) | 1 | at (4, 5) | once | ⬜ |
| `enter_pantry` | log | same step as the pantry bark: first step onto (4,5) | 1 | at (4, 5) | once | ⬜ |
| `guard_hall_enter` | bark | first step onto (9,2), the arch into the guard hall | 1 | at (9, 2) | once | 🟡 field floor-data.ts:44, unread |
| `enter_guard_hall` | log | same step as guard_hall_enter | 1 | at (9, 2) | once | ⬜ |
| `lampkeeper_hooks_heard` | bark | first step onto (8,6), mouth of the dark corridor (hook clinks start) | 1 | at (8, 6) | once | 🟡 field floor-data.ts:63, unread (hooks sound is wired) |
| `lampkeeper_enter` | bark | first step onto (11,8), Pell's room | 1 | at (11, 8) | once | 🟡 field floor-data.ts:74, unread |
| `enter_lampkeeper` | log | same step as lampkeeper_enter | 1 | at (11, 8) | once | ⬜ |
| `stairs_dead_lamp` | bark | on arriving on floor 2 at (7,1) | 2 | at (7, 1) | once | ⬜ |
| `first_singing` | bark | first step into water (shallow or deep) on floor 2 after f2_singing has played | 2 |  | once | ⬜ |
| `first_vent` | bark | first time the vent (9,10) is in view: standing on (10,8) or (10,9) facing S, or on (10,10) facing W | 2 | facing (9, 10) | once | ⬜ |
| `vent_room` | log | same moment as first_vent | 2 | facing (9, 10) | once | ⬜ |
| `singing_louder` | bark | on stepping onto the stairs down (10,10); play before the floor transition | 2 | at (10, 10) | once | ⬜ |
| `barracks_enter` | bark | on arriving on floor 3 at (10,10) | 3 | at (10, 10) | once | ⬜ |
| `mess_hall` | log | first step into the mess hall (x1-5, y1-5); in practice (5,3) through the door (6,3) | 3 | at (5, 3) | once | ⬜ |
| `armoury` | log | first step into the armoury through the parted water door: (4,8) or (3,8) | 3 | at (4, 8) | once | ⬜ |
| `tam_below` | bark | on stepping onto the stairs down (3,11); play before the floor transition | 3 | at (3, 11) | once | ⬜ |
| `deep_enter` | bark | on arriving on floor 4 at (3,11) | 4 | at (3, 11) | once | ⬜ |
| `tam_tally` | bark | first step onto (12,10), first view of the cell | 4 | at (12, 10) | once | ⬜ |
| `cell_found` | log | same step as tam_tally | 4 | at (12, 10) | once | ⬜ |

## 2. Interaction (tap what you face)
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `carving_start` | log | tap the carving at (1,6); you face it from the start square | 1 | facing (1, 6) | every | 🟡 field floor-data.ts:62, no tap handler |
| `carving_door` | log | tap the carving on the locked door (4,2) from (5,2) | 1 | facing (4, 2) | every | 🟡 field floor-data.ts:43, no tap handler |
| `carving_secret` | log | tap the glowing plate at (5,1) once the secret wall is open | 1 | facing (5, 1) | every | 🟡 field floor-data.ts:38, no tap handler |
| `secret_found` | log | tap/push the secret wall (5,1) from (5,2); it opens | 1 | facing (5, 1) | once | ⬜ |
| `secret_wall` | bark | any secret wall opens (flavour) | any |  | pool | ⬜ |
| `door_locked` | log | tap or bump the locked door (4,2) without the key | 1 | facing (4, 2) | every | 🟡 hardcoded "Locked." main.ts:385 |
| `door_unlocked` | log | tap the locked door with the key | 1 | facing (4, 2) | once | ⬜ |
| `chest_open` | log | open a chest (F1 5,7; F2 3,3; F3 12,1) | any |  | every | ⬜ |
| `chest_empty` | log | open a chest with nothing in it. Chest contents are not defined yet (Levie) | any |  | every | ⬜ |
| `read_lampkeeper_note` | log | tap the desk (12,9) while facing it; then show note_lampkeeper | 1 | facing (12, 9) | every | ⬜ |
| `lampkeeper_note_read` | bark | after the note closes the first time | 1 | facing (12, 9) | once | 🟡 field floor-data.ts:79, unread |
| `note_lampkeeper` | note | tap the desk (12,9); a second tap closes it | 1 | facing (12, 9) | every | ✅ main.ts:254, :283 |
| `lampkeeper_capped_lamp` | bark | tap the capped lamp prop (13,9) while facing it | 1 | facing (13, 9) | once | 🟡 field floor-data.ts:80, unread |
| `read_journal` | log | after pickup_scroll on F1: then journal_act1.json page 1, line by line | 1 | at (5, 1) | once | ⬜ |
| `journal_f2` | log | after pickup_scroll on F2: then journal_act1.json page 2, line by line | 2 | at (3, 9) | once | ⬜ |
| `journal_page_1` | note | see read_journal | 1 | at (5, 1) | once | ⬜ |
| `journal_page_2` | note | see journal_f2 | 2 | at (3, 9) | once | ⬜ |

## 3. Lighting / torches / oil
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `first_true_dark` | bark | first step, on floor 3 or deeper, onto a square lit only by Wren's lantern (in floorNDark, or a square no torch reaches, e.g. the F3 mess hall after the bowl). In practice F3 lower bunk room (x5-12, y11-12) | 3+ |  | once | ⬜ |
| `oil_pickup` | log | pick up an oil flask (unless oil was 0: then lantern_lit instead) | any |  | every | ✅ main.ts:233, :217 |
| `first_oil` | bark | first oil flask picked up | any |  | once | ⬜ |
| `torch_relit` | log | relight a dead torch (costs 1 oil) | any |  | every | ⬜ |
| `first_torch_lit` | bark | first relight | any |  | once | ⬜ |
| `torch_snuffed` | log | snuff a lit wall torch (Take/Snuff choice: Snuff) | any |  | every | ✅ main.ts:342 (hero hardcoded "Wren") |
| `first_torch_snuffed` | bark | first snuff | any |  | once | ⬜ |
| `torch_capped` | log | tap a capped torch (replaces hardcoded "Sealed.") | any |  | every | 🟡 hardcoded "Sealed." main.ts:317 |
| `torch_take` | log | Take a lit wall torch into a free hand | any |  | every | ⬜ |
| `torch_place` | log | put a held torch into an empty bracket | any |  | every | ⬜ |
| `torch_dunk` | log | drop a held torch into water; it goes out | any |  | every | ⬜ |
| `oil_empty` | bark | first time a relight is tried with 0 oil (the toast stays "No oil to spare." as a short log) | any |  | once | 🟡 hardcoded "No oil to spare." main.ts:348 |
| `lantern_out` | log | oil reaches 0; lantern falls to ember reach (never fully dark) | any |  | every | ⬜ |
| `lantern_lit` | log | oil goes from 0 to 1 or more | any |  | every | ⬜ |
| `lantern_gutter` | log | the f4_tam_cell oil choice is taken (cost lantern: guttering_for_floor): ember-only reach until you leave floor 4 | 4 |  | once | ⬜ |
| `lantern_gutter` | bark | same moment, first time only | 4 |  | once | ⬜ |
| `torch_draws_monster` | bark | ACT 2 ONLY (act:2): first time a light-drawn monster turns toward a lit torch. Ignored in Act 1 | 5+ |  | once | ⬜ |

## 4. Combat
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `hit` | log | a hero hits | any |  | every | ⬜ |
| `miss` | log | a hero misses | any |  | every | ⬜ |
| `monster_hit` | log | a monster hits a hero | any |  | every | ⬜ |
| `monster_dies` | log | a monster dies | any |  | every | ⬜ |
| `leech_drain` | log | a latched leech drains a hero (each tick) | any |  | every | ⬜ |
| `hero_down` | log | a hero reaches 0 HP | any |  | every | ⬜ |
| `party_dead` | log | all four heroes are down | any |  | every | ⬜ |
| `punch` | log | an empty-hand attack | any |  | every | ⬜ |
| `leech_latch` | log | a leech latches onto a hero | any |  | every | ⬜ |
| `leech_latch` | bark | a leech latches onto a hero (flavour) | any |  | pool | ⬜ |
| `first_punch` | bark | first empty-hand attack | any |  | once | ⬜ |
| `floor_cleared` | log | the last monster on the floor dies (not during the F4 escape) | any |  | once_per_floor | ⬜ |
| `first_sight_keep_rat` | bark | first keep rat in view; suppresses new_monster | 1 |  | once | ⬜ |
| `first_sight_rust_crab` | bark | first rust crab in view; suppresses new_monster | 1 |  | once | ⬜ |
| `first_sight_bog_leeches` | bark | first bog leeches in view; suppresses new_monster | 1 |  | once | ⬜ |
| `first_sight_drowned_dwarf` | bark | first drowned dwarf in view (F3 patrol); suppresses new_monster | 3 |  | once | ⬜ |
| `new_monster` | bark | first sight of a monster type with no first_sight_ lines (slime, cellar_spider, captain_dural) | any |  | pool | ⬜ |
| `low_health` | bark | a hero drops below 30% max HP; re-arms for that hero once healed above 30% | any |  | pool | ⬜ |

## 5. Party panel / tutorial
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `tut_hand` | bark | first time a monster is next to the front row (first fight starts) | any |  | once | ⬜ |
| `tut_front` | bark | first tap on a greyed back-row melee hand; if none by the end of the first fight, play then | any |  | once | ⬜ |
| `tut_sheet` | bark | 3 s after the first fight ends, once tut_hand and tut_front have played | any |  | once | ⬜ |
| `swap_front` | bark | first front/back swap (drag a face) | any |  | once | ⬜ |
| `not_ready` | log | tap a hand that is still recovering | any |  | every | ⬜ |
| `out_of_reach` | log | tap melee on a back-row hero | any |  | every | ⬜ |
| `idle` | bark | 45 s with no input, not in combat or dialogue (flavour) | any |  | pool | ⬜ |

## 6. Inventory
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `pickup_scroll` | log | pick up a journal page (F1 5,1 = page 1; F2 3,9 = page 2) | any |  | every | ⬜ |
| `pickup_key` | log | pick up the key (2,5) (replaces hardcoded "Key.") | 1 | at (2, 5) | once | 🟡 hardcoded "Key." main.ts:200 |
| `pickup_potion_red` | log | pick up a red potion (F1 at (6, 3)) | any |  | every | ⬜ |
| `desc_potion_red` | log | right after the first pickup_potion_red; also the bag description | any |  | once | ⬜ |
| `pickup_potion_blue` | log | pick up a blue potion (F1 at (5, 5)) | any |  | every | ⬜ |
| `desc_potion_blue` | log | right after the first pickup_potion_blue; also the bag description | any |  | once | ⬜ |
| `pickup_potion_green` | log | pick up a green potion (F1 at (7, 7)) | any |  | every | ⬜ |
| `desc_potion_green` | log | right after the first pickup_potion_green; also the bag description | any |  | once | ⬜ |
| `loot` | bark | any item pickup with no tutorial/story bark on the same pickup (flavour) | any |  | pool | ⬜ |
| `tut_inventory` | bark | first item into the bag (normally the key) | any |  | once | ⬜ |
| `tut_potion` | bark | first potion picked up | any |  | once | ⬜ |
| `drink_potion` | log | a hero drinks a potion | any |  | every | ⬜ |

## 7. Dialogue
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `glass_door` | log | same step as f2_glass_door, just before it opens: (6,7) | 2 | at (6, 7) | once | ⬜ |
| `grate_voice` | log | same step as f3_grate_tam, just before it opens: (9,9) | 3 | at (9, 9) | once | ⬜ |
| `f2_singing` | dialogue | step onto (6,3) | 2 | at (6, 3) | once | ⬜ |
| `f2_glass_door` | dialogue | step onto (6,7) | 2 | at (6, 7) | once | ⬜ |
| `f2_frogcatcher` | dialogue | step onto (3,10) facing E. First visit starts at node "a". Every later visit (re-arms when you leave the square) starts at node "return", while frogcatcher_freed and frogcatcher_drowned are both unset. Sets met_hobb. | 2 | at (3, 10) | until_freed | ⬜ |
| `f3_grate_tam` | dialogue | step onto (9,9) facing the grate (9,8) | 3 | at (9, 9) | once | ⬜ |
| `f4_captain` | dialogue | step onto (9,4); fight branch runs start_fight:captain_dural | 4 | at (9, 4) | once | ⬜ |
| `f4_tam_cell` | dialogue | step onto (12,11) facing W; then f4_tide_wakes | 4 | at (12, 11) | once | ⬜ |
| `f4_tide_wakes` | dialogue | right after f4_tam_cell; ends with start_escape | 4 | at (12, 11) | once | ⬜ |
| `tam_left` | bark | first escape checkpoint (12,13), only if saved_tam == false | 4 | at (12, 13) | once | ⬜ |

## 8. Puzzles
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `lever_found` | log | first time facing the hidden lever (3,2) from (4,2) | 2 | facing (3, 2) | once | ⬜ |
| `floor2_vents.lever_plate` | puzzle_text | first time facing either vent lever (4,6)/(5,6) from (4,5)/(5,5); again on each tap | 2 | facing (4, 6) | every | ⬜ |
| `floor2_vents.lever_pulled_dry` | puzzle_text | a lever pull drains a zone | 2 |  | every | ⬜ |
| `floor2_vents.lever_pulled_flood` | puzzle_text | a lever pull floods a zone (shown after _dry; each pull does both) | 2 |  | every | ⬜ |
| `vent_lever_first` | puzzle_bark | first lever pull | 2 |  | once | ⬜ |
| `vent_page_flooded` | puzzle_bark | a pull floods the stores nook while journal page 2 is still at (3,9). If Hobb is still trapped there, frogcatcher_drowned plays instead and this one is skipped | 2 |  | once | ⬜ |
| `frogcatcher_drowned` | bark | a pull floods the stores nook before frogcatcher_freed is set; sets frogcatcher_drowned. Line picked by met_hobb | 2 |  | once | ⬜ |
| `floor3_offering.lantern_carving` | puzzle_text | tap the carving (5,8) while it is inside lantern light; same text as log carving_bowl | 3 | facing (5, 8) | every | ⬜ |
| `carving_bowl` | log | same as floor3_offering.lantern_carving | 3 | facing (5, 8) | every | ⬜ |
| `floor3_offering.bowl_examine` | puzzle_text | tap the bowl (5,7) without a lit torch in hand | 3 | facing (5, 7) | every | ⬜ |
| `bowl_first_sight` | puzzle_bark | first time facing the bowl (5,7) from (6,7) or (5,8) | 3 | facing (5, 7) | once | ⬜ |
| `floor3_offering.bowl_lit` | puzzle_text | a held lit torch is placed in the bowl; sets f3_bowl_lit, water door (4,8) parts | 3 | facing (5, 7) | once | ⬜ |
| `bowl_lit` | puzzle_bark | same moment as floor3_offering.bowl_lit (one random line) | 3 |  | once | ⬜ |
| `floor3_offering.room_dark` | puzzle_text | right after bowl_lit: the mess hall goes dark | 3 |  | once | ⬜ |
| `floor4_riddle_door.carving` | puzzle_text | tap the riddle door (8,4) from (7,4) | 4 | facing (8, 4) | every | ⬜ |
| `riddle_first_sight` | puzzle_bark | first time facing the riddle door (8,4) from (7,4) (both lines, in order) | 4 | facing (8, 4) | once | ⬜ |
| `floor4_riddle_door.wrong_item` | puzzle_text | anything but a lit torch or Wren's lantern used on the altar (7,5) | 4 | facing (7, 5) | every | ⬜ |
| `riddle_wrong` | puzzle_bark | first wrong item on the altar | 4 |  | once | ⬜ |
| `floor4_riddle_door.solved` | puzzle_text | lit torch or Wren's lantern on the altar (7,5); door (8,4) opens | 4 |  | once | ⬜ |
| `riddle_solved` | puzzle_bark | same moment as floor4_riddle_door.solved | 4 |  | once | ⬜ |
| `floor4_drill_tiles.wall_carving` | puzzle_text | tap the carving (3,10); same text as log carving_drill | 4 | facing (3, 10) | every | ⬜ |
| `carving_drill` | log | same as floor4_drill_tiles.wall_carving | 4 | facing (3, 10) | every | ⬜ |
| `floor4_drill_tiles.step_ok` | puzzle_text | step on the next correct plate | 4 |  | every | ⬜ |
| `floor4_drill_tiles.step_wrong` | puzzle_text | step on a wrong plate; sequence resets | 4 |  | every | ⬜ |
| `drill_wrong` | puzzle_bark | first wrong plate | 4 |  | once | ⬜ |
| `floor4_drill_tiles.solved` | puzzle_text | sequence shield, hammer, hammer, oath done; rack (2,12) opens | 4 |  | once | ⬜ |
| `drill_solved` | puzzle_bark | same moment as floor4_drill_tiles.solved | 4 |  | once | ⬜ |

## 9. Saves / flow
| id | type | fires when | floor | where | repeat | status |
|---|---|---|---|---|---|---|
| `water_rising` | log | start_escape (end of f4_tide_wakes) | 4 |  | once | ⬜ |
| `checkpoint` | log | step onto (12,13) or (8,13) during the escape; autosave | 4 |  | each_checkpoint_once | ⬜ |
| `act1_end` | log | step onto the stairs (5,9) after start_escape; end card | 4 | at (5, 9) | once | ⬜ |

## Story flags (all persist in the save slot)
| flag | set | read |
|---|---|---|
| `met_hobb` | any choice in f2_frogcatcher (node c, ask2, return) | frogcatcher_drowned line condition |
| `frogcatcher_freed` | f2_frogcatcher lift choice | vent puzzle (Hobb drowns or not); f2_frogcatcher re-entry; Hobb removed |
| `frogcatcher_drowned` | vent puzzle: stores flooded before frogcatcher_freed | frogcatcher_drowned bark; f2_frogcatcher never fires again |
| `saved_tam` | f4_tam_cell (true or false, store false explicitly) | tam_left (false), F8, f12_final |
| `captain_spared` | f4_captain spare choice | f4_captain_done, f11_throne |
| `f3_bowl_lit` | torch placed in the bowl (5,7) | water door (4,8) opensOn; mess hall dark |
| `f4_captain_done` | f4_captain ends with captain_spared, or captain_dural dies | gate (13,5) gateOpensOn |
| `start_escape` | f4_tide_wakes action | stairs (5,9) gate, water timer, manual save off (title save_blocked) |
| Act 2-3: `ilsevar_listened`, `hessa_trusted`, `elda_ring`, `brannoc_claimed` | F6-F10 | F11-F12 |

Store `saved_tam = false` explicitly, because unset means "never reached the cell". **The save slot also needs:** the fired set for once triggers (story/tutorial barks, tile barks, one-shot dialogues), the used-line pools for `pool` barks, lit/snuffed/taken state of every sconce and current oil per floor (3D saves floor 1 only, as `proto3d.floor1.lights` in progress.ts), the lantern `guttering_for_floor` state, puzzle state (F2 lever side, bowl, riddle, drill), items taken, chests opened, doors unlocked, secrets opened, journal pages found, dead monsters, and the escape checkpoint.

## Fixed on the story side (10 Oct)
- Every Act 1 bark, log, puzzle text, dialogue and note now has a firing rule in `story/triggers_act1.json` (139 entries, plus flags). That covers the pantry (now the doorway at (4,5)), idle at 45 s, low_health below 30%, first_true_dark (first lantern-only square on F3+), the rooms that had no tile, and "on facing" rules for the vent, bowl and riddle door.
- `vent_wrong_order` → `vent_page_flooded`: a lever pull floods the stores nook while journal page 2 is still there. The line is unchanged, because it fits.
- Lantern logs follow the ember rule: `lantern_out` = "The oil's gone. Wren's ember holds.", `lantern_lit` = "Fresh oil. Wren's lantern flares up.", `lantern_gutter` = "Wren's lantern gutters to an ember." (the Tide oil cost on F4).
- `torch_draws_monster` gets `act: 2` (still story tier).
- Hobb: every choice sets `met_hobb`. New nodes `return` and `later_again` (EN+EL) handle the re-entry. `frogcatcher_drowned` lines carry `condition: {met_hobb: true/false}`.
- New log keys (EN+EL): `torch_capped`, `torch_relit`, `torch_take`, `torch_place`, `torch_dunk`, `carving_bowl`, `carving_drill`, `desc_potion_red/blue/green`.
- `first_singing` (Ilsevar: "It hums louder when I'm standing in it." / Mags: "Then stop standing in it.") and `tam_below` (Mags: "Hang on, Tam. I'm coming, you idiot." / Brannoc: "Stairs first. Heroics after.") no longer repeat dialogue lines.
- Puzzle barks have tiers. `first_sight_*` is story tier, with the new_monster suppression written into `bark_rules.json`.
- Orrun's journal: page 1 is on F1 (5,1) and page 2 on F2 (3,9). Texts are in `story/journal_act1.json` + Greek. Beats, STORY.md and floor1_text.md now agree.
- act1_beats.md: `tam_cell` → `f4_tam_cell`. The Mags exit line and the dead-lamp line match the shipped text.
- Captain id is `captain_dural` everywhere in story files (`start_fight:captain_dural`, names). `story/names.json` (EN) added. Pell and tide spawn added to the Greek names. The EN title text got the `language` block.
- STORY.md flag table: `frogcatcher_freed`, `frogcatcher_drowned`, `met_hobb`.

## Still open (needs code, levels or a decision; not story-side)
- **Levels (Levie):** add `bark: 'pantry'` on F1 (4,5) in `levels/src/act1.py`. Chest contents are undefined (`chest:true` only), so `chest_empty` can't be decided. `types-act1.ts` still says tile `bark` is "id in barks.json", but puzzle barks live in puzzles_act1.json.
- **Code (Gamie):** replace hardcoded "Key.", "Locked.", "Sealed.", "No oil to spare." and hero "Wren" with keys. Load Greek. `src/proto3d` doesn't read tile `bark`/`carving` fields yet.
- **Repo copies:** `public/barks.json`, `public/log.json`, `public/story/*` are stale and lack the new files. Re-copy from `/workspace/sunken-keep` when hooking up. `public/log.json` also has `monster_dies_dry`, which isn't in the story files or Greek. Keep it or drop it?
- **Out of scope, noticed:** `floor1_text.md` lists scripted barks (tide spawn, potion drink, chest open) that aren't in `barks.json`. `intro_captions.md` calls the keep "Karak Durn", but STORY.md calls it Stonevow Keep. `log.json` "The {monster} sinks…" reads oddly with plural "bog leeches".

---

# Overnight build strings (party panel, combat, inventory, title/saves)

All new player-facing text is in **`story/ui_text.json`** + **`story/el/ui_text.el.json`** (same keys, grouped by step), plus **36 new log keys** in `log.json` / `log.el.json` (each has a `when`, and is also listed in `triggers_act1.json`).

**Totals:** 196 UI strings (step 1: 44, step 2: 18, step 3: 99, step 4: 35) + 36 log lines. EN and EL have the same keys.
- **Label length:** button labels are ≤8 chars in both languages. The two exceptions have a `_short` sibling in both files: `float.level_up` (EN 9 → "Lv up!") and `settings.ambience` (EL "Ατμόσφαιρα" → "Ατμόσφ.").
- **Log lines:** ≤41 chars, checked with the longest name, monster and item filled in.
- **Placeholders:** `{hero} {target} {monster} {item} {n} {max} {date}`. Names come from `story/names.json` / `names.el.json`, and item names from `ui_text` `step3_inventory.items.<id>.name`. Greek lines use `{x}: …` so nothing declines.

**Reuse these existing keys. Don't add duplicates:**
- **log.json:** `hit`, `miss`, `monster_hit`, `monster_dies`, `punch`, `out_of_reach` (back-row melee), `not_ready`, `hero_down`, `party_dead`, `leech_latch`, `leech_drain`, `drink_potion` (red), `desc_potion_*`, `pickup_key`, `pickup_potion_*`, `pickup_scroll`, `oil_pickup`, `chest_open`, `chest_empty`, `door_locked`, `door_unlocked`, `torch_take/place/dunk/snuffed/relit/capped`, `lantern_out/lit`, `checkpoint`.
- **title_text.json:** `buttons.new_game/continue/load/settings/back`, `slot.*`, `overwrite.*`, `saved`, `save_blocked`, `areas`, `language`.
- **barks.json:** `tut_hand`, `tut_front`, `tut_sheet`, `tut_potion`, `tut_inventory`, `swap_front`, `first_punch`, `low_health`.

## Step 1: party panel + hands (`ui_text` `step1_party_panel`)
- `torch_choice`: prompt, take, snuff, cancel, take_hint, snuff_hint, hands_full
- `bars`: hp, mana, oil, oil_readout, ember, hp_readout
- `hands` (action label per gear id from hands.json): fist, axe, shield, iron_shield, mace, prayer_lantern, prayer_lantern_ember, wand, scroll, dagger, tricks_pouch, torch_lit, torch_burnt, ashmantle_hammer
- `hand_state`: recovering, no_mana, back_row, empty
- `sheet`: level, level_short, xp, ac, ac_long, to_hit, damage, recovery, row_front, row_back, swap_hint, close, down
- log: `hands_full`, `torch_burns_out`

## Step 2: combat (`step2_combat`)
- `float`: miss, crit, block, dodge, level_up (+ `_short`), xp_gain, burn, heal
- `level_up`: title, hp, to_hit, damage, ok
- `game_over`: title, body, load_last, title_screen
- log: `crit`, `dodge`, `block_raise`, `block_hit`, `torch_hit`, `leech_burned`, `frost_bolt`, `pocket_sand`, `heal`, `heal_none`, `no_mana`, `level_up`, `xp_gain`, `revive`, `monster_dies_dry` (replaces the stray repo-only key), `monster_near`

## Step 3: inventory (`step3_inventory`)
- `bag`: title, use, drop, give, equip, unequip, close, empty_slot, empty_bag, pick_hero, who_drinks, count, drop_confirm, drop_yes, drop_no, slot_hand, slot_body, slot_bag
- `items.<id>` with name / short / desc / effect. Potions use `desc_log` → `desc_potion_*`. Ids: key, potion_red, potion_blue, potion_green, oil_flask, torch, torch_burnt, journal_page, captain_key, iron_shield, chain_mail, ashmantle_hammer, axe, shield, mace, prayer_lantern, wand, scroll (Ilsevar's frost scroll), dagger, tricks_pouch, fist
- log: `drink_mana`, `drink_green`, `leech_off`, `cured`, `full_health`, `no_mana_pool`, `oil_use`, `oil_full`, `bag_full`, `pickup_item`, `chest_item`, `equip`, `unequip`, `give`, `drop_item`, `cant_use`, `mail_no_cast`, `lock_picked`

## Step 4: title + saves (`step4_title_saves`, adds to title_text.json)
- `buttons`: save, delete, menu, resume, quit, yes, no, ok
- `slot`: label, autosave, autosave_tag, date, corrupt, corrupt_sub
- `status`: saving, loading, autosaved, loaded, save_failed, no_saves
- `confirm`: new_game_title/body, load_title/body, delete_title/body, quit_title/body. Overwrite stays in `title_text.overwrite`.
- `settings`: title, music, effects, ambience (+ `_short`), on, off. The language picker is `title_text.language`.

## Open questions for these strings
1. **Crit:** there's no crit rule in actions.json. The strings assume a natural 20 (`crit`, `float.crit`).
2. **Revive:** there's no rule for how a downed hero comes back. `revive` is written but has no firing rule.
3. **Levelling:** the XP per kill, the XP curve and HP per level aren't defined. Strings use `{n}`.
4. **Bag size:** unknown, so `bag_full` exists but may never fire.
5. **Item id `scroll`:** it means both the map pickup (journal page) and Ilsevar's frost-scroll hand. The UI keys these as `journal_page` and `scroll`, so the map item should be renamed (Levie).
6. **Oil flasks:** the 3D build auto-fills on pickup (`oil_pickup`), but actions.json says they go in the bag and you tap to use them (`oil_use`, `oil_full`). Both are written; which one?
7. **Potions:** the strings assume a potion is **kept** when it would do nothing (full HP, a blue potion on Brannoc or Mags, full oil).
8. **Greek "mana" = "Μαγεία"**, not "μάνα", which reads as "mum". Loukas to confirm.
9. **Wren's name:** the 2D `characters.ts` calls her "Sister Wren", but names.json says "Wren". Which does the panel show?
10. **Torch choice:** Take or Snuff only; tapping elsewhere cancels (decided).
