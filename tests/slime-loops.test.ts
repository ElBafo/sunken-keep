import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('slime buffer-source loops', () => {
  it('ships gurgle and battle loops and plays them with Web Audio loop=true', () => {
    expect(existsSync(resolve(__dirname, '../public/audio/sfx_slime_gurgle_loop.mp3'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../public/audio/music_slime_battle_loop.mp3'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../public/audio/music_slime_battle.mp3'))).toBe(false);
    expect(existsSync(resolve(__dirname, '../public/audio/sting_slime_lair.mp3'))).toBe(true);
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    expect(audio).toContain('createBufferSource');
    expect(audio).toMatch(/\.loop\s*=\s*true/);
    expect(audio).toContain('sfx_slime_gurgle_loop');
    expect(audio).toContain('music_slime_battle');
    expect(audio).not.toContain('HTMLAudioElement');
    expect(audio).not.toContain('<audio');
    const groups = readFileSync(resolve(__dirname, '../src/proto3d/audio-load-groups.json'), 'utf8');
    expect(groups).toContain('sfx_slime_gurgle_loop');
    expect(groups).toContain('music_slime_battle');
  });
});
