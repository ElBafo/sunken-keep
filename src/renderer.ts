import { Party, FloorData, Position } from './party';
import { assets } from './assets';
import { drawText, wrapText } from './font';
import { characters, getHealthState } from './characters';
import { getActiveBark } from './barks';
import { UI, MessageLog } from './ui-layout';

const VIEWPORT_WIDTH = 270;
const VIEWPORT_HEIGHT = UI.VIEWPORT_HEIGHT;

export class Renderer {
  private bubbleFrame: HTMLImageElement;
  private bubbleTail: HTMLImageElement;

  constructor() {
    this.bubbleFrame = assets.loadImage('/sunken-keep/art/ui/bubble_9slice.png');
    this.bubbleTail = assets.loadImage('/sunken-keep/art/ui/bubble_tail.png');
    
    // Preload dungeon art
    this.preloadDungeonArt();
    
    // Preload panel UI art
    this.preloadPanelArt();
  }
  
  private preloadPanelArt() {
    // Panel background
    assets.loadImage(UI.PANEL_BG);
    
    // Button sprites
    assets.loadImage(UI.BUTTON_NORMAL);
    assets.loadImage(UI.BUTTON_PRESSED);
    
    // Icons
    Object.values(UI.ICONS).forEach(path => assets.loadImage(path));
    
    // Compass
    Object.values(UI.COMPASS_SPRITES).forEach(path => assets.loadImage(path));
  }

  private preloadDungeonArt() {
    const distances = ['near', 'mid', 'far'];
    const walls = ['wall_front', 'wall_left', 'wall_right'];
    const doors = ['door_locked', 'door_open'];
    const secrets = ['secret_closed', 'secret_open'];
    const monsters = ['slime', 'drowned_dwarf', 'tide_spawn', 'bog_leeches', 'keep_rat', 'rust_crab'];
    const items = ['item_key', 'item_chest', 'item_potion_red', 'item_potion_blue', 'item_potion_green', 'item_scroll'];
    const states = ['idle', 'attack', 'hurt', 'death'];
    const frameCounts = { idle: 4, attack: 3, hurt: 1, death: 4 };
    
    // Load backdrops
    assets.loadImage('/sunken-keep/art/dungeon/backdrop_stone.png');
    assets.loadImage('/sunken-keep/art/dungeon/backdrop_shallow.png');
    assets.loadImage('/sunken-keep/art/dungeon/backdrop_deep.png');
    
    // Load floor water overlays
    ['shallow', 'deep'].forEach(type => {
      distances.forEach(dist => {
        assets.loadImage(`/sunken-keep/art/dungeon/floor_water_${type}_${dist}.png`);
      });
    });
    
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
  }

  drawViewport(
    ctx: CanvasRenderingContext2D,
    party: Party,
    floor: FloorData,
    now: number
  ) {
    // Step 1: Draw backdrop (floor + ceiling)
    this.drawBackdrop(ctx, party, floor);
    
    // Step 2: Draw floor water overlays per distance
    this.drawWaterOverlays(ctx, party, floor);
    
    // Step 3: Draw walls from far to near
    for (let dist = 3; dist >= 1; dist--) {
      this.drawWallsAtDistance(ctx, party, floor, dist as 1 | 2 | 3);
    }
    
    // Step 4: Draw items and monsters from far to near (on top of walls)
    for (let dist = 3; dist >= 1; dist--) {
      this.drawSpritesAtDistance(ctx, party, floor, dist as 1 | 2 | 3, now);
    }

    // Step 5: Draw speech bubble if active
    const bark = getActiveBark(now);
    if (bark) {
      this.drawSpeechBubble(ctx, bark.bark.text, characters.indexOf(bark.speaker));
    }
  }
  
