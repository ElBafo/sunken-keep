import loadGroups from './audio-load-groups.json';
import audioRegistry from '../../public/audio/audio.json';
import {
  ACT1_MUSIC_STEM,
  BEFORE_PLAY_STEMS,
  FIRST_FIGHT_PRIORITY_STEMS,
  FIRST_FIGHT_REST_STEMS,
  FIRST_FIGHT_STEMS
} from './floor1-sounds';

type MusicEntry = { file?: string };
type AudioRegistry = {
  sfx?: Record<string, string | string[]>;
  music?: Record<string, MusicEntry>;
};

const REGISTRY = audioRegistry as AudioRegistry;

export type AudioLoadGroup = 'title' | 'floor1' | 'later';

const GROUPS = loadGroups as Record<AudioLoadGroup, string[]>;

/** Extra buffer names the rest of the game already looks up. */
const EXTRA_ALIASES: Record<string, readonly string[]> = {
  music_menu_loop: ['menu'],
  music_intro: ['intro'],
  music_act1_loop: ['music_act1'],
  amb_flooded_halls_loop: ['ambience'],
  sfx_torch_loop: ['torch'],
  sfx_drip_1: ['drip1'],
  sfx_drip_2: ['drip2'],
  sfx_drip_3: ['drip3'],
  sfx_drip_4: ['drip4'],
  sfx_chain_sway_1: ['chain1'],
  sfx_chain_sway_2: ['chain2'],
  sfx_crack_wind_loop: ['crack_wind'],
  sfx_banner_flutter: ['banner'],
  sfx_bones_settle: ['bones'],
  sfx_bog_leeches_idle_loop: ['leech_idle'],
  sfx_water_lap_loop: ['water_lap'],
  sfx_dark_presence_loop: ['dark_presence'],
  sfx_lamp_hooks_loop: ['lamp_hooks'],
  sfx_drowned_dwarf_alert: ['captain_dural_alert'],
  sfx_drowned_dwarf_hurt: ['captain_dural_hurt'],
  sfx_drowned_dwarf_death: ['captain_dural_death'],
  sfx_hit_resist_1: ['hit_resist'],
  sfx_hit_weak_1: ['hit_weak'],
  sfx_slime_gurgle_loop: ['slime_gurgle_loop'],
  music_slime_battle: ['slime_battle', 'music.music_slime_battle'],
  sting_slime_lair: ['music.sting_slime_lair'],
  sfx_slime_small_alert: ['slime_small_alert'],
  sfx_slime_small_attack: ['slime_small_attack'],
  sfx_slime_small_hurt: ['slime_small_hurt'],
  sfx_slime_small_death: ['slime_small_death']
};

export function audioGroupStems(group: AudioLoadGroup): readonly string[] {
  return GROUPS[group];
}

export function audioStemKeys(stem: string): string[] {
  const keys: string[] = [];
  let rest = stem;
  if (rest.startsWith('sfx_')) rest = rest.slice(4);
  else if (rest.startsWith('amb_')) rest = rest.slice(4);
  keys.push(rest);
  if (rest !== stem) keys.push(stem);
  for (const extra of EXTRA_ALIASES[stem] ?? []) {
    if (!keys.includes(extra)) keys.push(extra);
  }
  return keys;
}

/** Registry key → on-disk stem. `music.music_slime_battle` → `music_slime_battle_loop`. */
export function audioFileStem(stem: string): string {
  const music = REGISTRY.music?.[stem] ?? REGISTRY.music?.[stem.replace(/^music_/, '')];
  if (music?.file) return music.file;
  const sfxKey = stem.startsWith('sfx_') ? stem.slice(4) : stem;
  const sfx = REGISTRY.sfx?.[sfxKey] ?? REGISTRY.sfx?.[stem];
  if (typeof sfx === 'string') return sfx;
  return stem;
}

export function audioStemPath(stem: string): string {
  return `audio/${audioFileStem(stem)}.mp3`;
}

export function audioGroupRelPaths(group: AudioLoadGroup): string[] {
  return audioGroupStems(group).map(audioStemPath);
}

export function audioGroupFiles(group: AudioLoadGroup): ReadonlyArray<readonly [string, string]> {
  return audioGroupStems(group).map((stem) => [audioStemKeys(stem)[0], audioStemPath(stem)] as const);
}

/** Title bed + button voices. Intro music stays on its own preload. */
export function titleMenuStems(): string[] {
  return audioGroupStems('title').filter((stem) => stem !== 'music_intro');
}

export function beforePlayStems(): readonly string[] {
  return BEFORE_PLAY_STEMS;
}

export function firstFightStems(): readonly string[] {
  return FIRST_FIGHT_STEMS;
}

export function firstFightPriorityStems(): readonly string[] {
  return FIRST_FIGHT_PRIORITY_STEMS;
}

export function firstFightRestStems(): readonly string[] {
  return FIRST_FIGHT_REST_STEMS;
}

export function act1MusicStem(): string {
  return ACT1_MUSIC_STEM;
}

const BEFORE_PLAY_SET = new Set<string>(BEFORE_PLAY_STEMS);
const FIRST_FIGHT_SET = new Set<string>(FIRST_FIGHT_STEMS);

/** Floor 1 beds that stream after first-fight and act-1 music (includes flooded-halls ambience). */
export function floor1StreamStems(): string[] {
  return audioGroupStems('floor1').filter(
    (stem) => !BEFORE_PLAY_SET.has(stem) && !FIRST_FIGHT_SET.has(stem) && stem !== ACT1_MUSIC_STEM
  );
}

export function beforePlayRelPaths(): string[] {
  return beforePlayStems().map(audioStemPath);
}

export function firstFightRelPaths(): string[] {
  return firstFightStems().map(audioStemPath);
}
