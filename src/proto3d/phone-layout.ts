/** Opt-in edge-to-edge phone layout. Default remains the framed 270×585 stage. */

export type LayoutMode = 'framed' | 'edge';

export const LAYOUT_STORAGE_KEY = 'proto3d.layout';
export const LAYOUT_QUERY = 'layout';

export const PANEL_DESIGN_W = 270;
export const PANEL_DESIGN_H = 205;
export const VIEW_DESIGN_W = 270;
export const VIEW_DESIGN_H = 380;
export const MIN_VIEW_CSS_H = 120;
export const MIN_TAP_PT = 44;

/** iPhone 15 (6.1") CSS viewport and standalone safe areas, in CSS points. */
export const IPHONE15 = {
  cssW: 393,
  cssH: 852,
  dpr: 3,
  portraitSafe: { top: 59, right: 0, bottom: 34, left: 0 },
  landscapeSafe: { top: 0, right: 59, bottom: 21, left: 59 }
} as const;

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EdgeLayoutMeasure {
  cssW: number;
  cssH: number;
  dpr: number;
  safe: SafeInsets;
  content: { x: number; y: number; w: number; h: number };
  view: { x: number; y: number; w: number; h: number };
  hud: { x: number; y: number; w: number; h: number };
  hudScale: number;
  hudIntegerScale: boolean;
  overlayHud: boolean;
  render: { w: number; h: number };
  device: {
    view: { w: number; h: number };
    hud: { w: number; h: number };
    safe: SafeInsets;
  };
}

export function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'framed' || value === 'edge';
}

export function layoutFromSearch(params: URLSearchParams, persist = true): LayoutMode {
  const q = params.get(LAYOUT_QUERY);
  if (isLayoutMode(q)) {
    if (persist) saveLayoutMode(q);
    return q;
  }
  if (persist) {
    const saved = loadSavedLayoutMode();
    if (saved) return saved;
  }
  return 'framed';
}

export function saveLayoutMode(mode: LayoutMode) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    // quota / private mode
  }
}

export function loadSavedLayoutMode(): LayoutMode | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (isLayoutMode(raw)) return raw;
  } catch {
    // ignore
  }
  return null;
}

export function syncLayoutQuery(mode: LayoutMode, url: URL): URL {
  const next = new URL(url.href);
  if (mode === 'edge') next.searchParams.set(LAYOUT_QUERY, 'edge');
  else next.searchParams.delete(LAYOUT_QUERY);
  return next;
}

let currentMode: LayoutMode = 'framed';

export function getLayoutMode(): LayoutMode {
  return currentMode;
}

export function applyLayoutMode(mode: LayoutMode) {
  currentMode = mode;
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('layout-edge', mode === 'edge');
  document.body.classList.toggle('layout-framed', mode === 'framed');
}

export function hudScaleFor(availW: number, availH: number): { scale: number; integer: boolean; overlay: boolean } {
  const widthScale = availW / PANEL_DESIGN_W;
  const dockedRoom = Math.max(0, availH - MIN_VIEW_CSS_H) / PANEL_DESIGN_H;
  const docked = Math.min(widthScale, dockedRoom);
  const whole = Math.floor(docked);
  if (whole >= 1) return { scale: whole, integer: true, overlay: false };
  if (docked >= 0.75) return { scale: docked, integer: false, overlay: false };
  const overlayScale = Math.min(widthScale, availH / PANEL_DESIGN_H);
  const overlayWhole = Math.floor(overlayScale);
  if (overlayWhole >= 1) return { scale: overlayWhole, integer: true, overlay: true };
  return { scale: Math.max(0.5, overlayScale), integer: false, overlay: true };
}

export function measureEdgeLayout(
  cssW: number,
  cssH: number,
  safe: SafeInsets,
  dpr = 3
): EdgeLayoutMeasure {
  const content = {
    x: safe.left,
    y: safe.top,
    w: Math.max(1, cssW - safe.left - safe.right),
    h: Math.max(1, cssH - safe.top - safe.bottom)
  };
  const { scale, integer, overlay } = hudScaleFor(content.w, content.h);
  const hudW = Math.round(PANEL_DESIGN_W * scale);
  const hudH = Math.round(PANEL_DESIGN_H * scale);
  const hudX = content.x + Math.round((content.w - hudW) / 2);
  const hudY = content.y + content.h - hudH;
  const view = overlay
    ? { x: content.x, y: content.y, w: content.w, h: content.h }
    : { x: content.x, y: content.y, w: content.w, h: Math.max(1, content.h - hudH) };
  const renderH = Math.max(1, Math.round((VIEW_DESIGN_W * view.h) / Math.max(1, view.w)));
  const render = { w: VIEW_DESIGN_W, h: renderH };
  const toDevice = (n: number) => Math.round(n * dpr);
  return {
    cssW,
    cssH,
    dpr,
    safe,
    content,
    view,
    hud: { x: hudX, y: hudY, w: hudW, h: hudH },
    hudScale: scale,
    hudIntegerScale: integer,
    overlayHud: overlay,
    render,
    device: {
      view: { w: toDevice(view.w), h: toDevice(view.h) },
      hud: { w: toDevice(hudW), h: toDevice(hudH) },
      safe: {
        top: toDevice(safe.top),
        right: toDevice(safe.right),
        bottom: toDevice(safe.bottom),
        left: toDevice(safe.left)
      }
    }
  };
}

export function iphone15PortraitEdge(): EdgeLayoutMeasure {
  return measureEdgeLayout(IPHONE15.cssW, IPHONE15.cssH, IPHONE15.portraitSafe, IPHONE15.dpr);
}

export function iphone15LandscapeEdge(): EdgeLayoutMeasure {
  return measureEdgeLayout(IPHONE15.cssH, IPHONE15.cssW, IPHONE15.landscapeSafe, IPHONE15.dpr);
}

export function notePageCssSize(overlayW: number, overlayH: number, ratio = 0.92): { w: number; h: number } {
  const pageW = 240;
  const pageH = 320;
  const maxW = Math.max(1, overlayW * ratio);
  const maxH = Math.max(1, overlayH * ratio);
  const aspect = pageW / pageH;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}
