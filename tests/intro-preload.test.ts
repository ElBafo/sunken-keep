import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntroPlayer } from '../src/proto3d/intro';
import type { StoryText } from '../src/proto3d/i18n';

type Hold = { resolve: () => void };

const holds = new Map<string, Hold[]>();

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    const name = value.split('/').pop() ?? value;
    const waiters = holds.get(name);
    const fire = () => this.onload?.();
    if (waiters) waiters.push({ resolve: fire });
    else queueMicrotask(fire);
  }
  get src() {
    return this._src;
  }
}

function release(name: string) {
  const waiters = holds.get(name) ?? [];
  holds.delete(name);
  for (const w of waiters) w.resolve();
}

function stubCanvas() {
  return { getContext: () => ({}) } as unknown as HTMLCanvasElement;
}

function stubStory(): StoryText {
  return { log: (key: string) => key } as unknown as StoryText;
}

describe('IntroPlayer preload', () => {
  afterEach(() => {
    holds.clear();
    vi.unstubAllGlobals();
  });

  it('resolves whenShot1 as soon as shot 1 lands, without waiting for later shots', async () => {
    holds.set('shot1_keep.png', []);
    holds.set('shot2_sinking.png', []);
    vi.stubGlobal('Image', FakeImage);
    const intro = new IntroPlayer(stubCanvas(), stubStory());
    intro.preload();
    expect(intro.hasShot(0)).toBe(false);
    let shot1Ready = false;
    const shot1 = intro.whenShot1().then(() => {
      shot1Ready = true;
    });
    await Promise.resolve();
    expect(shot1Ready).toBe(false);
    release('shot1_keep.png');
    await shot1;
    expect(shot1Ready).toBe(true);
    expect(intro.hasShot(0)).toBe(true);
    expect(intro.hasShot(1)).toBe(false);
  });

  it('start() is a no-op the second time', () => {
    vi.stubGlobal('Image', FakeImage);
    const raf = vi.fn().mockReturnValue(1);
    vi.stubGlobal('requestAnimationFrame', raf);
    const intro = new IntroPlayer(stubCanvas(), stubStory());
    intro.start();
    expect(intro.hasStarted()).toBe(true);
    const calls = raf.mock.calls.length;
    intro.start();
    expect(raf.mock.calls.length).toBe(calls);
  });

  it('skip before start still blocks a later start', () => {
    vi.stubGlobal('Image', FakeImage);
    const raf = vi.fn().mockReturnValue(1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const intro = new IntroPlayer(stubCanvas(), stubStory());
    intro.skip();
    intro.start();
    expect(intro.hasStarted()).toBe(true);
    expect(intro.isFinished()).toBe(true);
    expect(raf).not.toHaveBeenCalled();
  });
});