  private drawBackdrop(ctx: CanvasRenderingContext2D, party: Party, floor: FloorData) {
    // Choose backdrop based on party position
    const tile = floor.tiles[party.y][party.x];
    let backdropName = 'stone';
    
    if (tile.deepWater) {
      backdropName = 'deep';
    } else if (tile.shallowWater) {
      backdropName = 'shallow';
    }
    
    const backdropPath = `/sunken-keep/art/dungeon/backdrop_${backdropName}.png`;
    const backdrop = assets.getImage(backdropPath);
    
    if (backdrop && backdrop.complete) {
      ctx.drawImage(backdrop, 0, 0);
    } else {
      // Fallback: dark background
      ctx.fillStyle = '#0a1612';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    }
  }
  
  private drawWaterOverlays(ctx: CanvasRenderingContext2D, party: Party, floor: FloorData) {
    // Draw water overlays for each distance band
    for (let dist = 1; dist <= 3; dist++) {
      const pos = party.getPosition(dist, 0);
      if (!this.isInBounds(pos, floor)) continue;
      
      const tile = floor.tiles[pos.y][pos.x];
      if (tile.shallowWater || tile.deepWater) {
        const type = tile.deepWater ? 'deep' : 'shallow';
        const distKey = dist === 1 ? 'near' : dist === 2 ? 'mid' : 'far';
        const overlayPath = `/sunken-keep/art/dungeon/floor_water_${type}_${distKey}.png`;
        const overlay = assets.getImage(overlayPath);
        
        if (overlay && overlay.complete) {
          ctx.drawImage(overlay, 0, 0);
        }
      }
    }
  }
  
  private drawWallsAtDistance(
    ctx: CanvasRenderingContext2D,
    party: Party,
    floor: FloorData,
    distance: 1 | 2 | 3
  ) {
    // EOB-style thick wall rendering:
    // 1. Draw shifted front faces of left and right blocks first
    // 2. Draw side pieces on top
    // 3. Draw center front last
    
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    
    // Front piece x positions per distance (from artist's recipe)
    const frontX = {
      near: { center: 55, left: -105, right: 215 },
      mid: { center: 75, left: -45, right: 195 },
      far: { center: 95, left: 15, right: 175 }
    }[distKey];
    
    // Get tile info
    const leftPos = party.getPosition(distance, -1);
    const centerPos = party.getPosition(distance, 0);
    const rightPos = party.getPosition(distance, 1);
    
    const leftTile = this.isInBounds(leftPos, floor) ? floor.tiles[leftPos.y][leftPos.x] : null;
    const centerTile = this.isInBounds(centerPos, floor) ? floor.tiles[centerPos.y][centerPos.x] : null;
    const rightTile = this.isInBounds(rightPos, floor) ? floor.tiles[rightPos.y][rightPos.x] : null;
    
    const hasLeftWall = !leftTile || leftTile.wall || (leftTile.secret && !leftTile.secretOpen);
    const hasRightWall = !rightTile || rightTile.wall || (rightTile.secret && !rightTile.secretOpen);
    
    // Step 1: Draw shifted front faces for side blocks
    if (hasLeftWall) {
      this.drawWallFrontAt(ctx, distance, frontX.left);
    }
    if (hasRightWall) {
      this.drawWallFrontAt(ctx, distance, frontX.right);
    }
    
    // Step 2: Draw side pieces
    if (hasLeftWall) {
      this.drawWallSprite(ctx, distance, 'left');
    }
    if (hasRightWall) {
      this.drawWallSprite(ctx, distance, 'right');
    }
    
    // Step 3: Draw center (front) features
    if (!centerTile) {
      // Out of bounds = wall
      this.drawWallFrontAt(ctx, distance, frontX.center);
    } else if (centerTile.wall) {
      this.drawWallFrontAt(ctx, distance, frontX.center);
    } else if (centerTile.secret && !centerTile.secretOpen) {
      this.drawSecretSprite(ctx, distance, false);
      if (centerTile.carving) {
        this.drawCarving(ctx, centerTile.carving, distance);
      }
    } else if (centerTile.door && !centerTile.doorOpen) {
      this.drawDoorSprite(ctx, distance, centerTile.doorLocked || false);
      if (centerTile.carving) {
        this.drawCarving(ctx, centerTile.carving, distance);
      }
    }
  }
  
