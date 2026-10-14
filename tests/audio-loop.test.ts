import { describe, expect, it } from 'vitest';
import {
  LOOP_START_FALLBACK_S,
  LOOP_START_MAX_S,
  LOOP_START_MIN_S,
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

  it('uses 1e-3 so decoder noise at 6-9 ms is ignored', () => {
    const rate = 44100;
    const samples = new Array(rate).fill(0);
    samples[Math.floor(rate * 0.008)] = 2e-4;
    expect(LOOP_START_THRESHOLD).toBe(1e-3);
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 0.5)).toBe(LOOP_START_FALLBACK_S);
  });

  it('falls back when the detected start is under 20 ms or past 60 ms', () => {
    const rate = 44100;
    const early = new Array(rate).fill(0);
    early[Math.floor(rate * 0.01)] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(early, rate), 0.5)).toBe(LOOP_START_FALLBACK_S);
    const late = new Array(rate).fill(0);
    late[Math.floor(rate * 0.08)] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(late, rate), 0.5)).toBe(LOOP_START_FALLBACK_S);
    expect(LOOP_START_MIN_S).toBe(0.02);
    expect(LOOP_START_MAX_S).toBe(0.06);
    expect(LOOP_START_FALLBACK_S).toBe(0.025057);
  });

  it('keeps a start in the 20-60 ms window', () => {
    const rate = 44100;
    const samples = new Array(rate * 2).fill(0);
    const at = Math.floor(rate * 0.03);
    samples[at] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 0.5)).toBeCloseTo(0.03, 4);
  });

  it('falls back when remaining duration is shorter than the loop length', () => {
    const rate = 44100;
    const samples = new Array(Math.floor(rate * 0.2)).fill(0);
    samples[Math.floor(rate * 0.03)] = 0.5;
    expect(detectLoopStartSec(fakeBuffer(samples, rate), 5)).toBe(LOOP_START_FALLBACK_S);
  });

  it('sets loopEnd = loopStart + true length', () => {
    const rate = 44100;
    const samples = new Array(rate * 6).fill(0);
    samples[Math.floor(rate * 0.03)] = 0.2;
    const src = { loop: false, loopStart: 0, loopEnd: 0 };
    applyBufferLoopPoints(src, fakeBuffer(samples, rate), 5);
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBeCloseTo(0.03, 4);
    expect(src.loopEnd).toBeCloseTo(src.loopStart + 5, 6);
  });
});
