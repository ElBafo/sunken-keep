import { fetchJsonCached, loadHtmlImage } from './asset-cache';
import {
  drawFont5x7,
  wrapFontToWidth,
  type FontGlyphs,
  normalizeFontText
} from './font5x7';
import type { FloorData } from './types';
import { isReadable } from './items';

/** Design pixels of the parchment page (CSS-scaled to ~92% of the viewport). */
export const NOTE_PAGE_W = 240;
export const NOTE_PAGE_H = 320;
export const NOTE_VIEWPORT_RATIO = 0.92;
export const NOTE_MARGIN_LEFT = 16;
export const NOTE_MARGIN_RIGHT = 16;
export const NOTE_MARGIN_TOP = 18;
export const NOTE_MARGIN_BOTTOM = 20;
export const NOTE_FONT_SCALE = 2;
export const NOTE_ADVANCE = 6;
export const NOTE_LINE_H = 10 * NOTE_FONT_SCALE;
export const DEBUG_READER_NOTE_PATH = 'story/debug_reader_test.json';
export const DEBUG_READER_QUERY = 'debug=reader';

const TITLE_COLOUR = '#5a1810';
const BODY_COLOUR = '#3a2418';
const SHADOW = { colour: '#cbb892', dx: 2, dy: 2 };

const PARCHMENT_FILL = '#e6d4a8';
const PARCHMENT_FILL_INNER = '#eedbb4';
const PARCHMENT_EDGE = '#6b3418';
const PARCHMENT_EDGE_DARK = '#3d1c0a';
const PARCHMENT_GRAIN_DARK = 'rgba(90, 48, 18, 0.08)';
const PARCHMENT_GRAIN_LIGHT = 'rgba(255, 244, 214, 0.07)';

export interface NotePageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoteLayout {
  page: NotePageRect;
  textRect: NotePageRect;
  maxPx: number;
  titleLines: string[];
  bodyLines: string[];
  lines: string[];
  lineH: number;
  visible: number;
}

export interface DebugReaderNote {
  id: string;
  title: { en: string; el: string };
  body: { en: string; el: string };
}

export function debugReaderRequested(params: URLSearchParams): boolean {
  const debug = params.get('debug');
  return debug === 'reader' || params.get('reader') === '1';
}

export function debugReaderUrl(base = '/sunken-keep/proto3d.html', locale?: 'en' | 'el'): string {
  const lang = locale === 'el' ? '&lang=el' : locale === 'en' ? '&lang=en' : '';
  return `${base}?${DEBUG_READER_QUERY}${lang}`;
}

export function noteOverlayRect(viewW: number, viewH: number): NotePageRect {
  const maxW = Math.max(1, viewW * NOTE_VIEWPORT_RATIO);
  const maxH = Math.max(1, viewH * NOTE_VIEWPORT_RATIO);
  const aspect = NOTE_PAGE_W / NOTE_PAGE_H;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  return {
    x: Math.round((viewW - w) / 2),
    y: Math.round((viewH - h) / 2),
    w,
    h
  };
}

function hash2(x: number, y: number): number {
  let n = Math.imul(x * 374761393 + y * 668265263, 1);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 1000) / 1000;
}

function jog(x: number, y: number): number {
  return ((x * 47 + y * 31) % 5) - 2;
}

/**
 * Warm parchment with a burnt edge, slightly ragged corners, and grain.
 * Swap this function for a painted asset later without touching layout or text.
 */
export function drawParchmentPanel(ctx: CanvasRenderingContext2D, rect: NotePageRect): void {
  const { x, y, w, h } = rect;
  if (w < 8 || h < 8) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 4 + jog(x, y), y + 1);
  for (let i = 10; i < w - 4; i += 9) {
    ctx.lineTo(x + i, y + Math.max(0, jog(x + i, y)));
  }
  ctx.lineTo(x + w - 2, y + 3 + jog(x + w, y));
  for (let i = 12; i < h - 4; i += 11) {
    ctx.lineTo(x + w - 1 + Math.min(1, jog(x + w, y + i)), y + i);
  }
  ctx.lineTo(x + w - 4, y + h - 1);
  for (let i = w - 12; i > 4; i -= 8) {
    ctx.lineTo(x + i, y + h - 1 - Math.max(0, jog(x + i, y + h)));
  }
  ctx.lineTo(x + 2, y + h - 3);
  for (let i = h - 14; i > 6; i -= 10) {
    ctx.lineTo(x + Math.max(0, jog(x, y + i)), y + i);
  }
  ctx.closePath();
  ctx.fillStyle = PARCHMENT_FILL;
  ctx.fill();
  ctx.strokeStyle = PARCHMENT_EDGE_DARK;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = PARCHMENT_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PARCHMENT_FILL_INNER;
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const n = hash2(x + i, y + j);
      if (n < 0.07) {
        ctx.fillStyle = PARCHMENT_GRAIN_DARK;
        ctx.fillRect(x + i, y + j, 1, 1);
      } else if (n > 0.93) {
        ctx.fillStyle = PARCHMENT_GRAIN_LIGHT;
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  ctx.restore();
  ctx.restore();
}

