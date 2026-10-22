import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import spec from '../public/proto3d/camera.json';
import logEn from '../public/log.json';
import logEl from '../public/story/el/log.el.json';
import {
  CAMERA_FOV,
  CAMERA_VIEW_ASPECT
} from '../src/voxel-floor1/constants';
import { TORCH_CAPPED_PROMPT } from '../src/voxel-floor1/fixtures';
import {
  AIR_SAFE_BOTTOM,
  AIR_SAFE_TOP,
  CAMERA_HFOV_DEG,
  OPEN_ABOVE_PAD,
  OPEN_H,
  OPEN_W,
  TAP_MIN_PT,
  horizontalFov,
  layoutTapTargets,
  logVisibleSlice,
  logVisibleWindow,
  measurePortraitLayout,
  nextLogScrollFromBottom,
  overlayRects,
  parsePartyQuery,
  portraitFile,
  portraitState,
  rectsOverlap,
  rectsTouchSafe,
  verticalFovForAspect,
  visibleLogLineCount,
  wrapLogMessage,
  allPortraitFiles,
  PORTRAIT_DIR,
  type PortraitLayout,
  type Rect
} from '../src/voxel-floor1/portrait-layout';

function box(r: Rect): [number, number, number, number] {
  return [r.x, r.y, r.x + r.w, r.y + r.h];
}

function expectBox(r: Rect, expected: [number, number, number, number], label: string) {
  expect(box(r), label).toEqual(expected);
}

function assertOptionA(layout: PortraitLayout, expected: {
  W: number;
  H: number;
  view: [number, number, number, number];
  viewUsable: [number, number];
  strip: [number, number, number, number];
  portraits: Array<[string, number, number, number]>;
  log: [number, number, number, number];
  logMaxChars: number;
  open: [number, number, number, number];
  compass: [number, number, number, number];
  pad: [number, number, number, number];
}) {
  expect(layout.cssW).toBe(expected.W);
  expect(layout.cssH).toBe(expected.H);
  expectBox(layout.view, expected.view, 'view');
  expect(layout.usable.y0).toBe(expected.viewUsable[0]);
  expect(layout.usable.y1).toBe(expected.viewUsable[1]);
  expect(layout.usable.h).toBe(expected.viewUsable[1] - expected.viewUsable[0]);
  expectBox(layout.strip, expected.strip, 'strip');
  expect(layout.portraits.map((p) => [p.id, p.rect.x, p.rect.w, p.rect.h])).toEqual(expected.portraits);
  expectBox(layout.log, expected.log, 'log');
  expect(layout.logMaxChars).toBe(expected.logMaxChars);
  expectBox(layout.open, expected.open, 'open');
  expectBox(layout.compass, expected.compass, 'compass');
  expectBox(layout.pad, expected.pad, 'pad');
}

