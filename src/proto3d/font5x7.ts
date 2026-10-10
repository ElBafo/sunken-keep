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

/** Draw one line with the 5×7 atlas, including the Greek block in `glyphs`. */
export function drawFont5x7(
  ctx: CanvasRenderingContext2D,
  font: HTMLImageElement | null,
  text: string,
  x: number,
  y: number,
  glyphs?: FontGlyphs,
  cellW = 6
) {
  if (!text) return;
  if (!font) {
    ctx.fillStyle = '#d8ccb0';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    return;
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const g = glyphs?.[ch];
    let sx: number;
    let sy: number;
    if (g) {
      sx = g.x;
      sy = g.y;
    } else {
      const index = ch.charCodeAt(0) - 32;
      if (index < 0 || index > 94) continue;
      sx = (index % 16) * cellW;
      sy = Math.floor(index / 16) * 10;
    }
    ctx.drawImage(font, sx, sy, 5, 9, x + i * cellW, y, 5, 9);
  }
}
