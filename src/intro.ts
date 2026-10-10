import { assets, sound } from './assets';
import { drawText, wrapText } from './font';

interface IntroShot {
  file: string;
  panX: [number, number];
  duration: number;
  effects?: string[];
}

interface IntroCaption {
  text: string;
  start: number;
  end: number;
}

interface EyePos {
  x: number;
  y: number;
  scale: number;
  openTime: number;
}

export class IntroPlayer {
  private width = 270;
  private height = 480;
  private shots: IntroShot[] = [];
  private captions: IntroCaption[] = [];
  private currentTime = 0;
  private startTime = 0;
  private finished = false;
  private skipped = false;
  
  // Shot 4 eyes
  private eyesSprite: HTMLImageElement | null = null;
  private eyePositions: EyePos[] = [];
  
  // Shot 5 boat (from intro.json)
  private boatSprite: HTMLImageElement | null = null;
  private boatFromX = 427;
  private boatFromY = 560;
  private boatFromScale = 1.0;
  private boatToX = 427;
  private boatToY = 345;
  private boatToScale = 0.5;
  
  // Title
  private titleSprite: HTMLImageElement | null = null;
  
  async load() {
    // Load shots
    for (let i = 1; i <= 6; i++) {
      assets.loadImage(`/sunken-keep/art/intro/shot${i}_${['keep', 'sinking', 'forge', 'drowned', 'swamp', 'gate'][i-1]}.png`);
    }
    
    // Load sprites
    this.eyesSprite = assets.loadImage('/sunken-keep/art/intro/eyes.png');
    this.boatSprite = assets.loadImage('/sunken-keep/art/intro/boat.png');
    this.titleSprite = assets.loadImage('/sunken-keep/art/intro/title.png');
    
    await assets.waitForAll();
    
    // Define shots with durations
    this.shots = [
      { file: 'shot1_keep.png', panX: [150, 430], duration: 6, effects: ['sparks'] },
      { file: 'shot2_sinking.png', panX: [430, 150], duration: 6, effects: ['rain', 'shake', 'lightning'] },
      { file: 'shot3_forge.png', panX: [292, 292], duration: 6, effects: ['bubbles', 'hammer'] },
      { file: 'shot4_drowned.png', panX: [100, 420], duration: 6, effects: ['eyes'] },
      { file: 'shot5_swamp.png', panX: [292, 292], duration: 5, effects: ['boat', 'fog'] },
      { file: 'shot6_gate.png', panX: [0, 584], duration: 6, effects: ['title'] }
    ];
    
    // Define captions
    this.captions = [
      { text: 'Stonevow Keep sank in a single night.', start: 7.0, end: 11.5 },
      { text: 'Its forges went cold.', start: 13.0, end: 17.5 },
      { text: 'Its people did not leave.', start: 19.5, end: 23.5 },
      { text: 'Four fools have come to find out why.', start: 29.0, end: 32.5 }
    ];
    
    // Eye positions for shot 4
    this.eyePositions = [
      { x: 430, y: 272, scale: 1, openTime: 18.5 },
      { x: 338, y: 273, scale: 1, openTime: 19.1 },
      { x: 528, y: 273, scale: 1, openTime: 19.7 },
      { x: 385, y: 276, scale: 1, openTime: 20.3 },
      { x: 260, y: 284, scale: 1, openTime: 20.9 },
      { x: 485, y: 284, scale: 1, openTime: 21.5 },
      { x: 564, y: 275, scale: 1, openTime: 22.1 },
      { x: 146, y: 298, scale: 2, openTime: 22.7 }
    ];
  }

  start() {
    this.startTime = Date.now();
    this.currentTime = 0;
    this.finished = false;
    this.skipped = false;
    sound.playMusic('intro');
  }

  skip() {
    this.skipped = true;
    this.finished = true;
    sound.stopMusic();
  }

  update() {
    if (this.finished) return;
    
    this.currentTime = (Date.now() - this.startTime) / 1000;
    
    if (this.currentTime >= 35 || this.skipped) {
      this.finished = true;
      sound.stopMusic();
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.finished) return;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Determine current shot
    let elapsed = 0;
    let shotIndex = 0;
    for (let i = 0; i < this.shots.length; i++) {
      if (this.currentTime < elapsed + this.shots[i].duration) {
        shotIndex = i;
        break;
      }
      elapsed += this.shots[i].duration;
    }
    
    const shot = this.shots[shotIndex];
    const shotTime = this.currentTime - elapsed;
    const progress = shotTime / shot.duration;
    
    // Render shot
    this.renderShot(ctx, shot, shotIndex, progress, shotTime);
    
    // Render captions
    for (const caption of this.captions) {
      if (this.currentTime >= caption.start && this.currentTime <= caption.end) {
        this.renderCaption(ctx, caption.text);
      }
    }
    
    // Skip button
    drawText(ctx, 'TAP TO SKIP', this.width - 72, 5, '#888888');
  }

