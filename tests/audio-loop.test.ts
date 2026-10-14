import { describe, expect, it } from 'vitest';
import {
  LOOP_START_FALLBACK_S,
  LOOP_START_MAX_S,
  LOOP_START_THRESHOLD,
  applyBufferLoopPoints,
  detectLoopStartSec,
  type LoopSampleBuffer
} from '../src/proto3d/audio-loop';
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

  it('uses the first sample above 1e-4, not a louder threshold', () => {
    const rate = 44100;
    const samples = new Array(rate).fill(0);
    const soft = Math.floor(rate * 0.01);
    samples[soft] = 2e-4;
    samples[soft + 10] = 0.9;
    const start = detectLoopStartSec(fakeBuffer(samples, rate), 0.5);
    expect(LOOP_START_THRESHOLD).toBe(1e-4);
    expect(start).toBeCloseTo(soft / rate, 6);
  });

  it('falls back to 0.025057 s when start is past 60 ms', () => {
    const rate = 44100;
    const samples = new Array(rate).fill(0);
    samples[Math.floor(rate * 0.08)] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 0.5)).toBe(LOOP_START_FALLBACK_S);
    expect(LOOP_START_MAX_S).toBe(0.06);
    expect(LOOP_START_FALLBACK_S).toBe(0.025057);
  });

  it('falls back when remaining duration is shorter than the loop length', () => {
    const rate = 44100;
    const samples = new Array(Math.floor(rate * 0.2)).fill(0);
    samples[10] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 5)).toBe(LOOP_START_FALLBACK_S);
  });

  it('sets loopEnd = loopStart + true length', () => {
    const rate = 44100;
    const samples = new Array(rate * 6).fill(0.2);
    const src = { loop: false, loopStart: 0, loopEnd: 0 };
    applyBufferLoopPoints(src, fakeBuffer(samples, rate), 5);
    expect(src.loop).toBe(true);
    expect(src.loopEnd).toBeCloseTo(src.loopStart + 5, 6);
  });
});