describe('voxel-floor1 Option A portrait layout maths', () => {
  const air = measurePortraitLayout(420, 912, {
    top: AIR_SAFE_TOP,
    right: 0,
    bottom: AIR_SAFE_BOTTOM,
    left: 0
  });
  const phone = measurePortraitLayout(393, 852, {
    top: AIR_SAFE_TOP,
    right: 0,
    bottom: AIR_SAFE_BOTTOM,
    left: 0
  });

  it('matches the 420×912 Option A mock (iPhone Air)', () => {
    assertOptionA(air, {
      W: 420,
      H: 912,
      view: [0, 0, 420, 750],
      viewUsable: [59, 750],
      strip: [0, 750, 420, 878],
      portraits: [
        ['brannoc', 0, 105, 128],
        ['wren', 105, 105, 128],
        ['ilsevar', 210, 105, 128],
        ['mags', 315, 105, 128]
      ],
      log: [6, 653, 271, 744],
      logMaxChars: 20,
      open: [297, 603, 393, 647],
      compass: [188, 63, 232, 107],
      pad: [276, 653, 414, 744]
    });
    expect(air.homeBand).toEqual({ x: 0, y: 878, w: 420, h: 34 });
  });

  it('matches the 393×852 Option A mock (iPhone 15)', () => {
    assertOptionA(phone, {
      W: 393,
      H: 852,
      view: [0, 0, 393, 698],
      viewUsable: [59, 698],
      strip: [0, 698, 393, 818],
      portraits: [
        ['brannoc', 0, 98, 120],
        ['wren', 98, 98, 120],
        ['ilsevar', 196, 99, 120],
        ['mags', 295, 98, 120]
      ],
      log: [6, 601, 244, 692],
      logMaxChars: 18,
      open: [270, 551, 366, 595],
      compass: [174, 63, 218, 107],
      pad: [249, 601, 387, 692]
    });
    expect(phone.homeBand).toEqual({ x: 0, y: 818, w: 393, h: 34 });
  });

  it.each([
    ['iPhone Air 420×912', air],
    ['iPhone 15 393×852', phone]
  ] as const)('keeps tap targets ≥ 44 pt on %s', (_name, layout) => {
    const under = layoutTapTargets(layout).filter((t) => t.rect.w < TAP_MIN_PT || t.rect.h < TAP_MIN_PT);
    expect(under).toEqual([]);
  });

  it.each([
    ['iPhone Air 420×912', air],
    ['iPhone 15 393×852', phone]
  ] as const)('keeps chrome and overlays out of the safe bands on %s', (_name, layout) => {
    const hits = overlayRects(layout).filter((t) => {
      if (t.name === 'strip') {
        return t.rect.y < layout.safe.top || t.rect.y + t.rect.h > layout.cssH - layout.safe.bottom;
      }
      return rectsTouchSafe(t.rect, layout.safe, layout.cssW, layout.cssH);
    });
    expect(hits).toEqual([]);
    expect(layout.homeBand.h).toBe(layout.safe.bottom);
    expect(layout.strip.y + layout.strip.h).toBe(layout.cssH - layout.safe.bottom);
    for (const p of layout.portraits) {
      expect(p.handMain.tap.y).toBeGreaterThanOrEqual(layout.strip.y);
      expect(p.handOff.tap.y + p.handOff.tap.h).toBeLessThanOrEqual(layout.strip.y + layout.strip.h);
    }
  });

  it.each([
    ['iPhone Air 420×912', air],
    ['iPhone 15 393×852', phone]
  ] as const)('keeps horizontal FOV at 61.61° on %s', (_name, layout) => {
    expect(layout.projection.hfov).toBeCloseTo(CAMERA_HFOV_DEG, 5);
    expect(horizontalFov(layout.projection.vfov, layout.projection.aspect)).toBeCloseTo(CAMERA_HFOV_DEG, 5);
    expect(layout.projection.hfov).not.toBe(CAMERA_FOV);
    expect(layout.projection.aspect).toBeCloseTo(layout.view.w / layout.usable.h, 8);
    expect(layout.projection.viewOffset.y).toBe(-layout.safe.top);
    expect(layout.projection.viewOffset.h).toBe(layout.view.h);
  });

  it('does not change Classic 270×380 vertical FOV when the aspect is unchanged', () => {
    expect(CAMERA_VIEW_ASPECT).toBeCloseTo(270 / 380, 8);
    expect(verticalFovForAspect(CAMERA_VIEW_ASPECT)).toBeCloseTo(spec.fov, 2);
    expect(horizontalFov(spec.fov, CAMERA_VIEW_ASPECT)).toBeCloseTo(CAMERA_HFOV_DEG, 2);
  });

  it('puts MP bars only on Wren and Ilsevar, and keeps pad/log/open off the d1 floor', () => {
    for (const layout of [air, phone]) {
      const byId = Object.fromEntries(layout.portraits.map((p) => [p.id, p]));
      expect(byId.brannoc.bars.mp).toBeNull();
      expect(byId.mags.bars.mp).toBeNull();
      expect(byId.wren.bars.mp).not.toBeNull();
      expect(byId.ilsevar.bars.mp).not.toBeNull();
      expect(layout.log.y).toBe(layout.pad.y);
      expect(layout.log.h).toBe(layout.pad.h);
      expect(layout.log.y + layout.log.h).toBe(layout.pad.y + layout.pad.h);
      expect(layout.log.x + layout.log.w + 5).toBe(layout.pad.x);
      expect(layout.open.w).toBe(OPEN_W);
      expect(layout.open.h).toBe(OPEN_H);
      expect(layout.open.x).toBe(Math.floor(layout.pad.x + (layout.pad.w - OPEN_W) / 2));
      expect(layout.open.y + layout.open.h + OPEN_ABOVE_PAD).toBe(layout.pad.y);
      expect(rectsOverlap(layout.log, layout.pad)).toBe(false);
      expect(rectsOverlap(layout.open, layout.pad)).toBe(false);
      expect(rectsOverlap(layout.open, layout.log)).toBe(false);
      expect(layout.pad.y + layout.pad.h).toBeLessThanOrEqual(layout.view.y + layout.view.h);
      expect(layout.log.y + layout.log.h).toBeLessThanOrEqual(layout.view.y + layout.view.h);
    }
    const overlays = ['menu', 'bag', 'compass', 'oil', 'open', 'log', 'pad'] as const;
    for (const layout of [air, phone]) {
      const named = Object.fromEntries(overlayRects(layout).map((t) => [t.name, t.rect]));
      for (let i = 0; i < overlays.length; i++) {
        for (let j = i + 1; j < overlays.length; j++) {
          expect(rectsOverlap(named[overlays[i]], named[overlays[j]]), `${overlays[i]} vs ${overlays[j]}`).toBe(false);
        }
      }
    }
    // d1 floor band bottoms from the Option A mock (flask sits on/above that band).
    expect(air.pad.y).toBeGreaterThanOrEqual(544);
    expect(phone.pad.y).toBeGreaterThanOrEqual(509);
    expect(air.open.y).toBeGreaterThanOrEqual(544);
    expect(phone.open.y).toBeGreaterThanOrEqual(509);
  });
});

