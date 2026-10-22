import type { PerspectiveCamera } from 'three';

/** Horizontal FOV of the Classic 270×380 / 80° vertical view. Kept on the new taller canvas. */
export const CAMERA_HFOV_DEG = 61.61;
export const TAP_MIN_PT = 44;

export const REF_W = 420;
export const REF_H = 912;
export const REF_STRIP_H = 128;
export const IPHONE15_W = 393;
export const IPHONE15_H = 852;
export const AIR_SAFE_TOP = 59;
export const AIR_SAFE_BOTTOM = 34;

export const HAND_VISUAL = 26;
export const HAND_INSET = 3;
export const HAND_TAP = 44;

export const BAR_BOX = 6;
export const BAR_INSET_L = 3;
export const BAR_INSET_R = 4;
export const BAR_FROM_BOTTOM = 3;
export const BAR_GRADIENT_H = 22;

export const CHROME_SIZE = 44;
export const CHROME_INSET = 6;
export const CHROME_GAP = 4;
export const CHROME_BELOW_SAFE = 4;
export const COMPASS_ICON = 42;

export const OPEN_W = 96;
export const OPEN_H = 44;
/** Gap between the Open button's bottom edge and the pad's top edge. */
export const OPEN_ABOVE_PAD = 6;

export const LOG_MARGIN = 6;
export const LOG_INNER = 8;
export const LOG_PAD_GAP = 5;
export const FONT_ADVANCE = 12;
export const LINE_PITCH = 20;

export const PAD_BTN = 44;
export const PAD_GAP = 3;
export const PAD_MARGIN = 6;
export const PAD_COLS = 3;
export const PAD_ROWS = 2;

export const BRONZE_LINE = '#8a6a32';
export const HP_FILL = '#c8281e';
export const MP_FILL = '#2a5aaa';
export const BAR_OUTLINE = '#1a1210';

export const HERO_IDS = ['brannoc', 'wren', 'ilsevar', 'mags'] as const;
export type HudHeroId = (typeof HERO_IDS)[number];

export const MANA_HEROES: ReadonlySet<HudHeroId> = new Set(['wren', 'ilsevar']);

export const HERO_DISPLAY: Record<HudHeroId, string> = {
  brannoc: 'Brannoc',
  wren: 'Wren',
  ilsevar: 'Ilsevar',
  mags: 'Mags'
};

export const PORTRAIT_STATES = ['healthy', 'hurt', 'badly_hurt', 'downed'] as const;
export type PortraitState = (typeof PORTRAIT_STATES)[number];

/** Voxel-only portrait folder. Wide art is 105×128; `_393` is 98×120. */
export const PORTRAIT_DIR = 'voxel-floor1/portraits';
export const PORTRAIT_WIDE_MIN = 400;
/** Healthy is strictly above 66%. 66% and below is hurt. */
export const PORTRAIT_HURT_MAX = 0.66;
/** Badly hurt is 1–33%. Anything above that through 66% is hurt. */
export const PORTRAIT_BADLY_HURT_MAX = 0.33;

export function portraitState(hp: number, maxHp: number, downed = false): PortraitState {
  if (downed || hp <= 0) return 'downed';
  const pct = hp / Math.max(1, maxHp);
  if (pct <= PORTRAIT_BADLY_HURT_MAX) return 'badly_hurt';
  if (pct <= PORTRAIT_HURT_MAX) return 'hurt';
  return 'healthy';
}

export function portraitFile(id: HudHeroId, state: PortraitState, cssW: number): string {
  const suffix = cssW < PORTRAIT_WIDE_MIN ? '_393' : '';
  return `${id}_${state}${suffix}.png`;
}

export function portraitRelPath(id: HudHeroId, state: PortraitState, cssW: number): string {
  return `${PORTRAIT_DIR}/${portraitFile(id, state, cssW)}`;
}

export function allPortraitFiles(): string[] {
  const out: string[] = [];
  for (const id of HERO_IDS) {
    for (const state of PORTRAIT_STATES) {
      out.push(`${id}_${state}.png`);
      out.push(`${id}_${state}_393.png`);
    }
  }
  return out;
}

export type PartyHpOverride = { hp: number; downed: boolean };

export function hpForPortraitState(state: PortraitState, maxHp: number): PartyHpOverride {
  if (state === 'downed') return { hp: 0, downed: true };
  if (state === 'badly_hurt') return { hp: Math.max(1, Math.round(maxHp * 0.2)), downed: false };
  if (state === 'hurt') return { hp: Math.round(maxHp * 0.5), downed: false };
  return { hp: maxHp, downed: false };
}

