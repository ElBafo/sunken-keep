import { assets, sound } from './assets';
import { drawText, wrapText } from './font';

export interface CutsceneLayer {
  image: string;
  x?: number;
  y?: number;
  frames?: string[]; // Frame sequence
  frameDuration?: number; // ms per frame
  pan?: { startX: number; startY: number; endX: number; endY: number; duration: number };
  parallax?: number; // 0-1, scroll speed multiplier
  flicker?: { minAlpha: number; maxAlpha: number; speed: number };
  fadeIn?: number; // duration in ms
  fadeOut?: number; // start time in ms
}

export interface CutsceneCaption {
  text: string;
  startTime: number;
  duration: number;
  color?: string;
}

export interface CutsceneScene {
  duration: number; // ms
  layers: CutsceneLayer[];
  captions?: CutsceneCaption[];
  music?: string;
  sfx?: string;
  tapToAdvance?: boolean;
}

export interface CutsceneData {
  width: number;
  height: number;
  scenes: CutsceneScene[];
}

export class CutscenePlayer {
  private data: CutsceneData | null = null;
  private currentScene = 0;
  private sceneStartTime = 0;
  private finished = false;

  async load(path: string) {
    const response = await fetch(path);
    this.data = await response.json();
    
    // Preload all images
    if (this.data) {
      for (const scene of this.data.scenes) {
        for (const layer of scene.layers) {
          if (layer.frames) {
            layer.frames.forEach(frame => assets.loadImage(frame));
          } else {
            assets.loadImage(layer.image);
          }
        }
      }
      
      await assets.waitForAll();
    }
  }

  start() {
    this.currentScene = 0;
    this.sceneStartTime = Date.now();
    this.finished = false;
    
    if (this.data && this.data.scenes[0].music) {
      sound.play(this.data.scenes[0].music);
    }
    if (this.data && this.data.scenes[0].sfx) {
      sound.play(this.data.scenes[0].sfx);
    }
  }

  skip() {
    this.finished = true;
  }

  advance() {
    if (!this.data) return;
    
    const scene = this.data.scenes[this.currentScene];
    const elapsed = Date.now() - this.sceneStartTime;
    
    if (scene.tapToAdvance || elapsed >= scene.duration) {
      this.currentScene++;
      
      if (this.currentScene >= this.data.scenes.length) {
        this.finished = true;
        return;
      }
      
      this.sceneStartTime = Date.now();
      
      const nextScene = this.data.scenes[this.currentScene];
      if (nextScene.music) sound.play(nextScene.music);
      if (nextScene.sfx) sound.play(nextScene.sfx);
    }
  }

  update() {
    if (!this.data || this.finished) return;
    
    const scene = this.data.scenes[this.currentScene];
    const elapsed = Date.now() - this.sceneStartTime;
    
    if (!scene.tapToAdvance && elapsed >= scene.duration) {
      this.advance();
    }
  }

  render(ctx: CanvasRenderingContext2D, now: number) {
    if (!this.data || this.finished) return;
    
    const scene = this.data.scenes[this.currentScene];
    const elapsed = now - this.sceneStartTime;
    
    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.data.width, this.data.height);
    
    // Render layers
    for (const layer of scene.layers) {
      this.renderLayer(ctx, layer, elapsed, now);
    }
    
    // Render captions
    if (scene.captions) {
      for (const caption of scene.captions) {
        if (elapsed >= caption.startTime && elapsed < caption.startTime + caption.duration) {
          this.renderCaption(ctx, caption);
        }
      }
    }
    
    // Skip button
    this.renderSkipButton(ctx);
  }

  private renderLayer(ctx: CanvasRenderingContext2D, layer: CutsceneLayer, elapsed: number, now: number) {
    let img: HTMLImageElement | undefined;
    
    if (layer.frames && layer.frameDuration) {
      const frameIndex = Math.floor(elapsed / layer.frameDuration) % layer.frames.length;
      img = assets.getImage(layer.frames[frameIndex]);
    } else {
      img = assets.getImage(layer.image);
    }
    
    if (!img || !img.complete) return;
    
    let x = layer.x || 0;
    let y = layer.y || 0;
    let alpha = 1;
    
    // Pan
    if (layer.pan) {
      const panProgress = Math.min(elapsed / layer.pan.duration, 1);
      x = layer.pan.startX + (layer.pan.endX - layer.pan.startX) * panProgress;
      y = layer.pan.startY + (layer.pan.endY - layer.pan.startY) * panProgress;
    }
    
    // Parallax (simple horizontal scroll)
    if (layer.parallax !== undefined) {
      x -= (elapsed * 0.01 * layer.parallax);
    }
    
    // Flicker
    if (layer.flicker) {
      const flickerValue = Math.sin(now * layer.flicker.speed * 0.01) * 0.5 + 0.5;
      alpha = layer.flicker.minAlpha + (layer.flicker.maxAlpha - layer.flicker.minAlpha) * flickerValue;
    }
    
    // Fade in
    if (layer.fadeIn && elapsed < layer.fadeIn) {
      alpha *= elapsed / layer.fadeIn;
    }
    
    // Fade out
    if (layer.fadeOut && elapsed > layer.fadeOut) {
      const fadeOutDuration = 1000; // 1 second fade out
      alpha *= 1 - Math.min((elapsed - layer.fadeOut) / fadeOutDuration, 1);
    }
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, Math.floor(x), Math.floor(y));
    ctx.restore();
  }

  private renderCaption(ctx: CanvasRenderingContext2D, caption: CutsceneCaption) {
    if (!this.data) return;
    
    const lines = wrapText(caption.text, this.data.width - 20);
    const lineHeight = 10;
    const totalHeight = lines.length * lineHeight;
    const startY = this.data.height - totalHeight - 20;
    
    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, startY - 5, this.data.width, totalHeight + 10);
    
    // Draw text
    lines.forEach((line, i) => {
      const x = (this.data!.width - line.length * 6) / 2;
      drawText(ctx, line, x, startY + i * lineHeight, caption.color || '#ffffff');
    });
  }

  private renderSkipButton(ctx: CanvasRenderingContext2D) {
    if (!this.data) return;
    
    const text = 'TAP TO SKIP';
    const x = this.data.width - text.length * 6 - 5;
    const y = 5;
    
    drawText(ctx, text, x, y, '#888888');
  }

  isFinished(): boolean {
    return this.finished;
  }

  isWaitingForTap(): boolean {
    if (!this.data || this.finished) return false;
    const scene = this.data.scenes[this.currentScene];
    const elapsed = Date.now() - this.sceneStartTime;
    return (scene.tapToAdvance === true) && elapsed >= scene.duration;
  }
}
