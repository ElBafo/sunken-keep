import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  act1MusicStem,
  audioFileStem,
  audioLoopLength,
  audioGroupRelPaths,
  audioGroupStems,
  audioStemKeys,
  audioStemPath,
  beforePlayRelPaths,
  firstFightPriorityStems,
  firstFightRestStems,
  firstFightStems,
  floor1StreamStems,
  titleMenuStems
} from '../src/proto3d/audio-groups';
import { titleBootRelPaths } from '../src/proto3d/boot-assets';
import {
  ACT1_MUSIC_STEM,
  BEFORE_PLAY_STEMS,
  FIRST_FIGHT_PRIORITY_STEMS,
  FIRST_FIGHT_REST_STEMS,
  FIRST_FIGHT_STEMS
} from '../src/proto3d/floor1-sounds';
import { floor1PlayableRelPaths } from '../src/proto3d/floor1-prefetch';

describe('audio load groups', () => {
  it('maps stems onto the buffer names the game already uses', () => {
    expect(audioStemKeys('sfx_oil_pickup')).toContain('oil_pickup');
    expect(audioStemKeys('sfx_lantern_loop')).toContain('lantern_loop');
    expect(audioStemKeys('sfx_lantern_ember_loop')).toContain('lantern_ember_loop');
    expect(audioStemKeys('amb_flooded_halls_loop')).toContain('ambience');
    expect(audioStemKeys('amb_swamp_loop')).not.toContain('ambience');
    expect(audioStemKeys('music_menu_loop')).toContain('menu');
    expect(audioStemKeys('music_act1_loop')).toContain('music_act1');
    expect(audioStemKeys('sfx_bark')).toContain('bark');
    expect(audioFileStem('music_slime_battle')).toBe('music_slime_battle_loop');
    expect(audioFileStem('sfx_slime_gurgle_loop')).toBe('sfx_slime_gurgle_loop');
    expect(audioLoopLength('music_slime_battle')).toBe(24);
    expect(audioLoopLength('slime_gurgle_loop')).toBe(5);
    expect(audioStemPath('music_slime_battle')).toBe('audio/music_slime_battle_loop.mp3');
    expect(audioStemPath('sting_slime_lair')).toBe('audio/sting_slime_lair.mp3');
    expect(audioStemKeys('music_slime_battle')).toContain('music.music_slime_battle');
    expect(audioStemKeys('vox_brannoc_talk')).toContain('vox_brannoc_talk');
  });

  it('keeps intro music out of the title-blocking menu stems', () => {
    expect(titleMenuStems()).not.toContain('music_intro');
    expect(audioGroupStems('title')).toContain('music_intro');
    expect(titleBootRelPaths('en')).not.toContain('audio/music_intro.mp3');
  });

  it('puts the before-play set in the playable list and keeps ambience off the critical path', () => {
    const playable = new Set(floor1PlayableRelPaths());
    const later = audioGroupRelPaths('later');
    expect(playable.has('audio/sfx_step_1.mp3')).toBe(true);
    expect(playable.has('audio/sfx_lantern_loop.mp3')).toBe(true);
    expect(playable.has('audio/sfx_bump.mp3')).toBe(true);
    expect(playable.has('audio/sfx_bark.mp3')).toBe(true);
    expect(playable.has('audio/sfx_cave_in.mp3')).toBe(true);
    expect(playable.has('audio/amb_flooded_halls_loop.mp3')).toBe(false);
    expect(playable.has('audio/sfx_keep_rat_alert.mp3')).toBe(false);
    expect(later).not.toContain('audio/music_act1_loop.mp3');
    expect(later).toContain('audio/amb_swamp_loop.mp3');
    expect(playable.has('audio/music_act1_loop.mp3')).toBe(false);
    expect(audioGroupStems('floor1')).toContain('music_act1_loop');
  });

  it('keeps before-play and first-fight stems out of later, and streams flooded halls after play', () => {
    const later = new Set(audioGroupStems('later'));
    const stream = new Set(floor1StreamStems());
    for (const stem of BEFORE_PLAY_STEMS) {
      expect(later.has(stem), `${stem} must not stay in later`).toBe(false);
    }
    for (const stem of FIRST_FIGHT_STEMS) {
      expect(later.has(stem), `${stem} must not stay in later`).toBe(false);
      expect(firstFightStems()).toContain(stem);
    }
    expect(stream.has('amb_flooded_halls_loop')).toBe(true);
    expect(stream.has('music_act1_loop')).toBe(false);
    expect(firstFightStems()).not.toContain('music_act1_loop');
    expect(act1MusicStem()).toBe(ACT1_MUSIC_STEM);
    expect(beforePlayRelPaths()).not.toContain('audio/amb_flooded_halls_loop.mp3');
    expect(later.has('amb_flood_rush_1_loop')).toBe(true);
    expect([...firstFightPriorityStems()]).toEqual([...FIRST_FIGHT_PRIORITY_STEMS]);
    expect([...firstFightRestStems()]).toEqual([...FIRST_FIGHT_REST_STEMS]);
    expect(firstFightPriorityStems()[0]).toBe('sfx_hit');
    expect(firstFightPriorityStems()).toContain('sfx_keep_rat_attack');
    expect(firstFightPriorityStems()).toContain('sfx_keep_rat_alert');
    expect(firstFightPriorityStems()).toContain('sfx_act_miss');
    expect(firstFightRestStems()).toContain('sfx_keep_rat_death');
    expect(firstFightRestStems()).toContain('sfx_act_axe');
    const overlap = FIRST_FIGHT_PRIORITY_STEMS.filter((s) =>
      (FIRST_FIGHT_REST_STEMS as readonly string[]).includes(s)
    );
    expect(overlap).toEqual([]);
    for (const hero of ['brannoc', 'wren', 'ilsevar', 'mags']) {
      const stem = `vox_${hero}_talk`;
      expect(firstFightStems()).toContain(stem);
      expect(audioGroupStems('floor1')).toContain(stem);
      expect(later.has(stem)).toBe(false);
    }
  });

  it('ships every grouped mp3', () => {
    const root = resolve(__dirname, '../public');
    for (const group of ['title', 'floor1', 'later'] as const) {
      for (const rel of audioGroupRelPaths(group)) {
        expect(statSync(resolve(root, rel)).size).toBeGreaterThan(0);
      }
    }
  });

  it('loads first-fight in two waves, then act-1 music, and gates combat on that burst', () => {
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    const loadFn = audio.slice(audio.indexOf('startPlayStreaming'), audio.indexOf('async loadSounds'));
    expect(loadFn).toContain('loadFirstFight');
    expect(loadFn).toContain('act1MusicStem');
    expect(loadFn.indexOf('loadFirstFight')).toBeLessThan(loadFn.indexOf('act1MusicStem'));
    expect(loadFn.indexOf('act1MusicStem')).toBeLessThan(loadFn.indexOf('floor1StreamStems'));
    expect(audio).toContain('FIRST_FIGHT_CAP_MS');
    expect(audio).toContain('ACT1_MUSIC_FADE_MS');
    expect(audio).toContain('act1MusicAllowed');
    expect(main).toContain('isCombatAwake');
    expect(main).toMatch(/if \(this\.isCombatAwake\(\)\) this\.applyEvents\(this\.combat\.bump/);
    expect(main).toContain('this.combat.tick(this.nowSec())');
    expect(main).toContain('this.isCombatAwake()');
  });

  it('keeps the public groups file in sync with the bundled copy', () => {
    const pub = readFileSync(resolve(__dirname, '../public/audio/audio_load_groups.json'), 'utf8');
    const src = readFileSync(resolve(__dirname, '../src/proto3d/audio-load-groups.json'), 'utf8');
    expect(JSON.parse(src)).toEqual(JSON.parse(pub));
  });
});
