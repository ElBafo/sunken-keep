import { Party, FloorData, Position } from './party';
import { assets } from './assets';
import { drawText, wrapText } from './font';
import { characters, drawPortrait } from './characters';
import { getActiveBark } from './barks';

const VIEWPORT_WIDTH = 270;
const VIEWPORT_HEIGHT = 200;

export class Renderer {
  private bubbleFrame: HTMLImageElement;
  private bubbleTail: HTMLImageElement;

  constructor() {
    this.bubbleFrame = assets.loadImage('/sunken-keep/art/ui/bubble_9slice.png');
    this.bubbleTail = assets.loadImage('/sunken-keep/art/ui/bubble_tail.png');
  }

  drawViewport(
    ctx: CanvasRenderingContext2D,
    party: Party,
    floor: FloorData,
    now: number
  ) {
    // Clear viewport with dark background
    ctx.fillStyle = '#0a1612';
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Draw 3 distances
    for (let dist = 3; dist >= 1; dist--) {
      this.drawDistance(ctx, party, floor, dist as 1 | 2 | 3);
    }

    // Draw speech bubble if active
    const bark = getActiveBark(now);
    if (bark) {
      this.drawSpeechBubble(ctx, bark.bark.text, characters.indexOf(bark.speaker));
    }
  }

  private drawDistance(
    ctx: CanvasRenderingContext2D,
    party: Party,
    floor: FloorData,
    distance: 1 | 2 | 3
  ) {
    const positions = [
      { x: -1, side: 'left' as const },
      { x: 0, side: 'front' as const },
      { x: 1, side: 'right' as const }
    ];

    positions.forEach(({ x: side, side: sideName }) => {
      const pos = party.getPosition(distance, side);
      
      if (!this.isInBounds(pos, floor)) {
        this.drawWall(ctx, distance, sideName);
        return;
      }

      const tile = floor.tiles[pos.y][pos.x];

      if (tile.wall) {
        this.drawWall(ctx, distance, sideName);
      } else if (tile.secret && !tile.secretOpen) {
        if (sideName === 'front') {
          this.drawWall(ctx, distance, sideName);
          // Draw secret carving if present
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
        }
      } else if (tile.door) {
        if (sideName === 'front' && !tile.doorOpen) {
          this.drawDoor(ctx, distance, tile.doorLocked || false);
          // Draw door carving if present
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
        }
      } else {
        // Empty space or open door
        if (sideName === 'front') {
          // Check for carvings on front wall
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
          // Check for monsters
          if (tile.monster) {
            this.drawMonster(ctx, distance);
          }
        }
      }
    });
  }

