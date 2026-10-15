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
export const PARCHMENT_META_PATH = 'art/ui/reader/parchment.json';
export const PARCHMENT_PAGE_PATH = 'art/ui/reader/parchment_page.png';

const DEFAULT_TITLE_COLOUR = '#5a1810';
const DEFAULT_BODY_COLOUR = '#3a2418';
const SHADOW = { colour: '#cbb892', dx: 2, dy: 2 };
const PARCHMENT_FALLBACK_FILL = '#e2d2ac';

export interface ParchmentMeta {
  page?: string;
  pageSize?: [number, number];
  textArea?: { left: number; right: number; top: number; bottom: number; note?: string };
  textColours?: { body: string; title: string };
}

export function parchmentMargins(meta?: ParchmentMeta | null): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const t = meta?.textArea;
  return {
    left: t?.left ?? NOTE_MARGIN_LEFT,
    right: t?.right ?? NOTE_MARGIN_RIGHT,
    top: t?.top ?? NOTE_MARGIN_TOP,
    bottom: t?.bottom ?? NOTE_MARGIN_BOTTOM
  };
}

export function parchmentColours(meta?: ParchmentMeta | null): { title: string; body: string } {
  return {
    title: meta?.textColours?.title ?? DEFAULT_TITLE_COLOUR,
    body: meta?.textColours?.body ?? DEFAULT_BODY_COLOUR
  };
}

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
  return params.get('debug') === 'reader';
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

/**
 * Draw the painted full-page parchment (`parchment_page.png`), never the 9-slice.
 * Isolated so the sheet can be swapped without touching layout or text.
 */
export function drawParchmentPanel(
  ctx: CanvasRenderingContext2D,
  rect: NotePageRect,
  image?: HTMLImageElement | null
): void {
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;
  ctx.imageSmoothingEnabled = false;
  if (image && image.width > 0 && image.height > 0) {
    ctx.drawImage(image, 0, 0, image.width, image.height, x, y, w, h);
    return;
  }
  ctx.fillStyle = PARCHMENT_FALLBACK_FILL;
  ctx.fillRect(x, y, w, h);
}

