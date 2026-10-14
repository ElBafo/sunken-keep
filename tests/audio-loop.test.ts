import { describe, expect, it } from 'vitest';
import { LOOP_START_S, applyBufferLoopPoints, detectLoopStartSec, type LoopSampleBuffer } from '../src/proto3d/audio-loop';
import { audioLoopLength } from '../src/proto3d/audio-groups';

function fakeBuffer(samples: number[], sampleRate = 44100): LoopSampleBuffer {
  const data = Float32Array.from(samples);
  return {
    length: data.length,
    sampleRate,
    numberOfChannels: 1,
    duration: data.length / sampleRate,
    getChannelData: () => data
  };
}

describe('WebKit MP3 loop padding', () => {
  it('reads true loop lengths from the registry', () => {
    expect(audioLoopLength('music_slime_battle')).toBe(24);
    expect(audioLoopLength('music.music_slime_battle')).toBe(24);
    expect(audioLoopLength('slime_gurgle_loop')).toBe(5);
    expect(audioLoopLength('sfx_slime_gurgle_loop')).toBe(5);
    expect(audioLoopLength('music_act1')).toBeUndefined();
  });

  it('always uses 0.025057 s — no sample scan', () => {
    const rate = 44100;
    const samples = new Array(rate * 2).fill(0);
    samples[Math.floor(rate * 0.024989)] = 0.9;
    samples[Math.floor(rate * 0.03)] = 0.9;
    expect(LOOP_START_S).toBe(0.025057);
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 5)).toBe(LOOP_START_S);
    expect(detectLoopStartSec(fakeBuffer(new Array(rate).fill(0), rate), 0.5)).toBe(LOOP_START_S);
  });

  it('sets loopEnd = loopStart + registry length', () => {
    const rate = 44100;
    const samples = new Array(rate * 6).fill(0);
    samples[Math.floor(rate * 0.03)] = 0.2;
    const src = { loop: false, loopStart: 0, loopEnd: 0 };
    applyBufferLoopPoints(src, fakeBuffer(samples, rate), 5);
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(LOOP_START_S);
    expect(src.loopEnd).toBe(LOOP_START_S + 5);
  });
});
