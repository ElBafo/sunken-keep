import { describe, expect, it } from 'vitest';
import spec from '../public/proto3d/camera.json';
import {
  CAMERA_FOV,
  CAMERA_VIEW_ASPECT
} from '../src/voxel-floor1/constants';
import {
  AIR_SAFE_BOTTOM,
  AIR_SAFE_TOP,
  CAMERA_HFOV_DEG,
  TAP_MIN_PT,
  horizontalFov,
  layoutTapTargets,
  measurePortraitLayout,
  overlayRects,
  rectsOverlap,
  rectsTouchSafe,
  verticalFovForAspect,
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
      log: [6, 696, 271, 744],
      logMaxChars: 20,
      open: [162, 640, 258, 684],
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
      log: [6, 644, 244, 692],
      logMaxChars: 18,
      open: [148, 588, 244, 632],
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
      expect(rectsOverlap(layout.log, layout.pad)).toBe(false);
      expect(rectsOverlap(layout.open, layout.pad)).toBe(false);
      expect(rectsOverlap(layout.open, layout.log)).toBe(false);
      expect(layout.pad.y + layout.pad.h).toBeLessThanOrEqual(layout.view.y + layout.view.h);
      expect(layout.log.y + layout.log.h).toBeLessThanOrEqual(layout.view.y + layout.view.h);
    }
    expect(air.pad.y).toBeGreaterThanOrEqual(544);
    expect(phone.pad.y).toBeGreaterThanOrEqual(509);
  });
});
