import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  audioGroupRelPaths,
  audioGroupStems,
  audioStemKeys,
  titleMenuStems
} from '../src/proto3d/audio-groups';
import { titleBootRelPaths } from '../src/proto3d/boot-assets';
import { floor1PlayableRelPaths } from '../src/proto3d/floor1-prefetch';

describe('audio load groups', () => {
  it('maps stems onto the buffer names the game already uses', () => {
    expect(audioStemKeys('sfx_oil_pickup')).toContain('oil_pickup');
    expect(audioStemKeys('sfx_lantern_loop')).toContain('lantern_loop');
    expect(audioStemKeys('sfx_lantern_ember_loop')).toContain('lantern_ember_loop');
    expect(audioStemKeys('amb_swamp_loop')).toContain('ambience');
    expect(audioStemKeys('music_menu_loop')).toContain('menu');
    expect(audioStemKeys('music_act1_loop')).toContain('music_act1');
  });

  it('keeps intro music out of the title-blocking menu stems', () => {
    expect(titleMenuStems()).not.toContain('music_intro');
    expect(audioGroupStems('title')).toContain('music_intro');
    expect(titleBootRelPaths('en')).not.toContain('audio/music_intro.mp3');
  });

  it('puts floor1 beds in the playable list and later beds out of it', () => {
    const playable = new Set(floor1PlayableRelPaths());
    const later = audioGroupRelPaths('later');
    expect(playable.has('audio/amb_swamp_loop.mp3')).toBe(true);
    expect(playable.has('audio/sfx_oil_pickup.mp3')).toBe(true);
    expect(playable.has('audio/sfx_lantern_refill.mp3')).toBe(true);
    expect(later).toContain('audio/music_act1_loop.mp3');
    expect(later).toContain('audio/amb_flooded_halls_loop.mp3');
    expect(playable.has('audio/music_act1_loop.mp3')).toBe(false);
    expect(playable.has('audio/amb_flooded_halls_loop.mp3')).toBe(false);
  });

  it('ships every grouped mp3', () => {
    const root = resolve(__dirname, '../public');
    for (const group of ['title', 'floor1', 'later'] as const) {
      for (const rel of audioGroupRelPaths(group)) {
        expect(statSync(resolve(root, rel)).size).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the public groups file in sync with the bundled copy', () => {
    const pub = readFileSync(resolve(__dirname, '../public/audio/audio_load_groups.json'), 'utf8');
    const src = readFileSync(resolve(__dirname, '../src/proto3d/audio-load-groups.json'), 'utf8');
    expect(JSON.parse(src)).toEqual(JSON.parse(pub));
  });
});
