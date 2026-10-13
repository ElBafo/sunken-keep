/**
 * Floor 1 audio priority. Play never waits on sound: missing buffers are skipped.
 *
 * before-play: decoded before the dungeon is interactive.
 * first-fight: high priority right after play starts (target ~6 s).
 * Everything else in the floor1 JSON group streams during play, then `later`.
 */
export const BEFORE_PLAY_STEMS = [
  'sfx_step',
  'sfx_step_1',
  'sfx_step_2',
  'sfx_step_3',
  'sfx_step_4',
  'sfx_step_water_shallow',
  'sfx_step_water_shallow_1',
  'sfx_step_water_shallow_2',
  'sfx_step_water_shallow_3',
  'sfx_step_water_shallow_4',
  'sfx_step_water_deep',
  'sfx_step_water_deep_1',
  'sfx_step_water_deep_2',
  'sfx_step_water_deep_3',
  'sfx_step_water_deep_4',
  'sfx_bump',
  'sfx_drip_1',
  'sfx_drip_2',
  'sfx_drip_3',
  'sfx_drip_4',
  'sfx_ui_button',
  'sfx_ui_turn',
  'sfx_ui_log_line',
  'sfx_lantern_loop',
  'sfx_lantern_ember_loop'
] as const;

export const FIRST_FIGHT_STEMS = [
  'sfx_keep_rat_alert',
  'sfx_keep_rat_attack',
  'sfx_keep_rat_death',
  'sfx_keep_rat_hurt',
  'sfx_hit',
  'sfx_hit_2',
  'sfx_hit_3',
  'sfx_act_miss',
  'sfx_act_miss_2',
  'sfx_act_miss_3',
  'sfx_hurt',
  'sfx_hurt_2',
  'sfx_hurt_3',
  'sfx_act_axe',
  'sfx_act_dagger',
  'sfx_act_mace',
  'sfx_act_prayer',
  'sfx_act_punch',
  'sfx_act_ready',
  'sfx_act_scroll',
  'sfx_act_shield',
  'sfx_act_torch',
  'sfx_act_tricks',
  'sfx_act_wand',
  'vox_brannoc_hurt_1',
  'vox_brannoc_hurt_2',
  'vox_ilsevar_hurt_1',
  'vox_ilsevar_hurt_2',
  'vox_mags_hurt_1',
  'vox_mags_hurt_2',
  'vox_wren_hurt_1',
  'vox_wren_hurt_2'
] as const;

/** @deprecated Use BEFORE_PLAY_STEMS / FIRST_FIGHT_STEMS. Kept for older tests. */
export const FLOOR1_PLAY_STEMS = BEFORE_PLAY_STEMS;