  private drawWall(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, side: 'front' | 'left' | 'right') {
    const sizes = {
      1: { front: [160, 140], left: [40, 140], right: [40, 140], y: 30 },
      2: { front: [120, 100], left: [30, 100], right: [30, 100], y: 50 },
      3: { front: [80, 70], left: [20, 70], right: [20, 70], y: 65 }
    };

    const s = sizes[distance];
    const [w, h] = s[side];
    const y = s.y;

    let x = 0;
    if (side === 'front') x = 135 - w / 2;
    else if (side === 'left') x = 135 - w / 2 - (side === 'left' ? s.front[0] / 2 : 0);
    else x = 135 + s.front[0] / 2;

    // Draw placeholder walls (green swamp tones)
    ctx.fillStyle = distance === 1 ? '#1a3830' : distance === 2 ? '#152e28' : '#102420';
    ctx.fillRect(x, y, w, h);

    // Add some detail
    ctx.strokeStyle = '#0d1a16';
    ctx.lineWidth = 1;
    if (side === 'front') {
      // Vertical lines
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + (w / 3) * i, y);
        ctx.lineTo(x + (w / 3) * i, y + h);
        ctx.stroke();
      }
    }

    // Orange brazier accent (occasional)
    if (side === 'front' && Math.random() < 0.3) {
      ctx.fillStyle = '#ff8844';
      ctx.globalAlpha = 0.3;
      const glowX = x + w / 2;
      const glowY = y + h / 4;
      ctx.fillRect(glowX - 4, glowY - 4, 8, 8);
      ctx.globalAlpha = 1;
    }
  }

  private drawDoor(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, locked: boolean) {
    const sizes = {
      1: { w: 100, h: 140, y: 30 },
      2: { w: 70, h: 100, y: 50 },
      3: { w: 50, h: 70, y: 65 }
    };

    const s = sizes[distance];
    const x = 135 - s.w / 2;

    // Door frame
    ctx.fillStyle = '#2a4a42';
    ctx.fillRect(x, s.y, s.w, s.h);

    // Door panels
    ctx.strokeStyle = '#1a2a22';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, s.y + 10, s.w - 16, s.h - 20);

    // Lock indicator
    if (locked) {
      ctx.fillStyle = '#ff4444';
      const lockX = x + s.w / 2;
      const lockY = s.y + s.h / 2;
      ctx.fillRect(lockX - 3, lockY - 3, 6, 6);
    }
  }

  private drawMonster(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3) {
    const sizes = {
      1: { w: 80, h: 60, y: 100 },
      2: { w: 50, h: 40, y: 100 },
      3: { w: 30, h: 25, y: 100 }
    };

    const s = sizes[distance];
    const x = 135 - s.w / 2;

    // Placeholder monster (green slime blob)
    ctx.fillStyle = '#44aa66';
    ctx.beginPath();
    ctx.ellipse(x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffff00';
    const eyeY = s.y + s.h / 3;
    ctx.beginPath();
    ctx.arc(x + s.w / 3, eyeY, s.w / 12, 0, Math.PI * 2);
    ctx.arc(x + (s.w * 2) / 3, eyeY, s.w / 12, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCarving(ctx: CanvasRenderingContext2D, carving: string, distance: 1 | 2 | 3) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const imgPath = `/sunken-keep/art/decals/${carving}_${distKey}.png`;
    const img = assets.getImage(imgPath);
    
    if (!img || !img.complete) return;

    // Center on front wall
    const x = 135 - img.width / 2;
    const yOffsets = { 1: 70, 2: 80, 3: 90 };
    const y = yOffsets[distance];

    ctx.drawImage(img, x, y);
  }

  private drawSpeechBubble(ctx: CanvasRenderingContext2D, text: string, speakerIndex: number) {
    const bubbleY = VIEWPORT_HEIGHT - 36;
    const padding = 6;
    const maxWidth = VIEWPORT_WIDTH - padding * 2;

    // Wrap text
    const lines = wrapText(text, maxWidth);
    const lineHeight = 10;
    const bubbleHeight = Math.min(lines.length * lineHeight + 8, 28);

    // Draw 9-slice bubble
    this.draw9Slice(ctx, 0, bubbleY, VIEWPORT_WIDTH, bubbleHeight);

    // Draw tail pointing at speaker
    const tailX = 33 + speakerIndex * 60 - 4;
    ctx.drawImage(this.bubbleTail, tailX, bubbleY + bubbleHeight - 1);

    // Draw text
    const textY = bubbleY + 4;
    lines.forEach((line, i) => {
      drawText(ctx, line, padding, textY + i * lineHeight, '#ffffff');
    });
  }

  private draw9Slice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const img = this.bubbleFrame;
    if (!img.complete) return;

    const slice = 4;
    const sw = img.width;
    const sh = img.height;

    // Corners
    ctx.drawImage(img, 0, 0, slice, slice, x, y, slice, slice);
    ctx.drawImage(img, sw - slice, 0, slice, slice, x + w - slice, y, slice, slice);
    ctx.drawImage(img, 0, sh - slice, slice, slice, x, y + h - slice, slice, slice);
    ctx.drawImage(img, sw - slice, sh - slice, slice, slice, x + w - slice, y + h - slice, slice, slice);

    // Edges
    ctx.drawImage(img, slice, 0, sw - slice * 2, slice, x + slice, y, w - slice * 2, slice);
    ctx.drawImage(img, slice, sh - slice, sw - slice * 2, slice, x + slice, y + h - slice, w - slice * 2, slice);
    ctx.drawImage(img, 0, slice, slice, sh - slice * 2, x, y + slice, slice, h - slice * 2);
    ctx.drawImage(img, sw - slice, slice, slice, sh - slice * 2, x + w - slice, y + slice, slice, h - slice * 2);

    // Center
    ctx.drawImage(img, slice, slice, sw - slice * 2, sh - slice * 2, x + slice, y + slice, w - slice * 2, h - slice * 2);
  }

  private isInBounds(pos: Position, floor: FloorData): boolean {
    return pos.x >= 0 && pos.x < floor.width && pos.y >= 0 && pos.y < floor.height;
  }

  drawPortraits(ctx: CanvasRenderingContext2D, now: number) {
    const y = 202;
    characters.forEach((char, i) => {
      const x = 11 + i * 66;
      drawPortrait(ctx, char, x, y, now);
    });
  }
}
