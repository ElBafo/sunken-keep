import { fetchJsonCached, loadHtmlImage } from './asset-cache';
import {
  drawFont5x7,
  wrapFontLine,
  type FontGlyphs,
  normalizeFontText
} from './font5x7';
import type { FloorData } from './types';
import { isReadable } from './items';

/** Floor sprites for Orrun's page: load as single PNGs, never via the atlas. */
export const JOURNAL_PAGE_FRAMES = [
  'art/dungeon/item_journal_page_near.png',
  'art/dungeon/item_journal_page_mid.png',
  'art/dungeon/item_journal_page_far.png'
] as const;

export const NOTE_PARCHMENT = JOURNAL_PAGE_FRAMES[0];
export const NOTE_CANVAS_W = 270;
export const NOTE_CANVAS_H = 585;
export const NOTE_VIEW_H = 380;
export const PARCHMENT_SRC_W = 80;
export const PARCHMENT_SRC_H = 60;
export const PARCHMENT_SCALE = 3;
export const PARCHMENT_INSET = 12;
export const NOTE_LINE_H = 10;
export const NOTE_ADVANCE = 6;
const TITLE_COLOUR = '#5a1810';
const BODY_COLOUR = '#3a2418';
const SHADOW = { colour: '#d8c9a0', dx: 1, dy: 1 };

export interface NotePageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoteLayout {
  page: NotePageRect;
  textRect: NotePageRect;
  maxChars: number;
  titleLines: string[];
  bodyLines: string[];
  lines: string[];
  lineH: number;
  visible: number;
}

export function wrapNoteText(text: string, maxChars: number): string[] {
  const normalized = normalizeFontText(text);
  if (!normalized) return [];
  const out: string[] = [];
  for (const para of normalized.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    out.push(...wrapFontLine(para, maxChars));
  }
  return out;
}

export function layoutNote(title: string, body: string): NoteLayout {
  const page: NotePageRect = {
    x: Math.floor((NOTE_CANVAS_W - PARCHMENT_SRC_W * PARCHMENT_SCALE) / 2),
    y: Math.floor((NOTE_VIEW_H - PARCHMENT_SRC_H * PARCHMENT_SCALE) / 2),
    w: PARCHMENT_SRC_W * PARCHMENT_SCALE,
    h: PARCHMENT_SRC_H * PARCHMENT_SCALE
  };
  const textRect: NotePageRect = {
    x: page.x + PARCHMENT_INSET,
    y: page.y + PARCHMENT_INSET,
    w: page.w - PARCHMENT_INSET * 2,
    h: page.h - PARCHMENT_INSET * 2
  };
  const maxChars = Math.max(8, Math.floor(textRect.w / NOTE_ADVANCE));
  const titleLines = wrapNoteText(title, maxChars);
  const bodyLines = wrapNoteText(body, maxChars);
  const lines = titleLines.length ? [...titleLines, '', ...bodyLines] : bodyLines;
  const visible = Math.max(1, Math.floor(textRect.h / NOTE_LINE_H));
  return { page, textRect, maxChars, titleLines, bodyLines, lines, lineH: NOTE_LINE_H, visible };
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
  private parchment: HTMLImageElement | null = null;
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

  constructor(onClose: () => void) {
    this.onClose = onClose;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    this.host = document.getElementById('note-overlay');
    this.canvas = document.getElementById('note-canvas') as HTMLCanvasElement | null;
    if (this.canvas) {
      this.canvas.width = NOTE_CANVAS_W;
      this.canvas.height = NOTE_CANVAS_H;
      this.ctx = this.canvas.getContext('2d');
    }
    const [parchment, fontImg, fontMeta] = await Promise.all([
      loadHtmlImage(`${base}${NOTE_PARCHMENT}`).catch(() => null),
      loadHtmlImage(`${base}art/font/font_5x7.png`).catch(() => null),
      fetchJsonCached<{ glyphs?: FontGlyphs }>(`${base}art/font/font_5x7.json`).catch(() => null)
    ]);
    await Promise.all(
      JOURNAL_PAGE_FRAMES.slice(1).map((rel) => loadHtmlImage(`${base}${rel}`).catch(() => null))
    );
    this.parchment = parchment;
    this.fontImg = fontImg;
    if (fontMeta?.glyphs) this.fontGlyphs = fontMeta.glyphs;
    this.mount();
    if (this.open) this.draw();
  }

  private mount() {
    const target = this.canvas ?? this.host;
    if (!target || target.dataset.noteBound) return;
    target.dataset.noteBound = '1';
    target.addEventListener('wheel', this.boundWheel, { passive: false });
    target.addEventListener('pointerdown', this.boundDown);
    target.addEventListener('pointermove', this.boundMove);
    target.addEventListener('pointerup', this.boundUp);
    target.addEventListener('pointercancel', this.boundUp);
  }

  show(title: string, text: string) {
    this.title = title;
    this.text = text;
    this.layout = layoutNote(title, text);
    this.scroll = 0;
    this.open = true;
    this.host?.classList.add('show');
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
    const layout = this.layout ?? layoutNote(this.title, this.text);
    this.layout = layout;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, NOTE_CANVAS_W, NOTE_CANVAS_H);
    ctx.fillStyle = 'rgba(8, 6, 4, 0.55)';
    ctx.fillRect(0, 0, NOTE_CANVAS_W, NOTE_CANVAS_H);
    const { page, textRect, titleLines, lines } = layout;
    if (this.parchment) {
      ctx.drawImage(
        this.parchment,
        0,
        0,
        this.parchment.width,
        this.parchment.height,
        page.x,
        page.y,
        page.w,
        page.h
      );
    } else {
      ctx.fillStyle = '#d8c9a0';
      ctx.fillRect(page.x, page.y, page.w, page.h);
    }
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
        SHADOW
      );
    });
    ctx.restore();
  }
}
