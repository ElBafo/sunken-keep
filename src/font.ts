// Bitmap font rendering
import { assets } from './assets';

export interface BitmapFont {
  image: HTMLImageElement;
  firstChar: number;
  cellWidth: number;
  cellHeight: number;
  advance: number;
  columns: number;
}

let font: BitmapFont | null = null;

export function loadFont() {
  const img = assets.loadImage('/sunken-keep/art/font/font_5x7.png');
  font = {
    image: img,
    firstChar: 32,
    cellWidth: 6,
    cellHeight: 10,
    advance: 6,
    columns: 16
  };
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = '#ffffff'
) {
  if (!font) return;

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const index = code - font.firstChar;
    
    if (index < 0 || index > 94) continue;

    const sx = (index % font.columns) * font.cellWidth;
    const sy = Math.floor(index / font.columns) * font.cellHeight;

    // Tint the glyph by drawing it with composite operation
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = font.cellWidth;
    tmpCanvas.height = font.cellHeight;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    
    tmpCtx.drawImage(
      font.image,
      sx, sy, font.cellWidth, font.cellHeight,
      0, 0, font.cellWidth, font.cellHeight
    );
    
    tmpCtx.globalCompositeOperation = 'source-in';
    tmpCtx.fillStyle = color;
    tmpCtx.fillRect(0, 0, font.cellWidth, font.cellHeight);

    ctx.drawImage(tmpCanvas, x + i * font.advance, y);
  }

  ctx.restore();
}

export function measureText(text: string): number {
  if (!font) return 0;
  return text.length * font.advance;
}

export function wrapText(text: string, maxWidth: number): string[] {
  if (!font) return [text];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = measureText(testLine);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