  private drawWallFrontAt(ctx: CanvasRenderingContext2D, distance: 1 | 2 | 3, x: number) {
    const distKey = distance === 1 ? 'near' : distance === 2 ? 'mid' : 'far';
    const imgPath = `/sunken-keep/art/dungeon/wall_front_${distKey}.png`;
    const img = assets.getImage(imgPath);
    
    if (!img || !img.complete) return;
    
    const yPos = {
      near: 30,
      mid: 50,
      far: 65
    }[distKey];
    
    ctx.drawImage(img, x, yPos);
  }
  
  private drawSpritesAtDistance(
    ctx: CanvasRenderingContext2D,
    party: Party,
    floor: FloorData,
    distance: 1 | 2 | 3,
    _now: number
  ) {
    // Only draw sprites in the front cell at this distance
    const pos = party.getPosition(distance, 0);
    if (!this.isInBounds(pos, floor)) return;
    
    const tile = floor.tiles[pos.y][pos.x];
    
    // Draw items first (behind monsters)
    if (tile.item) {
      this.drawItem(ctx, tile.item, distance);
    }
    
    // Draw monsters on top
    if (tile.monster) {
      this.drawMonsterSprite(ctx, tile.monster, distance, tile.monsterState || 'idle', tile.monsterAnimTime || 0);
    }
    
    // Draw carvings on front walls
    if (tile.carving && !tile.wall && !tile.door && !(tile.secret && !tile.secretOpen)) {
      this.drawCarving(ctx, tile.carving, distance);
    }
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

  drawControlPanel(
    ctx: CanvasRenderingContext2D,
    now: number,
    messageLog: MessageLog,
    hasKey: boolean,
    inventory: { potions: number; hasScroll: boolean },
    attackCooldowns: number[],
    facing: number
  ) {
    // Draw panel background
    const panelBg = assets.getImage(UI.PANEL_BG);
    if (panelBg && panelBg.complete) {
      ctx.drawImage(panelBg, 0, UI.PANEL_Y);
    } else {
      // Fallback solid background
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, UI.PANEL_Y, UI.CANVAS_WIDTH, UI.PANEL_HEIGHT);
    }
    
    // Draw portraits with HP bars (above panel, in the gap between viewport and panel)
    this.drawPortraits(ctx, now);
    
    // Draw attack buttons (one per hero)
    this.drawAttackButtons(ctx, attackCooldowns, now);
    
    // Draw message log
    this.drawMessageLog(ctx, messageLog);
    
    // Draw movement pad
    this.drawMovementPad(ctx);
    
    // Draw compass
    this.drawCompass(ctx, facing);
    
    // Draw menu button
    this.drawMenuButton(ctx);
    
    // Draw inventory
    this.drawInventory(ctx, hasKey, inventory);
  }
  
  private drawPortraits(ctx: CanvasRenderingContext2D, now: number) {
    // Portraits are drawn in a row above the panel, y=200 to y=264 (64px tall)
    const portraitY = 200;
    const portraitSize = 64;
    const spacing = (UI.CANVAS_WIDTH - portraitSize * 4) / 5;
    
    characters.forEach((char, i) => {
      const x = spacing + i * (portraitSize + spacing);
      const y = portraitY;
      
      // Portrait background
      ctx.fillStyle = '#0a0a08';
      ctx.fillRect(x, y, portraitSize, portraitSize);
      
      // Portrait image
      const state = getHealthState(char);
      const portraitPath = `/sunken-keep/art/portraits/${char.id}_${state}.png`;
      const img = assets.getImage(portraitPath) || assets.getImage(`/sunken-keep/art/portraits/${char.id}_healthy.png`);
      
      if (img && img.complete) {
        ctx.drawImage(img, x, y, portraitSize, portraitSize);
        
        // Damage flash
        if (char.hitFlashUntil > now) {
          ctx.save();
          ctx.globalAlpha = 0.5 - (now - (char.hitFlashUntil - 300)) / 600;
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(x, y, portraitSize, portraitSize);
          ctx.restore();
        }
      }
      
      // HP bar below portrait (inside panel area, just below portrait)
      const hpBarY = y + portraitSize + 2;
      const hpBarWidth = portraitSize - 2;
      const hpBarHeight = 4;
      const hpFill = Math.max(0, (char.hp / char.maxHp) * hpBarWidth);
      
      ctx.fillStyle = '#0a0a08';
      ctx.fillRect(x, hpBarY, hpBarWidth + 2, hpBarHeight + 2);
      
      ctx.fillStyle = char.hp > char.maxHp * 0.3 ? '#4a8a3a' : '#8a3a3a';
      ctx.fillRect(x + 1, hpBarY + 1, hpFill, hpBarHeight);
    });
  }
  
