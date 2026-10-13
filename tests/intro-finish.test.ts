import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  IntroPlayer,
  INTRO_DURATION_SEC,
  INTRO_STALL_MS
} from '../src/proto3d/intro';
import type { StoryText } from '../src/proto3d/i18n';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

function stubCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn()
    })
  } as unknown as HTMLCanvasElement;
}

function stubStory(): StoryText {
  return { locale: 'en', log: (key: string) => key } as unknown as StoryText;
}

function stubImageLoading() {
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }))
  );
  if (typeof URL.createObjectURL !== 'function') {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined
    });
  }
}

describe('intro finish → skipIntro', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function harness(opts?: { music: () => number | null }) {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    stubImageLoading();
    const intro = new IntroPlayer(stubCanvas(), stubStory());
    let finishedAt: number | null = null;
    intro.setOnFinished(() => {
      finishedAt = now;
    });
    if (opts?.music) intro.setTimeSource(opts.music);
    return {
      intro,
      setNow(ms: number) {
        now = ms;
      },
      tick() {
        return intro.debugTick();
      },
      finishedAt: () => finishedAt
    };
  }

  it('wires the reel end to skipIntro and keeps the Skip button on that same path', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(src).toContain('setOnFinished(() => this.skipIntro())');
    expect(src).toContain('onSkip: () => this.skipIntro()');
  });

  it('Skip still marks the intro finished without waiting on music', () => {
    const h = harness({ music: () => 4 });
    h.intro.start();
    h.intro.skip();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).toBeNull();
  });

  it('a full intro with no taps reaches playable within 1s of the 35s end', () => {
    let music = 0;
    const h = harness({ music: () => music });
    h.intro.start();
    h.setNow(34_000);
    music = 34;
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    expect(h.finishedAt()).toBeNull();
    h.setNow(35_000);
    music = 35;
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).not.toBeNull();
    expect((h.finishedAt() ?? 0) - INTRO_DURATION_SEC * 1000).toBeLessThanOrEqual(1000);
  });

  it('finishes when music_intro stalls around 32s instead of waiting for 35', () => {
    let music = 0;
    const h = harness({ music: () => music });
    h.intro.start();
    h.setNow(32_000);
    music = 32;
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    h.setNow(32_000 + INTRO_STALL_MS);
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).toBe(32_000 + INTRO_STALL_MS);
    expect((h.finishedAt() ?? 0) - 32_000).toBeLessThanOrEqual(1000);
  });

  it('finishes as soon as music that had been playing ends or is interrupted', () => {
    let music: number | null = 0;
    const h = harness({ music: () => music });
    h.intro.start();
    h.setNow(10_000);
    music = 10;
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    h.setNow(10_050);
    music = null;
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).toBe(10_050);
  });

  it('muted music still plays out on the 35s wall clock, then skipIntro', () => {
    const h = harness({ music: () => null });
    h.intro.start();
    h.setNow(34_000);
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    h.setNow(35_000);
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).toBe(35_000);
  });

  it('does not treat a stall as ended while AudioContext is suspended', () => {
    let music = 0;
    let state = 'running';
    const h = harness({ music: () => music });
    h.intro.setAudioState(() => state);
    h.intro.start();
    h.setNow(5_000);
    music = 5;
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    state = 'suspended';
    h.setNow(5_000 + INTRO_STALL_MS);
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    state = 'running';
    h.setNow(5_000 + INTRO_STALL_MS + 50);
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
  });

  it('blocked music (missing/failed bed) still ends on the 35s wall clock', () => {
    const h = harness();
    h.intro.setTimeSource(() => {
      throw new Error('Failed to fetch music_intro');
    });
    h.intro.start();
    h.setNow(20_000);
    h.tick();
    expect(h.intro.isFinished()).toBe(false);
    h.setNow(35_000);
    h.tick();
    expect(h.intro.isFinished()).toBe(true);
    expect(h.finishedAt()).toBe(35_000);
  });
});
