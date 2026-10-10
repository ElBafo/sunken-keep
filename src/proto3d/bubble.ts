import type { HeroId } from '../constants';
import { drawFont5x7, type FontGlyphs } from './font5x7';

const VIEW_W = 270;
const BUBBLE_H = 28;
const CANVAS_H = 32;
const PAD_X = 6;
const PAD_Y = 4;
const CHAR_W = 6;
const LINE_H = 10;
const FADE_MS = 3000;
const CHARS = 43;
const NAME_COLOUR = '#ffbe5a';
const TEXT_COLOUR = '#d8ccb0';

/** Portrait centres in the 270-wide layout (layout585 portrait wells). */
const HERO_TAIL_X: Record<string, number> = {
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
  private speakerName = '';
  private speaker: HeroId = 'brannoc';
  private shownAt = 0;
  visible = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = VIEW_W;
    this.canvas.height = CANVAS_H;
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

  show(text: string, speaker: HeroId, speakerName = '', now = performance.now()) {
    this.text = text;
    this.speakerName = speakerName;
    this.speaker = speaker;
    this.shownAt = now;
    this.visible = true;
    this.canvas.classList.add('show');
    this.draw();
  }

  displayText(): string {
    return this.speakerName ? `${this.speakerName}: ${this.text}` : this.text;
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

  private wrapAfterPrefix(prefix: string, text: string): [string, string] {
    const budget = Math.max(1, CHARS - prefix.length);
    const words = text.split(/\s+/).filter(Boolean);
    let first = '';
    let i = 0;
    for (; i < words.length; i++) {
      const next = first ? `${first} ${words[i]}` : words[i];
      if (next.length > budget) break;
      first = next;
    }
    if (!first && words[0]) {
      first = words[0].slice(0, budget);
      i = 1;
    }
    return [first, words.slice(i).join(' ').slice(0, CHARS)];
  }

  private drawNine(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const m = 4;
    const iw = img.width;
    const ih = img.height;
    const ctx = this.ctx;
    ctx.drawImage(img, 0, 0, m, m, x, y, m, m);
    ctx.drawImage(img, iw - m, 0, m, m, x + w - m, y, m, m);
    ctx.drawImage(img, 0, ih - m, m, m, x, y + h - m, m, m);
    ctx.drawImage(img, iw - m, ih - m, m, m, x + w - m, y + h - m, m, m);
    ctx.drawImage(img, m, 0, iw - 2 * m, m, x + m, y, w - 2 * m, m);
    ctx.drawImage(img, m, ih - m, iw - 2 * m, m, x + m, y + h - m, w - 2 * m, m);
    ctx.drawImage(img, 0, m, m, ih - 2 * m, x, y + m, m, h - 2 * m);
    ctx.drawImage(img, iw - m, m, m, ih - 2 * m, x + w - m, y + m, m, h - 2 * m);
    ctx.drawImage(img, m, m, iw - 2 * m, ih - 2 * m, x + m, y + m, w - 2 * m, h - 2 * m);
  }

  private draw(alpha = 1) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (this.slice) this.drawNine(this.slice, 0, 0, VIEW_W, BUBBLE_H);
    else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, VIEW_W, BUBBLE_H);
    }
    const prefix = this.speakerName ? `${this.speakerName}: ` : '';
    const [rest, line2] = this.wrapAfterPrefix(prefix, this.text);
    if (prefix) {
      drawFont5x7(ctx, this.font, prefix, PAD_X, PAD_Y, this.glyphs, CHAR_W, NAME_COLOUR);
    }
    drawFont5x7(
      ctx,
      this.font,
      rest,
      PAD_X + prefix.length * CHAR_W,
      PAD_Y,
      this.glyphs,
      CHAR_W,
      TEXT_COLOUR
    );
    if (line2) {
      drawFont5x7(ctx, this.font, line2, PAD_X, PAD_Y + LINE_H, this.glyphs, CHAR_W, TEXT_COLOUR);
    }
    if (this.tail) {
      const centre = HERO_TAIL_X[this.speaker] ?? VIEW_W / 2;
      const tx = Math.max(4, Math.min(VIEW_W - this.tail.width - 4, centre - this.tail.width / 2));
      ctx.drawImage(this.tail, tx, BUBBLE_H - 2);
    }
    ctx.globalAlpha = 1;
  }
}
