export interface FontGlyph {
  x: number;
  y: number;
  w?: number;
  advance?: number;
}

export type FontGlyphs = Record<string, FontGlyph>;

export interface FontMeta {
  columns?: number;
  cellWidth?: number;
  cellHeight?: number;
  glyphs?: FontGlyphs;
}

const GLYPH_H = 9;
const DEFAULT_GLYPH_W = 5;

let tintScratch: HTMLCanvasElement | null = null;

export function normalizeFontText(text: string): string {
  return text.normalize('NFC');
}

function glyphSource(
  ch: string,
  glyphs: FontGlyphs | undefined,
  cellW: number
): { sx: number; sy: number; w: number; advance: number } | null {
  const nfc = ch.normalize('NFC');
  const g = glyphs?.[nfc] ?? glyphs?.[ch];
  if (g) {
    return {
      sx: g.x,
      sy: g.y,
      w: g.w ?? DEFAULT_GLYPH_W,
      advance: g.advance ?? cellW
    };
  }
  const index = nfc.charCodeAt(0) - 32;
  if (index < 0 || index > 94) return null;
  return {
    sx: (index % 16) * cellW,
    sy: Math.floor(index / 16) * 10,
    w: DEFAULT_GLYPH_W,
    advance: cellW
  };
}

export function glyphAdvance(ch: string, glyphs?: FontGlyphs, cellW = 6): number {
  return glyphSource(ch.normalize('NFC'), glyphs, cellW)?.advance ?? cellW;
}

export function measureFontWidth(
  text: string,
  glyphs?: FontGlyphs,
  cellW = 6,
  scale = 1
): number {
  let w = 0;
  for (const ch of normalizeFontText(text)) {
    w += glyphAdvance(ch, glyphs, cellW) * scale;
  }
  return w;
}

export function hasFontGlyph(ch: string, glyphs?: FontGlyphs, cellW = 6): boolean {
  if (!ch) return false;
  return glyphSource(ch.normalize('NFC'), glyphs, cellW) != null;
}

export function missingFontGlyphs(text: string, glyphs?: FontGlyphs, cellW = 6): string[] {
  const missing: string[] = [];
  for (const ch of normalizeFontText(text)) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    if (!hasFontGlyph(ch, glyphs, cellW)) missing.push(ch);
  }
  return missing;
}

function drawTintedGlyph(
  ctx: CanvasRenderingContext2D,
  font: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  colour: string
) {
  if (!tintScratch) tintScratch = document.createElement('canvas');
  tintScratch.width = Math.max(1, dw);
  tintScratch.height = Math.max(1, dh);
  const t = tintScratch.getContext('2d');
  if (!t) return;
  t.imageSmoothingEnabled = false;
  t.clearRect(0, 0, dw, dh);
  t.globalCompositeOperation = 'source-over';
  t.drawImage(font, sx, sy, sw, GLYPH_H, 0, 0, dw, dh);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = colour;
  t.fillRect(0, 0, dw, dh);
  ctx.drawImage(tintScratch, dx, dy);
}

/** Wrap a log line so it fits `maxChars` (6px advance) instead of clipping. */
export function wrapFontLine(text: string, maxChars: number): string[] {
  if (maxChars < 1) return [text];
  if (text.length <= maxChars) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const part of words) {
    if (!part) continue;
    if (part.length > maxChars && !/^\s+$/.test(part)) {
      if (cur.trim()) lines.push(cur);
      cur = '';
      for (let i = 0; i < part.length; i += maxChars) lines.push(part.slice(i, i + maxChars));
      continue;
    }
    const next = cur + part;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
      cur = part.replace(/^\s+/, '');
    }
  }
  if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
  return lines.length ? lines : [text];
}

/** Word-wrap a line to a pixel width, honouring per-glyph advances. */
export function wrapFontToWidth(
  text: string,
  maxPx: number,
  glyphs?: FontGlyphs,
  cellW = 6,
  scale = 1
): string[] {
  const widthOf = (s: string) => measureFontWidth(s, glyphs, cellW, scale);
  if (maxPx < 1) return [text];
  if (widthOf(text) <= maxPx) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const part of words) {
    if (!part) continue;
    if (!/^\s+$/.test(part) && widthOf(part) > maxPx) {
      if (cur.trim()) lines.push(cur);
      cur = '';
      let chunk = '';
      for (const ch of part) {
        const next = chunk + ch;
        if (chunk && widthOf(next) > maxPx) {
          lines.push(chunk);
          chunk = ch;
        } else chunk = next;
      }
      if (chunk) cur = chunk;
      continue;
    }
    const next = cur + part;
    if (widthOf(next) <= maxPx) cur = next;
    else {
      if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
      cur = part.replace(/^\s+/, '');
    }
  }
  if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
  return lines.length ? lines : [text];
}

/** Intro captions: 5×7 at 6px advance, word wrap, two lines max. */
export const CAPTION_CHAR_PX = 6;
export const CAPTION_MAX_CHARS = 42;
export const CAPTION_MAX_LINES = 2;

export function wrapCaption(
  text: string,
  maxChars = CAPTION_MAX_CHARS,
  maxLines = CAPTION_MAX_LINES
): string[] {
  const lines = wrapFontLine(text, maxChars).map((line) => line.replace(/\s+$/, ''));
  if (lines.length <= maxLines) return lines.length ? lines : [text];
  return lines.slice(0, maxLines);
}

/** Draw one line with the 5×7 atlas, including the Greek block in `glyphs`. */
export function drawFont5x7(
  ctx: CanvasRenderingContext2D,
  font: HTMLImageElement | null,
  text: string,
  x: number,
  y: number,
  glyphs?: FontGlyphs,
  cellW = 6,
  colour?: string,
  shadow?: { colour: string; dx?: number; dy?: number },
  scale = 1
) {
  if (!text) return;
  const drawn = normalizeFontText(text);
  const s = Math.max(1, scale);
  if (shadow) {
    drawFont5x7(
      ctx,
      font,
      drawn,
      x + (shadow.dx ?? 1),
      y + (shadow.dy ?? 1),
      glyphs,
      cellW,
      shadow.colour,
      undefined,
      s
    );
  }
  if (!font) {
    ctx.fillStyle = colour ?? '#d8ccb0';
    ctx.font = `${8 * s}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(drawn, x, y);
    return;
  }
  let dx = x;
  for (let i = 0; i < drawn.length; i++) {
    const src = glyphSource(drawn[i], glyphs, cellW);
    if (!src) {
      dx += cellW * s;
      continue;
    }
    const dw = src.w * s;
    const dh = GLYPH_H * s;
    if (colour) drawTintedGlyph(ctx, font, src.sx, src.sy, src.w, dx, y, dw, dh, colour);
    else ctx.drawImage(font, src.sx, src.sy, src.w, GLYPH_H, dx, y, dw, dh);
    dx += src.advance * s;
  }
}
