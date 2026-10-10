import type { HeroId } from '../constants';
import { drawFont5x7, type FontGlyphs } from './font5x7';

const VIEW_W = 270;
const BUBBLE_H = 34;
const PAD_X = 6;
const PAD_Y = 4;
const CHAR_W = 6;
const LINE_H = 10;
const FADE_MS = 3000;
const CHARS = 43;

const HERO_TAIL_X: Record<HeroId, number> = {
  brannoc: 35,
  wren: 102,
  ilsevar: 169,
  mags: 236
};

export class SpeechBubble {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private slice: HTMLImageElement | null = null;
  private tail: HTMLImageElement | null = null;
  private font: HTMLImageElement | null = null;
  private glyphs: FontGlyphs = {};
  private text = '';
  private speaker: HeroId = 'brannoc';
  private shownAt = 0;
  visible = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    const [slice, tail, font, meta] = await Promise.all([
      this.loadImg(`${base}art/ui/bubble_9slice.png`),
      this.loadImg(`${base}art/ui/bubble_tail.png`),
      this.loadImg(`${base}art/font/font_5x7.png`),
      fetch(`${base}art/font/font_5x7.json`).then((r) => r.json()) as Promise<{ glyphs?: FontGlyphs }>
    ]);
    this.slice = slice;
    this.tail = tail;
    this.font = font;
    this.glyphs = meta.glyphs ?? {};
  }

  private loadImg(src: string) {
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = src;
    });
  }

  show(text: string, speaker: HeroId, now = performance.now()) {
    this.text = text;
    this.speaker = speaker;
    this.shownAt = now;
    this.visible = true;
    this.canvas.classList.add('show');
    this.draw();
  }

  hide() {
    this.visible = false;
    this.canvas.classList.remove('show');
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(now: number) {
    if (!this.visible) return;
    if (now - this.shownAt >= FADE_MS) this.hide();
    else this.draw(1 - Math.max(0, now - this.shownAt - (FADE_MS - 400)) / 400);
  }

  private wrap(text: string): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length <= CHARS) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w.length > CHARS ? w.slice(0, CHARS) : w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }

  private drawNine(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const m = 4;
    const iw = img.width;
    const ih = img.height;
    const ctx = this.ctx;
    // corners
    ctx.drawImage(img, 0, 0, m, m, x, y, m, m);
    ctx.drawImage(img, iw - m, 0, m, m, x + w - m, y, m, m);
    ctx.drawImage(img, 0, ih - m, m, m, x, y + h - m, m, m);
    ctx.drawImage(img, iw - m, ih - m, m, m, x + w - m, y + h - m, m, m);
    // edges
    ctx.drawImage(img, m, 0, iw - 2 * m, m, x + m, y, w - 2 * m, m);
    ctx.drawImage(img, m, ih - m, iw - 2 * m, m, x + m, y + h - m, w - 2 * m, m);
    ctx.drawImage(img, 0, m, m, ih - 2 * m, x, y + m, m, h - 2 * m);
    ctx.drawImage(img, iw - m, m, m, ih - 2 * m, x + w - m, y + m, m, h - 2 * m);
    // center
    ctx.drawImage(img, m, m, iw - 2 * m, ih - 2 * m, x + m, y + m, w - 2 * m, h - 2 * m);
  }

  private draw(alpha = 1) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const h = BUBBLE_H;
    if (this.slice) this.drawNine(this.slice, 0, 0, VIEW_W, h);
    else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, VIEW_W, h);
    }
    const lines = this.wrap(this.text);
    lines.forEach((line, i) => {
      drawFont5x7(ctx, this.font, line, PAD_X, PAD_Y + i * LINE_H, this.glyphs, CHAR_W, '#d8ccb0');
    });
    if (this.tail) {
      const tx = Math.max(4, Math.min(VIEW_W - this.tail.width - 4, HERO_TAIL_X[this.speaker] - this.tail.width / 2));
      ctx.drawImage(this.tail, tx, h - 2);
    }
    ctx.globalAlpha = 1;
  }
}
