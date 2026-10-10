export interface FontGlyph {
  x: number;
  y: number;
}

export type FontGlyphs = Record<string, FontGlyph>;

export interface FontMeta {
  columns?: number;
  cellWidth?: number;
  cellHeight?: number;
  glyphs?: FontGlyphs;
}

let tintScratch: HTMLCanvasElement | null = null;

function glyphSource(
  ch: string,
  glyphs: FontGlyphs | undefined,
  cellW: number
): { sx: number; sy: number } | null {
  const g = glyphs?.[ch];
  if (g) return { sx: g.x, sy: g.y };
  const index = ch.charCodeAt(0) - 32;
  if (index < 0 || index > 94) return null;
  return { sx: (index % 16) * cellW, sy: Math.floor(index / 16) * 10 };
}

function drawTintedGlyph(
  ctx: CanvasRenderingContext2D,
  font: HTMLImageElement,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  colour: string
) {
  if (!tintScratch) tintScratch = document.createElement('canvas');
  tintScratch.width = 5;
  tintScratch.height = 9;
  const t = tintScratch.getContext('2d');
  if (!t) return;
  t.imageSmoothingEnabled = false;
  t.clearRect(0, 0, 5, 9);
  t.globalCompositeOperation = 'source-over';
  t.drawImage(font, sx, sy, 5, 9, 0, 0, 5, 9);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = colour;
  t.fillRect(0, 0, 5, 9);
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
  shadow?: { colour: string; dx?: number; dy?: number }
) {
  if (!text) return;
  if (shadow) {
    drawFont5x7(ctx, font, text, x + (shadow.dx ?? 1), y + (shadow.dy ?? 1), glyphs, cellW, shadow.colour);
  }
  if (!font) {
    ctx.fillStyle = colour ?? '#d8ccb0';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    return;
  }
  for (let i = 0; i < text.length; i++) {
    const src = glyphSource(text[i], glyphs, cellW);
    if (!src) continue;
    const dx = x + i * cellW;
    if (colour) drawTintedGlyph(ctx, font, src.sx, src.sy, dx, y, colour);
    else ctx.drawImage(font, src.sx, src.sy, 5, 9, dx, y, 5, 9);
  }
}