/** `?party=wren:hurt,mags:downed` or `?party=wren:16,mags:0`. */
export function parsePartyQuery(
  search: string,
  maxHp: Record<HudHeroId, number>
): Partial<Record<HudHeroId, PartyHpOverride>> {
  const raw = new URLSearchParams(search).get('party');
  if (!raw) return {};
  const out: Partial<Record<HudHeroId, PartyHpOverride>> = {};
  for (const part of raw.split(',')) {
    const [idRaw, specRaw] = part.split(':');
    const id = idRaw?.trim() as HudHeroId;
    const spec = specRaw?.trim();
    if (!id || !spec || !HERO_IDS.includes(id)) continue;
    if ((PORTRAIT_STATES as readonly string[]).includes(spec)) {
      out[id] = hpForPortraitState(spec as PortraitState, maxHp[id]);
      continue;
    }
    const n = Number(spec);
    if (!Number.isFinite(n)) continue;
    const hp = Math.max(0, Math.min(maxHp[id], Math.round(n)));
    out[id] = { hp, downed: hp <= 0 };
  }
  return out;
}

export const PAD_KEYS = ['turn_left', 'forward', 'turn_right', 'strafe_left', 'back', 'strafe_right'] as const;
export type PadKey = (typeof PAD_KEYS)[number];

export type Rect = { x: number; y: number; w: number; h: number };

export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export type PortraitBars = { hp: Rect; mp: Rect | null; gradient: Rect };

export type PortraitCell = {
  id: HudHeroId;
  rect: Rect;
  hasMana: boolean;
  bars: PortraitBars;
  handMain: { visual: Rect; tap: Rect };
  handOff: { visual: Rect; tap: Rect };
  sheetTap: Rect;
};

export type PadButtons = Record<PadKey, Rect>;

export type ViewProjection = {
  aspect: number;
  vfov: number;
  hfov: number;
  viewOffset: { fullW: number; fullH: number; x: number; y: number; w: number; h: number };
};

export type PortraitLayout = {
  cssW: number;
  cssH: number;
  safe: SafeInsets;
  view: Rect;
  usable: { y0: number; y1: number; h: number };
  strip: Rect;
  homeBand: Rect;
  portraits: PortraitCell[];
  log: Rect;
  logMaxChars: number;
  open: Rect;
  compass: Rect;
  menu: Rect;
  bag: Rect;
  oil: Rect;
  pad: Rect;
  padButtons: PadButtons;
  projection: ViewProjection;
};

const PAD_ORDER: PadKey[] = [
  'turn_left',
  'forward',
  'turn_right',
  'strafe_left',
  'back',
  'strafe_right'
];

export function portraitWidths(width: number): [number, number, number, number] {
  const base = Math.floor(width / 4);
  const rem = width - base * 4;
  const widths: [number, number, number, number] = [base, base, base, base];
  // Remainder goes to the centre-right first so 393 → 98, 98, 99, 98.
  const order = [2, 1, 3, 0];
  for (let i = 0; i < rem; i++) widths[order[i]] += 1;
  return widths;
}

export function stripHeight(width: number): number {
  const w = Math.min(Math.max(width, 320), REF_W);
  return Math.round((REF_STRIP_H * w) / REF_W);
}

export function verticalFovForAspect(aspect: number): number {
  const hfov = (CAMERA_HFOV_DEG * Math.PI) / 180;
  return ((2 * Math.atan(Math.tan(hfov / 2) / Math.max(1e-6, aspect))) * 180) / Math.PI;
}

export function horizontalFov(vfovDeg: number, aspect: number): number {
  const vfov = (vfovDeg * Math.PI) / 180;
  return ((2 * Math.atan(Math.tan(vfov / 2) * aspect)) * 180) / Math.PI;
}

export function viewProjection(viewW: number, viewH: number, safeTop: number): ViewProjection {
  const usableH = Math.max(1, viewH - Math.max(0, safeTop));
  const aspect = viewW / usableH;
  const vfov = verticalFovForAspect(aspect);
  return {
    aspect,
    vfov,
    hfov: CAMERA_HFOV_DEG,
    viewOffset: {
      fullW: viewW,
      fullH: usableH,
      x: 0,
      y: -Math.max(0, safeTop),
      w: viewW,
      h: viewH
    }
  };
}

