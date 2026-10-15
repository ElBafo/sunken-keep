import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameStageScale, isCompactViewport } from '../src/proto3d/game-stage';
import {
  hudScaleFor,
  IPHONE15,
  iphone15LandscapeEdge,
  iphone15PortraitEdge,
  LAYOUT_STORAGE_KEY,
  layoutFromSearch,
  loadSavedLayoutMode,
  measureEdgeLayout,
  notePageCssSize,
  saveLayoutMode,
  syncLayoutQuery
} from '../src/proto3d/phone-layout';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k)
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('layout preference', () => {
  it('defaults to framed and stays framed without a query or save', () => {
    stubStorage();
    expect(layoutFromSearch(new URLSearchParams(''), true)).toBe('framed');
    expect(layoutFromSearch(new URLSearchParams('fx=0'), true)).toBe('framed');
    expect(loadSavedLayoutMode()).toBeNull();
  });

  it('opts in with ?layout=edge and persists', () => {
    const store = stubStorage();
    expect(layoutFromSearch(new URLSearchParams('layout=edge'), true)).toBe('edge');
    expect(store.get(LAYOUT_STORAGE_KEY)).toBe('edge');
    expect(layoutFromSearch(new URLSearchParams(''), true)).toBe('edge');
  });

  it('lets ?layout=framed override a saved edge preference', () => {
    stubStorage();
    saveLayoutMode('edge');
    expect(layoutFromSearch(new URLSearchParams('layout=framed'), true)).toBe('framed');
    expect(loadSavedLayoutMode()).toBe('framed');
  });

  it('does not write storage when persist is off', () => {
    const store = stubStorage();
    expect(layoutFromSearch(new URLSearchParams('layout=edge'), false)).toBe('edge');
    expect(store.size).toBe(0);
  });

  it('syncs the URL query so Loukas can bookmark the prototype', () => {
    const edge = syncLayoutQuery('edge', new URL('https://example.test/sunken-keep/?test=1'));
    expect(edge.searchParams.get('layout')).toBe('edge');
    expect(edge.searchParams.get('test')).toBe('1');
    const framed = syncLayoutQuery('framed', edge);
    expect(framed.searchParams.has('layout')).toBe(false);
    expect(framed.searchParams.get('test')).toBe('1');
  });
});

describe('framed 270×585 scale is unchanged', () => {
  it('still uses a fractional contain scale on phones and whole-number scale on desktop', () => {
    expect(isCompactViewport(393, 852)).toBe(true);
    expect(gameStageScale(393, 852)).toBeCloseTo(393 / 270, 5);
    expect(gameStageScale(1280, 800)).toBe(1);
    expect(gameStageScale(1920, 1200)).toBe(2);
  });
});

describe('iPhone 15 edge layout metrics', () => {
  it('reports portrait CSS / device sizes for the artist', () => {
    const m = iphone15PortraitEdge();
    expect(m.safe).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(m.content).toEqual({ x: 0, y: 59, w: 393, h: 759 });
    expect(m.hudScale).toBe(1);
    expect(m.hudIntegerScale).toBe(true);
    expect(m.overlayHud).toBe(false);
    expect(m.view).toEqual({ x: 0, y: 59, w: 393, h: 554 });
    expect(m.hud).toEqual({ x: 62, y: 613, w: 270, h: 205 });
    expect(m.render).toEqual({ w: 270, h: 381 });
    expect(m.device.view).toEqual({ w: 1179, h: 1662 });
    expect(m.device.hud).toEqual({ w: 810, h: 615 });
    expect(m.device.safe).toEqual({ top: 177, right: 0, bottom: 102, left: 0 });
    expect(m.view.w).toBe(IPHONE15.cssW);
    expect(m.view.h).toBeGreaterThan(380);
  });

  it('keeps landscape usable without overlaying the HUD', () => {
    const m = iphone15LandscapeEdge();
    expect(m.safe).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
    expect(m.content.w).toBe(734);
    expect(m.content.h).toBe(372);
    expect(m.view.h).toBeGreaterThanOrEqual(120);
    expect(m.hud.h).toBe(205);
    expect(m.overlayHud).toBe(false);
    expect(m.render.w).toBe(270);
    expect(m.render.h).toBeGreaterThan(0);
  });

  it('overlays the HUD only when the remaining view would be too short', () => {
    const tight = hudScaleFor(400, 200);
    expect(tight.overlay).toBe(true);
    expect(tight.scale).toBeGreaterThan(0);
    const phone = hudScaleFor(393, 759);
    expect(phone).toEqual({ scale: 1, integer: true, overlay: false });
  });

  it('sizes the parchment page for the edge overlay so the artist can repaint', () => {
    const page = notePageCssSize(393, 852);
    expect(page).toEqual({ w: 362, h: 482 });
    expect(page.w / 240).toBeCloseTo(1.508, 2);
  });
});

describe('measureEdgeLayout stays in the safe content box', () => {
  it('never places the HUD outside the content box', () => {
    const m = measureEdgeLayout(393, 852, IPHONE15.portraitSafe, 3);
    expect(m.hud.x).toBeGreaterThanOrEqual(m.content.x);
    expect(m.hud.x + m.hud.w).toBeLessThanOrEqual(m.content.x + m.content.w);
    expect(m.hud.y + m.hud.h).toBe(m.content.y + m.content.h);
    expect(m.view.y).toBe(m.content.y);
  });
});

describe('html entries expose the prototype toggle', () => {
  const proto = readFileSync(resolve(__dirname, '../proto3d.html'), 'utf8');
  const index = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it.each([
    ['proto3d.html', proto],
    ['index.html', index]
  ] as const)('%s keeps viewport-fit=cover and the settings menu', (_name, html) => {
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('id="settings-overlay"');
    expect(html).toContain('id="btn-layout-edge"');
    expect(html).toMatch(/body\.layout-edge #game-letterbox/);
    expect(html).toContain('--proto-safe-top');
    expect(html).toMatch(/<div id="game-stage">[\s\S]*<\/div>\s*<div id="note-overlay">/);
  });

  it('wires the existing HUD menu button to the layout toggle', () => {
    const hud = readFileSync(resolve(__dirname, '../src/proto3d/party-hud.ts'), 'utf8');
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(hud).toContain("btn-menu");
    expect(hud).toContain('this.onMenu');
    expect(main).toContain('onMenu: () => this.settingsMenu.toggle()');
    expect(main).toContain('layoutFromSearch');
  });
});