  private renderShot(ctx: CanvasRenderingContext2D, shot: IntroShot, _shotIndex: number, progress: number, shotTime: number) {
    const img = assets.getImage(`/sunken-keep/art/intro/${shot.file}`);
    if (!img || !img.complete) return;
    
    // Calculate pan position
    const panX = shot.panX[0] + (shot.panX[1] - shot.panX[0]) * progress;
    
    // Apply shake for shot 2
    let offsetX = 0;
    let offsetY = 0;
    if (shot.effects?.includes('shake') && shotTime > 1 && shotTime < 5) {
      offsetX = (Math.random() - 0.5) * 6;
      offsetY = (Math.random() - 0.5) * 6;
    }
    
    // Draw shot
    ctx.drawImage(img, panX, 0, this.width, this.height, offsetX, offsetY, this.width, this.height);
    
    // Apply effects
    if (shot.effects) {
      if (shot.effects.includes('lightning') && shotTime > 1) {
        // Lightning flash at ~6.2s
        const flashTime = this.currentTime - 6.2;
        if (flashTime >= 0 && flashTime < 0.2) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.6 - flashTime * 3})`;
          ctx.fillRect(0, 0, this.width, this.height);
        }
      }
      
      if (shot.effects.includes('rain')) {
        this.renderRain(ctx, shotTime);
      }
      
      if (shot.effects.includes('bubbles')) {
        this.renderBubbles(ctx, shotTime);
      }
      
      if (shot.effects.includes('eyes')) {
        this.renderEyes(ctx, panX);
      }
      
      if (shot.effects.includes('boat')) {
        this.renderBoat(ctx, shotTime);
      }
      
      if (shot.effects.includes('fog')) {
        this.renderFog(ctx, shotTime);
      }
      
      if (shot.effects.includes('title') && shotTime > 4) {
        this.renderTitle(ctx, shotTime - 4);
      }
    }
  }

  private renderRain(ctx: CanvasRenderingContext2D, time: number) {
    ctx.strokeStyle = '#4488aa';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    
    for (let i = 0; i < 40; i++) {
      const x = (i * 17 + time * 150) % this.width;
      const y = (i * 23 + time * 200) % this.height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 8);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
  }

  private renderBubbles(ctx: CanvasRenderingContext2D, time: number) {
    ctx.strokeStyle = '#88ccff';
    ctx.globalAlpha = 0.3;
    
    for (let i = 0; i < 10; i++) {
      const x = 80 + i * 20;
      const y = 300 - (time + i * 0.5) * 50 % 350;
      const size = 2 + (i % 3);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
  }

  private renderEyes(ctx: CanvasRenderingContext2D, panX: number) {
    if (!this.eyesSprite || !this.eyesSprite.complete) return;
    
    for (const eye of this.eyePositions) {
      if (this.currentTime < eye.openTime) continue;
      
      const timeSinceOpen = this.currentTime - eye.openTime;
      let frame = 0;
      if (timeSinceOpen > 0.3) frame = 2;
      else if (timeSinceOpen > 0.15) frame = 1;
      
      const eyeWidth = eye.scale === 2 ? 16 : 8;
      const eyeHeight = eye.scale === 2 ? 4 : 2;
      const sx = frame * 8;
      const sy = 0;
      
      const screenX = eye.x - panX;
      if (screenX >= -eyeWidth && screenX <= this.width) {
        ctx.drawImage(
          this.eyesSprite,
          sx, sy, 8, 2,
          screenX, eye.y, eyeWidth, eyeHeight
        );
      }
    }
  }

  private renderBoat(ctx: CanvasRenderingContext2D, shotTime: number) {
    if (!this.boatSprite || !this.boatSprite.complete) return;
    
    // Interpolate position and scale with ease-out
    const progress = Math.min(shotTime / 5, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    
    // Boat position in shot space (854x480)
    const shotX = this.boatFromX + (this.boatToX - this.boatFromX) * eased;
    const shotY = this.boatFromY + (this.boatToY - this.boatFromY) * eased;
    const scale = this.boatFromScale + (this.boatToScale - this.boatFromScale) * eased;
    
    // Shot 5 panX is 292 (static), so viewport shows from x=292 to x=562 of the shot
    // Convert shot position to viewport position
    const viewportX = shotX - 292;
    const viewportY = shotY;
    
    // Calculate scaled sprite dimensions
    const scaledWidth = this.boatSprite.width * scale;
    const scaledHeight = this.boatSprite.height * scale;
    
    // Boat anchor is at bottom-centre of sprite
    const drawX = viewportX - scaledWidth / 2;
    const drawY = viewportY - scaledHeight;
    
    // Only draw if in viewport
    if (drawY < this.height) {
      ctx.save();
      
      // Use nearest-neighbor scaling for crisp pixels
      ctx.imageSmoothingEnabled = false;
      
      // Draw scaled boat
      ctx.drawImage(
        this.boatSprite,
        drawX,
        drawY,
        scaledWidth,
        scaledHeight
      );
      
      ctx.restore();
    }
  }

  private renderFog(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = 'rgba(200, 220, 210, 0.15)';
    
    for (let layer = 0; layer < 3; layer++) {
      const offset = (time * (10 + layer * 5)) % (this.width + 100);
      ctx.fillRect(-100 + offset, 100 + layer * 40, 200, 30);
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D, fadeTime: number) {
    if (!this.titleSprite || !this.titleSprite.complete) return;
    
    const alpha = Math.min(fadeTime / 1.5, 1);
    ctx.globalAlpha = alpha;
    
    const x = (this.width - this.titleSprite.width) / 2;
    const y = 60;
    ctx.drawImage(this.titleSprite, x, y);
    
    ctx.globalAlpha = 1;
  }

  private renderCaption(ctx: CanvasRenderingContext2D, text: string) {
    const lines = wrapText(text, this.width - 20);
    const lineHeight = 10;
    const totalHeight = lines.length * lineHeight;
    const startY = this.height - totalHeight - 30;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, startY - 5, this.width, totalHeight + 10);
    
    // Text
    lines.forEach((line, i) => {
      const x = (this.width - line.length * 6) / 2;
      drawText(ctx, line, x, startY + i * lineHeight, '#ffffff');
    });
  }

  isFinished(): boolean {
    return this.finished;
  }

  handleTap(x: number, y: number) {
    if (y < 20 && x > this.width - 80) {
      this.skip();
    }
  }
}