/** Cover the outer margins with parchment so clipped glyphs cannot bleed into the border. */
export function drawParchmentMargins(
  ctx: CanvasRenderingContext2D,
  rect: NotePageRect,
  image: HTMLImageElement | null | undefined,
  margins: { left: number; right: number; top: number; bottom: number }
): void {
  const { x, y, w, h } = rect;
  const { left, right, top, bottom } = margins;
  ctx.imageSmoothingEnabled = false;
  const midH = Math.max(0, h - top - bottom);
  if (image && image.width > 0 && image.height > 0) {
    const sx = image.width / w;
    const sy = image.height / h;
    ctx.drawImage(image, 0, 0, image.width, top * sy, x, y, w, top);
    ctx.drawImage(
      image,
      0,
      image.height - bottom * sy,
      image.width,
      bottom * sy,
      x,
      y + h - bottom,
      w,
      bottom
    );
    if (midH > 0) {
      ctx.drawImage(image, 0, top * sy, left * sx, midH * sy, x, y + top, left, midH);
      ctx.drawImage(
        image,
        image.width - right * sx,
        top * sy,
        right * sx,
        midH * sy,
        x + w - right,
        y + top,
        right,
        midH
      );
    }
    return;
  }
  ctx.fillStyle = PARCHMENT_FALLBACK_FILL;
  ctx.fillRect(x, y, w, top);
  ctx.fillRect(x, y + h - bottom, w, bottom);
  ctx.fillRect(x, y + top, left, midH);
  ctx.fillRect(x + w - right, y + top, right, midH);
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

export function layoutNote(title: string, body: string, glyphs?: FontGlyphs, meta?: ParchmentMeta | null): NoteLayout {
  const margin = parchmentMargins(meta);
  const pageW = meta?.pageSize?.[0] ?? NOTE_PAGE_W;
  const pageH = meta?.pageSize?.[1] ?? NOTE_PAGE_H;
  const page: NotePageRect = { x: 0, y: 0, w: pageW, h: pageH };
  const textRect: NotePageRect = {
    x: page.x + margin.left,
    y: page.y + margin.top,
    w: page.w - margin.left - margin.right,
    h: page.h - margin.top - margin.bottom
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
  textH: number,
  lineH = NOTE_LINE_H
): { scroll: number; maxScroll: number } {
  const maxScroll = Math.max(0, lineCount * lineH - textH);
  return { scroll: Math.max(0, Math.min(maxScroll, scroll)), maxScroll };
}

export function noteVisibleRange(
  scroll: number,
  lineCount: number,
  textH: number,
  lineH = NOTE_LINE_H
): { first: number; last: number } {
  const { scroll: y } = clampNoteScroll(scroll, lineCount, textH, lineH);
  if (lineCount <= 0 || textH <= 0) return { first: 0, last: 0 };
  const first = Math.max(0, Math.floor(y / lineH));
  const last = Math.min(lineCount, Math.ceil((y + textH) / lineH));
  return { first, last };
}

/** Visible slice of a line after clipping to the text box. Null if fully outside. */
export function noteLineClip(
  index: number,
  scroll: number,
  textRect: NotePageRect,
  lineH: number
): { y: number; clipTop: number; clipBottom: number } | null {
  const y = textRect.y + index * lineH - scroll;
  const boxTop = textRect.y;
  const boxBottom = textRect.y + textRect.h;
  const clipTop = Math.max(y, boxTop);
  const clipBottom = Math.min(y + lineH, boxBottom);
  if (clipBottom <= clipTop) return null;
  return { y, clipTop, clipBottom };
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
  private parchmentImg: HTMLImageElement | null = null;
  private parchmentMeta: ParchmentMeta | null = null;
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
    const [fontImg, fontMeta, parchmentImg, parchmentMeta] = await Promise.all([
      loadHtmlImage(`${base}art/font/font_5x7.png`).catch(() => null),
      fetchJsonCached<{ glyphs?: FontGlyphs }>(`${base}art/font/font_5x7.json`).catch(() => null),
      loadHtmlImage(`${base}${PARCHMENT_PAGE_PATH}`).catch(() => null),
      fetchJsonCached<ParchmentMeta>(`${base}${PARCHMENT_META_PATH}`).catch(() => null)
    ]);
    this.fontImg = fontImg;
    if (fontMeta?.glyphs) this.fontGlyphs = fontMeta.glyphs;
    this.parchmentImg = parchmentImg;
    if (parchmentMeta) this.parchmentMeta = parchmentMeta;
    this.mount();
    this.syncOverlaySize();
    if (this.open) {
      this.layout = layoutNote(this.title, this.text, this.fontGlyphs, this.parchmentMeta);
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
    this.layout = layoutNote(title, text, this.fontGlyphs, this.parchmentMeta);
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
    return clampNoteScroll(
      this.scroll,
      this.layout.lines.length,
      this.layout.textRect.h,
      this.layout.lineH
    ).maxScroll;
  }

  setScroll(y: number) {
    if (!this.layout) return;
    this.scroll = clampNoteScroll(
      y,
      this.layout.lines.length,
      this.layout.textRect.h,
      this.layout.lineH
    ).scroll;
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
    const layout = this.layout ?? layoutNote(this.title, this.text, this.fontGlyphs, this.parchmentMeta);
    this.layout = layout;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, layout.page.w, layout.page.h);
    const { page, textRect, titleLines, lines } = layout;
    const colours = parchmentColours(this.parchmentMeta);
    drawParchmentPanel(ctx, page, this.parchmentImg);
    const { scroll } = clampNoteScroll(this.scroll, lines.length, textRect.h, layout.lineH);
    this.scroll = scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textRect.x, textRect.y, textRect.w, textRect.h);
    ctx.clip();
    lines.forEach((line, i) => {
      const clip = noteLineClip(i, scroll, textRect, layout.lineH);
      if (!clip) return;
      const colour = i < titleLines.length ? colours.title : colours.body;
      drawFont5x7(
        ctx,
        this.fontImg,
        line,
        textRect.x,
        clip.y,
        this.fontGlyphs,
        NOTE_ADVANCE,
        colour,
        SHADOW,
        NOTE_FONT_SCALE
      );
    });
    ctx.restore();
    drawParchmentMargins(ctx, page, this.parchmentImg, parchmentMargins(this.parchmentMeta));
  }
}