export function wrapNoteText(text: string, maxPx: number, glyphs?: FontGlyphs): string[] {
  const normalized = normalizeFontText(text);
  if (!normalized) return [];
  const out: string[] = [];
  for (const para of normalized.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    out.push(...wrapFontToWidth(para, maxPx, glyphs, NOTE_ADVANCE, NOTE_FONT_SCALE));
  }
  return out;
}

export function layoutNote(title: string, body: string, glyphs?: FontGlyphs): NoteLayout {
  const page: NotePageRect = { x: 0, y: 0, w: NOTE_PAGE_W, h: NOTE_PAGE_H };
  const textRect: NotePageRect = {
    x: page.x + NOTE_MARGIN_LEFT,
    y: page.y + NOTE_MARGIN_TOP,
    w: page.w - NOTE_MARGIN_LEFT - NOTE_MARGIN_RIGHT,
    h: page.h - NOTE_MARGIN_TOP - NOTE_MARGIN_BOTTOM
  };
  const maxPx = Math.max(24, textRect.w);
  const titleLines = wrapNoteText(title, maxPx, glyphs);
  const bodyLines = wrapNoteText(body, maxPx, glyphs);
  const lines = titleLines.length ? [...titleLines, '', ...bodyLines] : bodyLines;
  const visible = Math.max(1, Math.floor(textRect.h / NOTE_LINE_H));
  return { page, textRect, maxPx, titleLines, bodyLines, lines, lineH: NOTE_LINE_H, visible };
}

export function clampNoteScroll(
  scroll: number,
  lineCount: number,
  visible: number,
  lineH = NOTE_LINE_H
): { scroll: number; maxScroll: number } {
  const maxScroll = Math.max(0, (lineCount - visible) * lineH);
  return { scroll: Math.max(0, Math.min(maxScroll, scroll)), maxScroll };
}

export function noteVisibleRange(
  scroll: number,
  lineCount: number,
  visible: number,
  lineH = NOTE_LINE_H
): { first: number; last: number } {
  const { scroll: y } = clampNoteScroll(scroll, lineCount, visible, lineH);
  const first = Math.floor(y / lineH);
  const last = Math.min(lineCount, first + visible);
  return { first, last };
}

export interface FloorReadablePickup {
  x: number;
  y: number;
  item: string;
  journalPage?: number;
}

export interface FloorReadableProp {
  x: number;
  y: number;
  readNote: string;
  prop?: string;
}

export function floorReadableEntries(floor: FloorData): {
  pickups: FloorReadablePickup[];
  props: FloorReadableProp[];
} {
  const pickups: FloorReadablePickup[] = [];
  const props: FloorReadableProp[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = floor.tiles[y]?.[x];
      if (!tile) continue;
      if (tile.item && (isReadable(tile.item) || tile.journalPage != null)) {
        pickups.push({
          x,
          y,
          item: tile.item,
          journalPage: typeof tile.journalPage === 'number' ? tile.journalPage : undefined
        });
      }
      if (typeof tile.readNote === 'string' && tile.readNote) {
        props.push({ x, y, readNote: tile.readNote, prop: tile.prop });
      }
    }
  }
  return { pickups, props };
}

export class NoteReader {
  open = false;
  scroll = 0;
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private fontImg: HTMLImageElement | null = null;
  private fontGlyphs: FontGlyphs = {};
  private title = '';
  private text = '';
  private layout: NoteLayout | null = null;
  private drag: { y: number; scroll: number; moved: boolean } | null = null;
  private onClose: () => void;
  private boundWheel = (e: WheelEvent) => this.onWheel(e);
  private boundDown = (e: PointerEvent) => this.onPointerDown(e);
  private boundMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundResize = () => this.syncOverlaySize();