export function applyCameraProjection(camera: PerspectiveCamera, projection: ViewProjection): void {
  camera.fov = projection.vfov;
  camera.aspect = projection.aspect;
  const o = projection.viewOffset;
  // Identity offset (no notch) must not stay in a previous overscan crop.
  if (o.y === 0 && o.h === o.fullH && o.x === 0 && o.w === o.fullW) {
    camera.clearViewOffset();
  } else {
    camera.setViewOffset(o.fullW, o.fullH, o.x, o.y, o.w, o.h);
  }
  camera.updateProjectionMatrix();
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function fromBox(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function rectsTouchSafe(r: Rect, safe: SafeInsets, cssW: number, cssH: number): boolean {
  if (r.y < safe.top) return true;
  if (r.y + r.h > cssH - safe.bottom) return true;
  if (r.x < safe.left) return true;
  if (r.x + r.w > cssW - safe.right) return true;
  return false;
}

export function tapOk(r: Rect, min = TAP_MIN_PT): boolean {
  return r.w >= min && r.h >= min;
}

function barsForPortrait(x: number, y: number, w: number, h: number, hasMana: boolean): PortraitBars {
  const barW = Math.max(1, w - BAR_INSET_L - BAR_INSET_R);
  const hpOnly = !hasMana;
  const hpY = y + (hpOnly ? h - 9 : h - 15);
  const mpY = y + h - 9;
  return {
    gradient: rect(x, y + h - BAR_GRADIENT_H, w, BAR_GRADIENT_H),
    hp: rect(x + BAR_INSET_L, hpY, barW, BAR_BOX),
    mp: hasMana ? rect(x + BAR_INSET_L, mpY, barW, BAR_BOX) : null
  };
}

function handsForPortrait(
  x: number,
  y: number,
  w: number
): { handMain: PortraitCell['handMain']; handOff: PortraitCell['handOff'] } {
  return {
    handMain: {
      visual: rect(x + HAND_INSET, y + HAND_INSET, HAND_VISUAL, HAND_VISUAL),
      tap: rect(x, y, HAND_TAP, HAND_TAP)
    },
    handOff: {
      visual: rect(x + w - HAND_INSET - HAND_VISUAL, y + HAND_INSET, HAND_VISUAL, HAND_VISUAL),
      tap: rect(x + w - HAND_TAP, y, HAND_TAP, HAND_TAP)
    }
  };
}

export function measurePortraitLayout(
  cssW: number,
  cssH: number,
  safe: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
): PortraitLayout {
  const W = Math.max(1, Math.round(cssW));
  const H = Math.max(1, Math.round(cssH));
  const stripH = stripHeight(W);
  const viewH = Math.max(1, H - safe.bottom - stripH);
  const view = rect(0, 0, W, viewH);
  const usableH = Math.max(1, viewH - safe.top);
  const strip = rect(0, viewH, W, stripH);
  const homeBand = rect(0, viewH + stripH, W, Math.max(0, H - viewH - stripH));

  const widths = portraitWidths(W);
  let px = 0;
  const portraits: PortraitCell[] = HERO_IDS.map((id, i) => {
    const w = widths[i];
    const x = px;
    px += w;
    const hasMana = MANA_HEROES.has(id);
    const cell = rect(x, viewH, w, stripH);
    const hands = handsForPortrait(x, viewH, w);
    return {
      id,
      rect: cell,
      hasMana,
      bars: barsForPortrait(x, viewH, w, stripH, hasMana),
      ...hands,
      sheetTap: cell
    };
  });

  const padW = PAD_COLS * PAD_BTN + (PAD_COLS - 1) * PAD_GAP;
  const padH = PAD_ROWS * PAD_BTN + (PAD_ROWS - 1) * PAD_GAP;
  const pad = rect(W - safe.right - PAD_MARGIN - padW, viewH - PAD_MARGIN - padH, padW, padH);
  const padButtons = {} as PadButtons;
  PAD_ORDER.forEach((key, i) => {
    const col = i % PAD_COLS;
    const row = Math.floor(i / PAD_COLS);
    padButtons[key] = rect(pad.x + col * (PAD_BTN + PAD_GAP), pad.y + row * (PAD_BTN + PAD_GAP), PAD_BTN, PAD_BTN);
  });

  const log = rect(
    LOG_MARGIN + safe.left,
    pad.y,
    Math.max(1, pad.x - LOG_PAD_GAP - (LOG_MARGIN + safe.left)),
    pad.h
  );
  const logMaxChars = Math.max(1, Math.floor((log.w - LOG_INNER * 2) / FONT_ADVANCE));

  const open = rect(
    Math.floor(pad.x + (pad.w - OPEN_W) / 2),
    pad.y - OPEN_ABOVE_PAD - OPEN_H,
    OPEN_W,
    OPEN_H
  );

  const chromeY = safe.top + CHROME_BELOW_SAFE;
  const compass = rect(Math.floor((W - CHROME_SIZE) / 2), chromeY, CHROME_SIZE, CHROME_SIZE);
  const menu = rect(safe.left + CHROME_INSET, chromeY, CHROME_SIZE, CHROME_SIZE);
  const bag = rect(menu.x + CHROME_SIZE + CHROME_GAP, chromeY, CHROME_SIZE, CHROME_SIZE);
  const oil = rect(W - safe.right - CHROME_INSET - CHROME_SIZE, chromeY, CHROME_SIZE, CHROME_SIZE);

  return {
    cssW: W,
    cssH: H,
    safe,
    view,
    usable: { y0: safe.top, y1: viewH, h: usableH },
    strip,
    homeBand,
    portraits,
    log,
    logMaxChars,
    open,
    compass,
    menu,
    bag,
    oil,
    pad,
    padButtons,
    projection: viewProjection(view.w, view.h, safe.top)
  };
}

export function layoutTapTargets(layout: PortraitLayout): Array<{ name: string; rect: Rect }> {
  const out: Array<{ name: string; rect: Rect }> = [
    { name: 'menu', rect: layout.menu },
    { name: 'bag', rect: layout.bag },
    { name: 'compass', rect: layout.compass },
    { name: 'oil', rect: layout.oil },
    { name: 'open', rect: layout.open },
    { name: 'log', rect: layout.log }
  ];
  for (const key of PAD_KEYS) out.push({ name: `pad.${key}`, rect: layout.padButtons[key] });
  for (const p of layout.portraits) {
    out.push({ name: `${p.id}.portrait`, rect: p.rect });
    out.push({ name: `${p.id}.handMain`, rect: p.handMain.tap });
    out.push({ name: `${p.id}.handOff`, rect: p.handOff.tap });
  }
  return out;
}

export function overlayRects(layout: PortraitLayout): Array<{ name: string; rect: Rect }> {
  return [
    { name: 'menu', rect: layout.menu },
    { name: 'bag', rect: layout.bag },
    { name: 'compass', rect: layout.compass },
    { name: 'oil', rect: layout.oil },
    { name: 'open', rect: layout.open },
    { name: 'log', rect: layout.log },
    { name: 'pad', rect: layout.pad },
    { name: 'strip', rect: layout.strip }
  ];
}

/** Word-wrap a log line. Every character is kept — no ellipsis, no dropped words. */
export function wrapLogMessage(text: string, maxChars: number): string[] {
  if (maxChars < 1) return text ? [text] : [];
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      if (text.includes('\n')) out.push('');
      continue;
    }
    if (paragraph.length <= maxChars) {
      out.push(paragraph);
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let cur = '';
    for (const part of words) {
      if (!part) continue;
      if (part.length > maxChars && !/^\s+$/.test(part)) {
        if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
        cur = '';
        for (let i = 0; i < part.length; i += maxChars) out.push(part.slice(i, i + maxChars));
        continue;
      }
      const next = cur + part;
      if (next.length <= maxChars) cur = next;
      else {
        if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
        cur = part.replace(/^\s+/, '');
      }
    }
    if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
  }
  return out.length ? out : text ? [text] : [];
}

/** How many wrapped lines fit in the fixed pad-height log box. */
export function visibleLogLineCount(logH: number): number {
  return Math.max(1, Math.floor((logH - LOG_INNER * 2) / LINE_PITCH));
}

/** Window of wrapped lines currently shown: newest at the bottom when scroll is 0. */
export function logVisibleWindow(
  lineCount: number,
  visible: number,
  scrollFromBottom = 0
): { start: number; end: number } {
  if (lineCount <= 0 || visible <= 0) return { start: 0, end: 0 };
  if (lineCount <= visible) return { start: 0, end: lineCount };
  const maxScroll = lineCount - visible;
  const scroll = Math.max(0, Math.min(maxScroll, scrollFromBottom));
  const end = lineCount - scroll;
  return { start: end - visible, end };
}

export function logVisibleSlice(lines: string[], visible: number, scrollFromBottom = 0): string[] {
  const { start, end } = logVisibleWindow(lines.length, visible, scrollFromBottom);
  return lines.slice(start, end);
}

/** Page older lines on tap; wrap back to the newest window after the oldest. */
export function nextLogScrollFromBottom(
  lineCount: number,
  visible: number,
  scrollFromBottom: number
): number {
  if (lineCount <= visible) return 0;
  const maxScroll = lineCount - visible;
  if (scrollFromBottom >= maxScroll) return 0;
  return Math.min(maxScroll, scrollFromBottom + visible);
}

export function parseSafeQuery(search: string): SafeInsets | null {
  const raw = new URLSearchParams(search).get('safe');
  if (!raw) return null;
  const parts = raw.split(',').map((n) => Number(n));
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return { top: parts[0], right: 0, bottom: parts[1], left: 0 };
  }
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  return null;
}

export function readSafeInsets(el: Element, fallback: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }): SafeInsets {
  const cs = getComputedStyle(el);
  const num = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: num(cs.paddingTop) || fallback.top,
    right: num(cs.paddingRight) || fallback.right,
    bottom: num(cs.paddingBottom) || fallback.bottom,
    left: num(cs.paddingLeft) || fallback.left
  };
}
