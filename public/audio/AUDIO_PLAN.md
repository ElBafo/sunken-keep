# Sunken Keep audio: party-panel round checklist + mixer spec

All files are in `/workspace/sunken-keep/audio/` (OGG + MP3; iOS loads MP3). Trigger names = keys in `audio.json`.

## 1. Needed THIS round (party panel, combat, inventory, saves)
| Game event | Sound |
|---|---|
| Tap hero hand: axe / shield / mace / prayer / wand / scroll / dagger / tricks / fist / held torch | `act_axe` `act_shield` `act_mace` `act_prayer` `act_wand` `act_scroll` `act_dagger` `act_tricks` `act_punch` `act_torch` |
| Attack lands / misses | `hit` / `act_miss` (after the act sound) |
| Hand button ready again | `act_ready` (quiet) |
| Not enough mana | `mana_empty` |
| Hero takes damage | `hurt` |
| Monster sees party / attacks / is hit / dies (rat, crab, leeches, slime) | `<monster>_alert` `_attack` `_hurt` `_death` |
| Leeches waiting | `bog_leeches_idle_loop` (positional) |
| Portrait tap (sheet) | `sheet_open` |
| Level up | `level_up` |
| Inventory open / close / move item | `inventory_open` `inventory_close` `ui_inventory_move` |
| Equip | `equip_metal` `equip_leather` `equip_wood` `equip_cloth` |
| Use item that can't be used | `item_use_fail` |
| Drink potion / pick up item / key / chest / scroll | `potion` `pickup` `key` `chest` `scroll` |
| Wall torch: Take / Snuff / back in bracket / into water | `torch_take` `torch_extinguish` `torch_place` `torch_dunk` |
| Save (manual 1.0, autosave 0.5) | `save` |
| Menu buttons / denied / menus | `ui_button` `ui_button_denied` `ui_menu_open` `ui_menu_close` |
| New log line | `ui_log_line` (quiet) |
| Conversation line (Hobb, Tam, Dural) | `vox_<npc>_1..4` random, no repeats |
| Title screen / New Game intro | `menu` loop -> fades into `intro` |
| Floor 1 music | `music_act1` at 0.3, duck to 0.12 in fights and conversations |

Already in the 3D build: steps (4 variants), doors, torches, oil and ember, drips, water lap, far sounds, wall dressing, hooks, glints, dark breathing, halls ambience.

## 2. Later rounds (do NOT wire yet)
Floors 2-4 puzzles (`lever`, `vent_switch`, `room_drain/flood`, `bowl_offering`, `carving_reveal`, `riddle_*`, `tile_*`, `secret_rack`), floor 4 escape (`flood_*`, `amb_flood_rush_1..4`), `drowned_dwarf_*`, `tide_spawn_*`, `vox_hessa_*`, `lantern_gutter/out` (scripted Tide moments), `vent_loop`, `water_wall_loop`.

## 3. Not used
`door` (old one-shot; use `door_open/close`), `bark` blip (barks are text only now; drop it unless barks feel too silent), `amb_swamp` (intro boat shot only, never in the dungeon).

## 4. Mixer spec (build once)
- **Buses:** Music, Effects, Ambience, each with a settings slider (0-100%, saved). Voices and UI go on Effects.
- **Voice limit:** at most 6 sounds at once. If a 7th starts, stop the lowest priority, and the quietest of equal priority.
- **Priority (high to low):** 1. combat (act, hit, miss, hurt, monster attack/death), 2. puzzles, doors, pickups, UI, voices, 3. the 2 nearest positional loops (torch, water, leeches, hooks), 4. one-shot ambience (drips, far sounds, chains), 5. music and the halls loop (never stolen, only ducked).
- **Ducking:** fights and conversations drop Music to 40% and Ambience by 3 dB, with a 0.5 s fade.
- **Positional loops:** only those within 3 squares play; others pause (not stop) so they resume in sync.
- **iOS:** start the audio context on the first tap, suspend when the app goes to the background, and resume on the next tap.

## 5. Rules from the Oct 10 decisions
- Oil flask picked up while the lantern has room: `oil_pickup` then `lantern_refill` (0.3 s later). Lantern full, flask goes in the bag: `oil_pickup` only. Tapping a bag flask later: `lantern_refill`.
- A potion that would do nothing (full health, oil full) is not used up: play `item_use_fail`, not `potion`.
- Green potion pulling leeches off: `potion`, then `bog_leeches_hurt` from the hero's side.
- Take/Snuff choice appearing: `ui_menu_open`; tapping elsewhere to cancel: `ui_menu_close`.
- Natural 20: `hit_crit` instead of `hit`. Hero at 0 HP: `hero_down`. Revived or staggers up: `hero_revive`. All four down: stop music and loops, `game_over`.
- Combat variety: `hit`, `act_miss`, `hurt`, `hit_crit` each have 3 variants (`_variants` in audio.json); random, no repeats.
- Monster wind-ups (Levie's habits): `rust_crab_windup` (1.0 s), `drowned_dwarf_windup` (1.0 s), `dural_windup` (1.3 s). Start it with the visual tell; the strike lands at its end and plays `<monster>_attack` (Dural uses `drowned_dwarf_attack` for now). Positional, combat priority, never ducked or stolen; stop it if the monster dies or is interrupted. Crab is needed this round (step 2); dwarf and Dural wait for floors 3-4. (`src/make_windups.py`, all -20 LUFS.)
- Hero voices (wordless, all four): `vox_<hero>_hurt_1/_2` (0.35-0.48 s, -20 LUFS) and `vox_<hero>_down` (0.96-1.18 s, -19 LUFS) for brannoc, wren, ilsevar, mags. On damage: random from `vox_<hero>_hurt_variants`, no repeats, max one hero hurt voice per 0.6 s across the party, optionally skipped under 2 HP. At 0 HP: `vox_<hero>_down` layered with `hero_down`. Not positional. Brannoc low and creaky, Wren warm mid, Ilsevar dry with a rattle and hiss, Mags high and quick. (`src/make_hero_voices.py`)