type LogRow = { text?: string; lines?: string[] };

function existingLogMessages(): string[] {
  const rows = [...(logEn as LogRow[]), ...(logEl as LogRow[])];
  const out: string[] = [];
  for (const row of rows) {
    if (typeof row.text === 'string') out.push(row.text);
    if (Array.isArray(row.lines)) out.push(...row.lines);
  }
  out.push(TORCH_CAPPED_PROMPT);
  return out;
}

function longestExistingLogMessage(): string {
  return existingLogMessages().reduce((best, text) => (text.length > best.length ? text : best), '');
}

describe('fixed pad-height message log keeps full game text', () => {
  it('word-wraps the longest existing message at 393 wide without shortening it', () => {
    const phone = measurePortraitLayout(393, 852, {
      top: AIR_SAFE_TOP,
      right: 0,
      bottom: AIR_SAFE_BOTTOM,
      left: 0
    });
    const msg = longestExistingLogMessage();
    expect(msg.length).toBeGreaterThan(phone.logMaxChars);
    const lines = wrapLogMessage(msg, phone.logMaxChars);
    expect(lines.join('')).not.toMatch(/\.\.\.|…/);
    expect(lines.join('').replace(/\s+/g, '')).toBe(msg.replace(/\s+/g, ''));
    expect(lines.join(' ').split(/\s+/).filter(Boolean)).toEqual(msg.split(/\s+/).filter(Boolean));
    expect(lines.every((line) => line.length <= phone.logMaxChars)).toBe(true);

    const visible = visibleLogLineCount(phone.log.h);
    expect(phone.log.h).toBe(phone.pad.h);
    expect(visible).toBe(3);
    expect(lines.length).toBeLessThanOrEqual(visible);
    expect(logVisibleSlice(lines, visible, 0)).toEqual(lines);
  });

  it('shows the last lines of a taller wrap and pages older lines on tap', () => {
    const phone = measurePortraitLayout(393, 852, {
      top: AIR_SAFE_TOP,
      right: 0,
      bottom: AIR_SAFE_BOTTOM,
      left: 0
    });
    const visible = visibleLogLineCount(phone.log.h);
    const messages = existingLogMessages()
      .filter((text) => text.length > phone.logMaxChars)
      .slice(0, 3);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const oneMessage = wrapLogMessage(messages.join(' '), phone.logMaxChars);
    expect(oneMessage.length).toBeGreaterThan(visible);
    expect(logVisibleSlice(oneMessage, visible, 0)).toEqual(oneMessage.slice(oneMessage.length - visible));

    const lines = messages.flatMap((text) => wrapLogMessage(text, phone.logMaxChars));
    expect(lines.length).toBeGreaterThan(visible);
    expect(lines.join('')).not.toMatch(/\.\.\.|…/);

    const newest = logVisibleSlice(lines, visible, 0);
    expect(newest).toEqual(lines.slice(lines.length - visible));
    expect(newest[newest.length - 1]).toBe(lines[lines.length - 1]);

    const afterTap = nextLogScrollFromBottom(lines.length, visible, 0);
    expect(afterTap).toBeGreaterThan(0);
    const older = logVisibleSlice(lines, visible, afterTap);
    expect(older[0]).toBe(lines[logVisibleWindow(lines.length, visible, afterTap).start]);
    expect(older.join('')).not.toBe(newest.join(''));

    let scroll = 0;
    const seen: string[] = [];
    const seenSet = new Set<string>();
    for (let i = 0; i < lines.length + 2; i++) {
      for (const line of logVisibleSlice(lines, visible, scroll)) {
        if (!seenSet.has(line)) {
          seenSet.add(line);
          seen.push(line);
        }
      }
      scroll = nextLogScrollFromBottom(lines.length, visible, scroll);
    }
    expect(seen.sort()).toEqual([...lines].sort());
    expect(scroll).toBe(0);
  });
});

