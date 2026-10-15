/**
 * Floor 1 audio priority. Play never waits on sound: missing buffers are skipped.
 *
 * before-play: decoded before the dungeon is interactive.
 * first-fight: high priority right after play starts (target ~6 s).
 * act-1 music: its own step after first-fight finishes, then the rest of floor 1, then `later`.
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
  'sfx_bark',
  'sfx_scroll',
  'sfx_lantern_loop',
  'sfx_lantern_ember_loop',
  'sfx_cave_in'
] as const;

/** Hit, rat attack/alert, miss, and hero hurts — decode these before the rest of first-fight. */
export const FIRST_FIGHT_PRIORITY_STEMS = [
  'sfx_hit',
  'sfx_keep_rat_attack',
  'sfx_keep_rat_alert',
  'sfx_act_miss',
  'vox_brannoc_hurt_1',
  'vox_brannoc_hurt_2',
  'vox_ilsevar_hurt_1',
  'vox_ilsevar_hurt_2',
  'vox_mags_hurt_1',
  'vox_mags_hurt_2',
  'vox_wren_hurt_1',
  'vox_wren_hurt_2'
] as const;

/** Weapon variants, death/hurt stings, talk clips — after the priority burst. */
export const FIRST_FIGHT_REST_STEMS = [
  'sfx_hit_2',
  'sfx_hit_3',
  'sfx_act_miss_2',
  'sfx_act_miss_3',
  'sfx_keep_rat_death',
  'sfx_keep_rat_hurt',
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
  'vox_brannoc_talk',
  'vox_ilsevar_talk',
  'vox_mags_talk',
  'vox_wren_talk'
] as const;

export const FIRST_FIGHT_STEMS = [...FIRST_FIGHT_PRIORITY_STEMS, ...FIRST_FIGHT_REST_STEMS] as const;

/** Own step after first-fight finishes. Not part of the first-fight combat gate. */
export const ACT1_MUSIC_STEM = 'music_act1_loop';

/** Combat stays asleep until first-fight resolves or this cap, so a stalled file cannot freeze play. */
export const FIRST_FIGHT_CAP_MS = 4000;

export const ACT1_MUSIC_FADE_MS = 3000;

/** @deprecated Use BEFORE_PLAY_STEMS / FIRST_FIGHT_STEMS. Kept for older tests. */
export const FLOOR1_PLAY_STEMS = BEFORE_PLAY_STEMS;