  private drawAttackButtons(ctx: CanvasRenderingContext2D, attackCooldowns: number[], _now: number) {
    UI.ATTACK_BUTTONS.forEach((btn, i) => {
      const onCooldown = attackCooldowns[i] > 0;
      this.draw9SliceButton(ctx, btn.x, btn.y, btn.w, btn.h, false);
      
      // Attack icon
      const icon = assets.getImage(UI.ICONS.attack);
      if (icon && icon.complete) {
        const iconX = btn.x + (btn.w - icon.width) / 2;
        const iconY = btn.y + (btn.h - icon.height) / 2;
        ctx.drawImage(icon, iconX, iconY);
      }
      
      // Cooldown overlay
      if (onCooldown) {
        ctx.fillStyle = 'rgba(128, 58, 58, 0.6)';
        const cooldownHeight = attackCooldowns[i] * btn.h;
        ctx.fillRect(btn.x + UI.BUTTON_SLICE_MARGIN, 
                     btn.y + btn.h - cooldownHeight, 
                     btn.w - UI.BUTTON_SLICE_MARGIN * 2, 
                     cooldownHeight);
      }
    });
  }
  
  private drawMessageLog(ctx: CanvasRenderingContext2D, messageLog: MessageLog) {
    const log = UI.LOG;
    
    // Log background is part of panel_bg, just draw text
    const messages = messageLog.getRecent(UI.LOG_MAX_LINES);
    let yOffset = log.y + UI.LOG_PADDING;
    
    messages.forEach(msg => {
      const wrapped = wrapText(msg.text, log.w - UI.LOG_PADDING * 2);
      wrapped.forEach(line => {
        if (yOffset < log.y + log.h - UI.LOG_PADDING) {
          drawText(ctx, line, log.x + UI.LOG_PADDING, yOffset, msg.color || UI.LOG_TEXT_COLOR);
          yOffset += UI.LOG_LINE_HEIGHT;
        }
      });
    });
  }
  
  private drawMovementPad(ctx: CanvasRenderingContext2D) {
    UI.MOVEMENT_PAD.forEach(btn => {
      this.draw9SliceButton(ctx, btn.x, btn.y, btn.w, btn.h, false);
      
      // Icon
      const iconPath = UI.ICONS[btn.key as keyof typeof UI.ICONS];
      const icon = assets.getImage(iconPath);
      if (icon && icon.complete) {
        const iconX = btn.x + (btn.w - icon.width) / 2;
        const iconY = btn.y + (btn.h - icon.height) / 2;
        ctx.drawImage(icon, iconX, iconY);
      }
    });
  }
  
  private drawCompass(ctx: CanvasRenderingContext2D, facing: number) {
    const compass = UI.COMPASS;
    
    // Get compass sprite for current facing
    const directions = ['N', 'E', 'S', 'W'] as const;
    const compassSprite = UI.COMPASS_SPRITES[directions[facing]];
    const img = assets.getImage(compassSprite);
    
    if (img && img.complete) {
      ctx.drawImage(img, compass.x, compass.y);
    } else {
      // Fallback: draw simple compass
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(compass.x, compass.y, compass.w, compass.h);
      ctx.strokeStyle = '#4a3a2a';
      ctx.strokeRect(compass.x + 0.5, compass.y + 0.5, compass.w - 1, compass.h - 1);
      
      const label = directions[facing];
      drawText(ctx, label, compass.x + compass.w / 2 - 3, compass.y + compass.h / 2 - 3, '#8a6a4a');
    }
  }
  
