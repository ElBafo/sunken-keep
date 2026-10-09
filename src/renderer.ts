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
    
    // Preload dungeon art
    this.preloadDungeonArt();
  }

  private preloadDungeonArt() {
    const distances = ['near', 'mid', 'far'];
    const walls = ['wall_front', 'wall_left', 'wall_right'];
    const doors = ['door_locked', 'door_open'];
    const secrets = ['secret_closed', 'secret_open'];
    const monsters = ['slime', 'drowned_dwarf', 'tide_spawn'];
    const items = ['item_key', 'item_chest', 'item_potion_red', 'item_potion_blue', 'item_potion_green', 'item_scroll'];
    const states = ['idle', 'attack', 'hurt', 'death'];
    const frameCounts = { idle: 4, attack: 3, hurt: 1, death: 4 };
    
    distances.forEach(dist => {
      walls.forEach(wall => assets.loadImage(`/sunken-keep/art/dungeon/${wall}_${dist}.png`));
      doors.forEach(door => assets.loadImage(`/sunken-keep/art/dungeon/${door}_${dist}.png`));
      secrets.forEach(secret => assets.loadImage(`/sunken-keep/art/dungeon/${secret}_${dist}.png`));
      items.forEach(item => assets.loadImage(`/sunken-keep/art/dungeon/${item}_${dist}.png`));
      
      // Load monster animation frames
      monsters.forEach(monster => {
        states.forEach(state => {
          const count = frameCounts[state as keyof typeof frameCounts];
          for (let i = 1; i <= count; i++) {
            assets.loadImage(`/sunken-keep/art/dungeon/${monster}_${state}_${i}_${dist}.png`);
          }
        });
      });
    });
    
    // Water tiles
    assets.loadImage('/sunken-keep/art/dungeon/water_shallow.png');
    assets.loadImage('/sunken-keep/art/dungeon/water_deep.png');
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

    // Draw floor tiles
    this.drawFloor(ctx, party, floor);

    // Draw 3 distances (back to front)
    for (let dist = 3; dist >= 1; dist--) {
      this.drawDistance(ctx, party, floor, dist as 1 | 2 | 3);
    }

    // Draw speech bubble if active
    const bark = getActiveBark(now);
    if (bark) {
      this.drawSpeechBubble(ctx, bark.bark.text, characters.indexOf(bark.speaker));
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D, party: Party, floor: FloorData) {
    // Draw floor tiles for visible squares
    for (let dist = 1; dist <= 3; dist++) {
      const pos = party.getPosition(dist, 0);
      if (this.isInBounds(pos, floor)) {
        const tile = floor.tiles[pos.y][pos.x];
        
        // Draw water tiles
        if (tile.shallowWater) {
          this.drawWaterTile(ctx, dist as 1 | 2 | 3, 'shallow');
        } else if (tile.deepWater) {
          this.drawWaterTile(ctx, dist as 1 | 2 | 3, 'deep');
        }
      }
    }
  }

  private drawWaterTile(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, type: 'shallow' | 'deep') {
    const imgPath = `/sunken-keep/art/dungeon/water_${type}.png`;
    const img = assets.getImage(imgPath);
    if (!img || !img.complete) return;

    // Floor positions for each distance
    const positions = {
      1: { x: 75, y: 100, w: 120, h: 100 },
      2: { x: 105, y: 100, w: 60, h: 50 },
      3: { x: 120, y: 100, w: 30, h: 35 }
    };

    const pos = positions[distance];
    ctx.drawImage(img, pos.x, pos.y, pos.w, pos.h);
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
        this.drawWallSprite(ctx, distance, sideName);
        return;
      }

      const tile = floor.tiles[pos.y][pos.x];

      if (tile.wall) {
        this.drawWallSprite(ctx, distance, sideName);
      } else if (tile.secret && !tile.secretOpen) {
        if (sideName === 'front') {
          this.drawSecretSprite(ctx, distance, false);
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
        }
      } else if (tile.door) {
        if (sideName === 'front' && !tile.doorOpen) {
          this.drawDoorSprite(ctx, distance, tile.doorLocked || false);
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
        }
      } else {
        // Empty space or open door/secret
        if (sideName === 'front') {
          // Draw items first (behind monsters)
          if (tile.item) {
            this.drawItem(ctx, tile.item, distance);
          }
          
          // Draw monsters on top
          if (tile.monster) {
            this.drawMonsterSprite(ctx, tile.monster, distance, tile.monsterState || 'idle', tile.monsterAnimTime || 0);
          }
          
          // Carvings on walls
          if (tile.carving) {
            this.drawCarving(ctx, tile.carving, distance);
          }
        }
      }
    });
  }

  private drawWallSprite(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, side: 'front' | 'left' | 'right') {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const imgPath = `/sunken-keep/art/dungeon/wall_${side}_${distKey}.png`;
    const img = assets.getImage(imgPath);

    if (!img || !img.complete) {
      this.drawWallPlaceholder(ctx, distance, side);
      return;
    }

    // Wall sprite positions (centered, pre-drawn in perspective)
    const positions = {
      near: { front: { x: 55, y: 30, w: 160, h: 140 }, left: { x: 15, y: 30, w: 40, h: 140 }, right: { x: 215, y: 30, w: 40, h: 140 } },
      mid: { front: { x: 75, y: 50, w: 120, h: 100 }, left: { x: 45, y: 50, w: 30, h: 100 }, right: { x: 195, y: 50, w: 30, h: 100 } },
      far: { front: { x: 95, y: 65, w: 80, h: 70 }, left: { x: 75, y: 65, w: 20, h: 70 }, right: { x: 175, y: 65, w: 20, h: 70 } }
    };

    const pos = positions[distKey][side];
    ctx.drawImage(img, pos.x, pos.y);
  }

  private drawWallPlaceholder(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, side: 'front' | 'left' | 'right') {
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
    else if (side === 'left') x = 135 - w / 2 - s.front[0] / 2;
    else x = 135 + s.front[0] / 2;

    ctx.fillStyle = distance === 1 ? '#1a3830' : distance === 2 ? '#152e28' : '#102420';
    ctx.fillRect(x, y, w, h);
  }

  private drawDoorSprite(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, locked: boolean) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const state = locked ? 'locked' : 'open';
    const imgPath = `/sunken-keep/art/dungeon/door_${state}_${distKey}.png`;
    const img = assets.getImage(imgPath);

    if (!img || !img.complete) {
      this.drawDoorPlaceholder(ctx, distance, locked);
      return;
    }

    const positions = {
      near: { x: 55, y: 30 },
      mid: { x: 75, y: 50 },
      far: { x: 95, y: 65 }
    };

    const pos = positions[distKey];
    ctx.drawImage(img, pos.x, pos.y);
  }

  private drawDoorPlaceholder(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, locked: boolean) {
    const sizes = {
      1: { w: 100, h: 140, y: 30 },
      2: { w: 70, h: 100, y: 50 },
      3: { w: 50, h: 70, y: 65 }
    };

    const s = sizes[distance];
    const x = 135 - s.w / 2;

    ctx.fillStyle = '#2a4a42';
    ctx.fillRect(x, s.y, s.w, s.h);

    if (locked) {
      ctx.fillStyle = '#ff4444';
      const lockX = x + s.w / 2;
      const lockY = s.y + s.h / 2;
      ctx.fillRect(lockX - 3, lockY - 3, 6, 6);
    }
  }

  private drawSecretSprite(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, open: boolean) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const state = open ? 'open' : 'closed';
    const imgPath = `/sunken-keep/art/dungeon/secret_${state}_${distKey}.png`;
    const img = assets.getImage(imgPath);

    if (!img || !img.complete) {
      this.drawWallPlaceholder(ctx, distance, 'front');
      return;
    }

    const positions = {
      near: { x: 55, y: 30 },
      mid: { x: 75, y: 50 },
      far: { x: 95, y: 65 }
    };

    const pos = positions[distKey];
    ctx.drawImage(img, pos.x, pos.y);
  }

  private drawItem(ctx: CanvasRenderingContext2D, item: string, distance: 1 | 2 | 3) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const imgPath = `/sunken-keep/art/dungeon/item_${item}_${distKey}.png`;
    const img = assets.getImage(imgPath);

    if (!img || !img.complete) return;

    // Items are bottom-aligned at y=100 line
    const x = 135 - img.width / 2;
    const y = 100 - img.height;

    ctx.drawImage(img, x, y);
  }

  private drawMonsterSprite(
    ctx: CanvasRenderingContext2D, 
    monsterType: string, 
    distance: 1 | 2 | 3, 
    state: 'idle' | 'attack' | 'hurt' | 'death',
    animTime: number
  ) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    
    // Frame counts for each state
    const frameCounts = { idle: 4, attack: 3, hurt: 1, death: 4 };
    const frameCount = frameCounts[state];
    
    // Calculate frame based on animation time
    let frameIndex = 1;
    const fps = state === 'idle' ? 4 : state === 'attack' ? 12 : state === 'hurt' ? 1 : 8;
    if (state !== 'hurt') {
      frameIndex = Math.floor(animTime * fps) % frameCount + 1;
    }
    
    // Try to load the specific animation frame
    const framePath = `/sunken-keep/art/dungeon/${monsterType}_${state}_${frameIndex}_${distKey}.png`;
    const frameImg = assets.getImage(framePath);
    
    // Fall back to static sprite if frame not available
    const hasFrames = frameImg && frameImg.complete;
    const img = hasFrames ? frameImg : assets.getImage(`/sunken-keep/art/dungeon/${monsterType}_${distKey}.png`);

    if (!img || !img.complete) {
      this.drawMonsterPlaceholder(ctx, distance);
      return;
    }

    // Calculate base position (bottom-aligned at y=100)
    const baseX = 135 - img.width / 2;
    const baseY = 100 - img.height;
    
    // Only apply code effects if frames are missing (fallback)
    let offsetX = 0;
    let offsetY = 0;
    let scaleX = 1;
    let scaleY = 1;
    let alpha = 1;

    if (!hasFrames) {
      // Fallback code effects when animation frames are missing
      const t = animTime;

      switch (state) {
        case 'idle':
          // Gentle bob and squash
          const bobCycle = Math.sin(t * 2) * 0.5 + 0.5;
          offsetY = Math.sin(t * 2) * 2;
          scaleY = 1 - bobCycle * 0.05;
          scaleX = 1 + bobCycle * 0.05;
          break;
          
        case 'attack':
          // Lunge toward camera
          const lungeProg = Math.min(t * 4, 1);
          const lunge = Math.sin(lungeProg * Math.PI);
          scaleX = 1 + lunge * 0.3;
          scaleY = 1 + lunge * 0.3;
          offsetY = -lunge * 10;
          break;
          
        case 'hurt':
          // Flash white/red and knockback
          const hurtProg = Math.min(t * 6, 1);
          offsetX = (1 - hurtProg) * 5;
          alpha = 0.5 + Math.abs(Math.sin(t * 20)) * 0.5;
          break;
          
        case 'death':
          // Sink and fade out (only if frames don't handle it)
          const deathProg = Math.min(t * 2, 1);
          offsetY = deathProg * 20;
          scaleY = 1 - deathProg * 0.3;
          alpha = 1 - deathProg;
          break;
      }
    } else {
      // With real frames, only add subtle effects that enhance the animation
      if (state === 'hurt') {
        // Add a slight flash on hurt to make it more visible
        alpha = 0.8 + Math.abs(Math.sin(animTime * 30)) * 0.2;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Apply transforms
    const centerX = baseX + img.width / 2;
    const centerY = baseY + img.height / 2;
    ctx.translate(centerX + offsetX, centerY + offsetY);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    
    // Flash effect for hurt (enhance even with frames)
    if (state === 'hurt' && animTime < 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - animTime / 0.2) * 0.3;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
    }
    
    ctx.restore();
  }

  private drawMonsterPlaceholder(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3) {
    const sizes = {
      1: { w: 80, h: 60, y: 100 },
      2: { w: 50, h: 40, y: 100 },
      3: { w: 30, h: 25, y: 100 }
    };

    const s = sizes[distance];
    const x = 135 - s.w / 2;

    ctx.fillStyle = '#44aa66';
    ctx.beginPath();
    ctx.ellipse(x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
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
