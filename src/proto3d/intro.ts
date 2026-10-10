import { StoryText } from './i18n';

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
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private shots: IntroShot[] = [];
  private captions: IntroCaption[] = [];
  private currentTime = 0;
  private startTime = 0;
  private finished = false;
  private skipped = false;
  private eyePositions: EyePos[] = [];
  private boatFrom = { x: 427, y: 560, scale: 1 };
  private boatTo = { x: 427, y: 345, scale: 0.5 };
  private story: StoryText;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement, story: StoryText) {
    this.ctx = canvas.getContext('2d')!;
    this.story = story;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    const names = [
      'shot1_keep.png',
      'shot2_sinking.png',
      'shot3_forge.png',
      'shot4_drowned.png',
      'shot5_swamp.png',
      'shot6_gate.png',
      'eyes.png',
      'boat.png',
      'title.png'
    ];
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(name, img);
              resolve();
            };
            img.onerror = () => reject(new Error(name));
            img.src = `${base}art/intro/${name}`;
          })
      )
    );

    this.shots = [
      { file: 'shot1_keep.png', panX: [150, 430], duration: 6, effects: ['sparks'] },
      { file: 'shot2_sinking.png', panX: [430, 150], duration: 6, effects: ['rain', 'shake', 'lightning'] },
      { file: 'shot3_forge.png', panX: [292, 292], duration: 6, effects: ['bubbles'] },
      { file: 'shot4_drowned.png', panX: [100, 420], duration: 6, effects: ['eyes'] },
      { file: 'shot5_swamp.png', panX: [292, 292], duration: 5, effects: ['boat', 'fog'] },
      { file: 'shot6_gate.png', panX: [0, 584], duration: 6, effects: ['title'] }
    ];
    this.captions = [
      { text: this.story.log('intro_keep'), start: 7, end: 11.5 },
      { text: this.story.log('intro_forges'), start: 13, end: 17.5 },
      { text: this.story.log('intro_people'), start: 19.5, end: 23.5 },
      { text: this.story.log('intro_fools'), start: 29, end: 32.5 }
    ];
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
    this.startTime = performance.now();
    this.currentTime = 0;
    this.finished = false;
    this.skipped = false;
    const tick = () => {
      if (this.finished) return;
      this.update();
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  skip() {
    this.skipped = true;
    this.finished = true;
    cancelAnimationFrame(this.raf);
  }

  isFinished(): boolean {
    return this.finished;
  }

  private update() {
    this.currentTime = (performance.now() - this.startTime) / 1000;
    if (this.currentTime >= 35 || this.skipped) {
      this.finished = true;
      cancelAnimationFrame(this.raf);
    }
  }

  private render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

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
    const progress = Math.min(1, shotTime / shot.duration);
    this.renderShot(shot, progress, shotTime);

    for (const caption of this.captions) {
      if (caption.text && this.currentTime >= caption.start && this.currentTime <= caption.end) {
        this.renderCaption(caption.text);
      }
    }
  }

  private renderShot(shot: IntroShot, progress: number, shotTime: number) {
    const img = this.images.get(shot.file);
    if (!img) return;
    const ctx = this.ctx;
    const panX = shot.panX[0] + (shot.panX[1] - shot.panX[0]) * progress;
    let ox = 0;
    let oy = 0;
    if (shot.effects?.includes('shake') && shotTime > 1 && shotTime < 5) {
      ox = (Math.random() - 0.5) * 6;
      oy = (Math.random() - 0.5) * 6;
    }
    ctx.drawImage(img, panX, 0, this.width, this.height, ox, oy, this.width, this.height);
    if (shot.effects?.includes('lightning')) {
      const flashTime = this.currentTime - 6.2;
      if (flashTime >= 0 && flashTime < 0.2) {
        ctx.fillStyle = `rgba(255,255,255,${0.6 - flashTime * 3})`;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }
    if (shot.effects?.includes('rain')) this.renderRain(shotTime);
    if (shot.effects?.includes('bubbles')) this.renderBubbles(shotTime);
    if (shot.effects?.includes('eyes')) this.renderEyes(panX);
    if (shot.effects?.includes('boat')) this.renderBoat(shotTime);
    if (shot.effects?.includes('fog')) this.renderFog(shotTime);
    if (shot.effects?.includes('title') && shotTime > 4) this.renderTitle(shotTime - 4);
  }

  private renderRain(time: number) {
    const ctx = this.ctx;
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

  private renderBubbles(time: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#88ccff';
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 10; i++) {
      const x = 80 + i * 20;
      const y = 300 - ((time + i * 0.5) * 50) % 350;
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private renderEyes(panX: number) {
    const eyes = this.images.get('eyes.png');
    if (!eyes) return;
    const ctx = this.ctx;
    for (const eye of this.eyePositions) {
      if (this.currentTime < eye.openTime) continue;
      const since = this.currentTime - eye.openTime;
      const frame = since > 0.3 ? 2 : since > 0.15 ? 1 : 0;
      const w = eye.scale === 2 ? 16 : 8;
      const h = eye.scale === 2 ? 4 : 2;
      const sx = frame * 8;
      const screenX = eye.x - panX;
      if (screenX >= -w && screenX <= this.width) {
        ctx.drawImage(eyes, sx, 0, 8, 2, screenX, eye.y, w, h);
      }
    }
  }

  private renderBoat(shotTime: number) {
    const boat = this.images.get('boat.png');
    if (!boat) return;
    const progress = Math.min(shotTime / 5, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const shotX = this.boatFrom.x + (this.boatTo.x - this.boatFrom.x) * eased;
    const shotY = this.boatFrom.y + (this.boatTo.y - this.boatFrom.y) * eased;
    const scale = this.boatFrom.scale + (this.boatTo.scale - this.boatFrom.scale) * eased;
    const drawX = shotX - 292 - (boat.width * scale) / 2;
    const drawY = shotY - boat.height * scale;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(boat, drawX, drawY, boat.width * scale, boat.height * scale);
  }

  private renderFog(time: number) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(200, 220, 210, 0.15)';
    for (let layer = 0; layer < 3; layer++) {
      const offset = (time * (10 + layer * 5)) % (this.width + 100);
      ctx.fillRect(-100 + offset, 100 + layer * 40, 200, 30);
    }
  }

  private renderTitle(fadeTime: number) {
    const title = this.images.get('title.png');
    if (!title) return;
    this.ctx.globalAlpha = Math.min(fadeTime / 1.5, 1);
    this.ctx.drawImage(title, (this.width - title.width) / 2, 60);
    this.ctx.globalAlpha = 1;
  }

  private renderCaption(text: string) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, this.height - 48, this.width, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, this.width / 2, this.height - 26);
  }
}