  private drawMenuButton(ctx: CanvasRenderingContext2D) {
    const btn = UI.MENU_BUTTON;
    this.draw9SliceButton(ctx, btn.x, btn.y, btn.w, btn.h, false);
    
    // Menu icon
    const icon = assets.getImage(UI.ICONS.menu);
    if (icon && icon.complete) {
      const iconX = btn.x + (btn.w - icon.width) / 2;
      const iconY = btn.y + (btn.h - icon.height) / 2;
      ctx.drawImage(icon, iconX, iconY);
    }
  }
  
  private drawInventory(ctx: CanvasRenderingContext2D, hasKey: boolean, inventory: { potions: number; hasScroll: boolean }) {
    // Draw inventory slot backgrounds (part of panel_bg, just draw items)
    let slotIndex = 0;
    
    // Key in slot 0
    if (hasKey) {
      const slot = UI.INV_SLOTS[slotIndex];
      const keyImg = assets.getImage('/sunken-keep/art/dungeon/key.png');
      if (keyImg && keyImg.complete) {
        ctx.drawImage(keyImg, slot.x + 1, slot.y + 1, slot.w - 2, slot.h - 2);
      } else {
        drawText(ctx, 'KEY', slot.x + 4, slot.y + 10, '#aa8a4a');
      }
      slotIndex++;
    }
    
    // Potions in next slots
    for (let i = 0; i < Math.min(inventory.potions, 3); i++) {
      if (slotIndex < UI.INV_SLOTS.length) {
        const slot = UI.INV_SLOTS[slotIndex];
        drawText(ctx, 'POT', slot.x + 4, slot.y + 10, '#4a8a8a');
        slotIndex++;
      }
    }
    
    // Scroll in next slot
    if (inventory.hasScroll && slotIndex < UI.INV_SLOTS.length) {
      const slot = UI.INV_SLOTS[slotIndex];
      drawText(ctx, 'SCR', slot.x + 4, slot.y + 10, '#aa8a6a');
    }
  }
  
  private draw9SliceButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pressed: boolean) {
    const buttonImg = assets.getImage(pressed ? UI.BUTTON_PRESSED : UI.BUTTON_NORMAL);
    
    if (!buttonImg || !buttonImg.complete) {
      // Fallback: simple rect
      ctx.fillStyle = pressed ? '#2a2622' : '#3a2a1a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#5a4a3a';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    
    const margin = UI.BUTTON_SLICE_MARGIN;
    const srcW = buttonImg.width;
    const srcH = buttonImg.height;
    
    // 9-slice rendering: corners, edges, center
    // Corners (4x4 px)
    ctx.drawImage(buttonImg, 0, 0, margin, margin, x, y, margin, margin);  // top-left
    ctx.drawImage(buttonImg, srcW - margin, 0, margin, margin, x + w - margin, y, margin, margin);  // top-right
    ctx.drawImage(buttonImg, 0, srcH - margin, margin, margin, x, y + h - margin, margin, margin);  // bottom-left
    ctx.drawImage(buttonImg, srcW - margin, srcH - margin, margin, margin, x + w - margin, y + h - margin, margin, margin);  // bottom-right
    
    // Edges (stretched)
    ctx.drawImage(buttonImg, margin, 0, srcW - margin * 2, margin, x + margin, y, w - margin * 2, margin);  // top
    ctx.drawImage(buttonImg, margin, srcH - margin, srcW - margin * 2, margin, x + margin, y + h - margin, w - margin * 2, margin);  // bottom
    ctx.drawImage(buttonImg, 0, margin, margin, srcH - margin * 2, x, y + margin, margin, h - margin * 2);  // left
    ctx.drawImage(buttonImg, srcW - margin, margin, margin, srcH - margin * 2, x + w - margin, y + margin, margin, h - margin * 2);  // right
    
    // Center (stretched)
    ctx.drawImage(buttonImg, margin, margin, srcW - margin * 2, srcH - margin * 2, x + margin, y + margin, w - margin * 2, h - margin * 2);
  }
}