function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('voxel-floor1 expressive portrait states', () => {
  it('picks healthy / hurt / badly_hurt / downed from HP bands', () => {
    expect(portraitState(100, 100)).toBe('healthy');
    expect(portraitState(67, 100)).toBe('healthy');
    expect(portraitState(66, 100)).toBe('hurt');
    expect(portraitState(50, 100)).toBe('hurt');
    expect(portraitState(34, 100)).toBe('hurt');
    expect(portraitState(33, 100)).toBe('badly_hurt');
    expect(portraitState(1, 100)).toBe('badly_hurt');
    expect(portraitState(0, 100)).toBe('downed');
    expect(portraitState(100, 100, true)).toBe('downed');
  });

  it('uses 105×128 art at 400+ wide and 98×120 art below that', () => {
    expect(portraitFile('wren', 'hurt', 420)).toBe('wren_hurt.png');
    expect(portraitFile('wren', 'hurt', 400)).toBe('wren_hurt.png');
    expect(portraitFile('mags', 'downed', 393)).toBe('mags_downed_393.png');
    expect(allPortraitFiles()).toHaveLength(32);
  });

  it('keeps all 32 voxel-only portraits at the locked frame sizes', () => {
    const dir = resolve(__dirname, `../public/${PORTRAIT_DIR}`);
    for (const file of allPortraitFiles()) {
      const path = resolve(dir, file);
      expect(existsSync(path), file).toBe(true);
      const size = pngSize(readFileSync(path));
      if (file.endsWith('_393.png')) expect(size, file).toEqual({ w: 98, h: 120 });
      else expect(size, file).toEqual({ w: 105, h: 128 });
    }
  });

  it('parses ?party=wren:hurt,mags:downed', () => {
    const maxHp = { brannoc: 45, wren: 32, ilsevar: 24, mags: 28 };
    const party = parsePartyQuery('?party=wren:hurt,mags:downed', maxHp);
    expect(portraitState(party.wren!.hp, maxHp.wren, party.wren!.downed)).toBe('hurt');
    expect(portraitState(party.mags!.hp, maxHp.mags, party.mags!.downed)).toBe('downed');
    expect(party.brannoc).toBeUndefined();
  });
});