  constructor(onClose: () => void) {
    this.onClose = onClose;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    this.host = document.getElementById('note-overlay');
    this.canvas = document.getElementById('note-canvas') as HTMLCanvasElement | null;
    if (this.canvas) {
      this.canvas.width = NOTE_PAGE_W;
      this.canvas.height = NOTE_PAGE_H;
      this.ctx = this.canvas.getContext('2d');
    }
    const [fontImg, fontMeta] = await Promise.all([
      loadHtmlImage(`${base}art/font/font_5x7.png`).catch(() => null),
      fetchJsonCached<{ glyphs?: FontGlyphs }>(`${base}art/font/font_5x7.json`).catch(() => null)
    ]);
    this.fontImg = fontImg;
    if (fontMeta?.glyphs) this.fontGlyphs = fontMeta.glyphs;
    this.mount();
    this.syncOverlaySize();
    if (this.open) {
      this.layout = layoutNote(this.title, this.text, this.fontGlyphs);
      this.draw();
    }
  }

  private mount() {
    const target = this.host ?? this.canvas;
    if (!target || target.dataset.noteBound) return;
    target.dataset.noteBound = '1';
    target.addEventListener('wheel', this.boundWheel, { passive: false });
    target.addEventListener('pointerdown', this.boundDown);
    target.addEventListener('pointermove', this.boundMove);
    target.addEventListener('pointerup', this.boundUp);
    target.addEventListener('pointercancel', this.boundUp);
    window.addEventListener('resize', this.boundResize);
  }

  private syncOverlaySize() {
    const canvas = this.canvas;
    const host = this.host;
    if (!canvas) return;
    const viewW = host?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : NOTE_PAGE_W);
    const viewH = host?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : NOTE_PAGE_H);
    const rect = noteOverlayRect(viewW, viewH);
    canvas.width = NOTE_PAGE_W;
    canvas.height = NOTE_PAGE_H;
    canvas.style.width = `${rect.w}px`;
    canvas.style.height = `${rect.h}px`;
    if (this.open) this.draw();
  }

  show(title: string, text: string) {
    this.title = title;
    this.text = text;
    this.layout = layoutNote(title, text, this.fontGlyphs);
    this.scroll = 0;
    this.open = true;
    this.host?.classList.add('show');
    this.syncOverlaySize();
    this.draw();
  }

  hide() {
    this.open = false;
    this.drag = null;
    this.host?.classList.remove('show');
  }

  maxScroll(): number {
    if (!this.layout) return 0;
    return clampNoteScroll(this.scroll, this.layout.lines.length, this.layout.visible, this.layout.lineH)
      .maxScroll;
  }

  setScroll(y: number) {
    if (!this.layout) return;
    this.scroll = clampNoteScroll(y, this.layout.lines.length, this.layout.visible, this.layout.lineH).scroll;
    this.draw();
  }

  private onWheel(e: WheelEvent) {
    if (!this.open) return;
    e.preventDefault();
    this.setScroll(this.scroll + e.deltaY);
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.open || !e.isPrimary) return;
    this.drag = { y: e.clientY, scroll: this.scroll, moved: false };
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.open || !this.drag || !e.isPrimary) return;
    const dy = e.clientY - this.drag.y;
    if (Math.abs(dy) > 4) this.drag.moved = true;
    if (this.drag.moved) this.setScroll(this.drag.scroll - dy);
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.open || !e.isPrimary) return;
    const dragged = this.drag?.moved;
    this.drag = null;
    if (!dragged) this.onClose();
  }

  private draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const layout = this.layout ?? layoutNote(this.title, this.text, this.fontGlyphs);
    this.layout = layout;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, NOTE_PAGE_W, NOTE_PAGE_H);
    const { page, textRect, titleLines, lines } = layout;
    drawParchmentPanel(ctx, page);
    const { scroll } = clampNoteScroll(this.scroll, lines.length, layout.visible, layout.lineH);
    this.scroll = scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textRect.x, textRect.y, textRect.w, textRect.h);
    ctx.clip();
    lines.forEach((line, i) => {
      const y = textRect.y + i * layout.lineH - scroll;
      if (y + layout.lineH < textRect.y || y > textRect.y + textRect.h) return;
      const colour = i < titleLines.length ? TITLE_COLOUR : BODY_COLOUR;
      drawFont5x7(
        ctx,
        this.fontImg,
        line,
        textRect.x,
        y,
        this.fontGlyphs,
        NOTE_ADVANCE,
        colour,
        SHADOW,
        NOTE_FONT_SCALE
      );
    });
    ctx.restore();
  }
}
