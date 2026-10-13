import { fetchJsonCached, loadHtmlImage } from './asset-cache';
import { drawFont5x7, wrapCaption, CAPTION_CHAR_PX, type FontGlyphs } from './font5x7';
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

interface CaptionRow {
  id?: string;
  text?: string;
  start?: number;
  end?: number;
}

interface CaptionFile {
  en?: CaptionRow[];
  el?: CaptionRow[];
}

interface EyePos {
  x: number;
  y: number;
  scale: number;
  openTime: number;
}

export const INTRO_IMAGE_FILES = [
  'shot1_keep.png',
  'shot2_sinking.png',
  'shot3_forge.png',
  'shot4_drowned.png',
  'shot5_swamp.png',
  'shot6_gate.png',
  'eyes.png',
  'boat.png',
  'title.png'
] as const;

export const INTRO_SHOT_FILES = INTRO_IMAGE_FILES.slice(0, 6);

export const INTRO_DURATION_SEC = 35;

/** Keep the last shot when time is past the timeline instead of wrapping to shot 1. */
export function introShotIndex(durations: readonly number[], time: number): number {
  if (durations.length === 0) return 0;
  let elapsed = 0;
  for (let i = 0; i < durations.length; i++) {
    if (time < elapsed + durations[i]) return i;
    elapsed += durations[i];
  }
  return durations.length - 1;
}

export function captionTextAt(captions: readonly IntroCaption[], time: number): string {
  for (const caption of captions) {
    if (caption.text && time >= caption.start && time <= caption.end) return caption.text;
  }
  return '';
}

export class IntroPlayer {
  private width = 270;
  private height = 480;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private imageLoads = new Map<string, Promise<HTMLImageElement | null>>();
  private failed = new Set<string>();
  private shots: IntroShot[] = [];
  private captions: IntroCaption[] = [];
  private captionFile: CaptionFile | null = null;
  private captionsPromise: Promise<void> | null = null;
  private currentTime = 0;
  private lastTick = 0;
  private elapsedMs = 0;
  private started = false;
  private finished = false;
  private skipped = false;
  private waitingForShot = false;
  private needShot: ((waiting: boolean) => void) | null = null;
  private timeSource: (() => number | null) | null = null;
  private font: HTMLImageElement | null = null;
  private fontGlyphs: FontGlyphs = {};
  private eyePositions: EyePos[] = [];
  private boatFrom = { x: 427, y: 560, scale: 1 };
  private boatTo = { x: 427, y: 345, scale: 0.5 };
  private story: StoryText;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement, story: StoryText) {
    this.ctx = canvas.getContext('2d')!;
    this.story = story;
  }

  /** Shot 1 + captions + font. Does not pull the rest of the intro reel. */
  preloadShot1() {
    this.ensureTimeline();
    const shot = this.shots[0];
    if (shot) void this.loadImage(shot.file);
    void this.loadCaptions();
    void this.loadFont();
  }

  /** Kick off every intro image, captions, and the 5×7 font. Safe to call more than once. */
  preload() {
    this.preloadShot1();
    for (const name of INTRO_IMAGE_FILES) void this.loadImage(name);
  }

  /** Drive caption/shot time from intro music `currentTime`. Null falls back to elapsed. */
  setTimeSource(source: (() => number | null) | null) {
    this.timeSource = source;
  }

  applyLocale() {
    this.applyCaptionRows();
  }

  async load() {
    this.preload();
    await Promise.all([
      ...INTRO_IMAGE_FILES.map((name) => this.loadImage(name)),
      this.loadCaptions(),
      this.loadFont()
    ]);
  }

  hasShot(index: number): boolean {
    this.ensureTimeline();
    const shot = this.shots[index];
    return !!shot && (this.images.has(shot.file) || this.failed.has(shot.file));
  }

  whenShot(index: number): Promise<void> {
    this.ensureTimeline();
    const shot = this.shots[index];
    if (!shot) return Promise.resolve();
    return this.loadImage(shot.file).then(() => undefined);
  }

  whenShot1(): Promise<void> {
    return this.whenShot(0);
  }

  setNeedShot(handler: ((waiting: boolean) => void) | null) {
    this.needShot = handler;
  }

  hasStarted(): boolean {
    return this.started;
  }

  start() {
    if (this.started || this.finished) return;
    this.preload();
    this.started = true;
    this.ensureTimeline();
    this.lastTick = performance.now();
    this.elapsedMs = 0;
    this.currentTime = 0;
    this.finished = false;
    this.skipped = false;
    this.waitingForShot = false;
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
    this.started = true;
    this.setWaiting(false);
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  isFinished(): boolean {
    return this.finished;
  }

  private ensureTimeline() {
    if (this.shots.length) return;
    this.shots = [
      { file: 'shot1_keep.png', panX: [150, 430], duration: 6, effects: ['sparks'] },
      { file: 'shot2_sinking.png', panX: [430, 150], duration: 6, effects: ['rain', 'shake', 'lightning'] },
      { file: 'shot3_forge.png', panX: [292, 292], duration: 6, effects: ['bubbles'] },
      { file: 'shot4_drowned.png', panX: [100, 420], duration: 6, effects: ['eyes'] },
      { file: 'shot5_swamp.png', panX: [292, 292], duration: 5, effects: ['boat', 'fog'] },
      { file: 'shot6_gate.png', panX: [0, 584], duration: 6, effects: ['title'] }
    ];
    this.applyCaptionRows();
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

  private loadImage(name: string): Promise<HTMLImageElement | null> {
    const existing = this.imageLoads.get(name);
    if (existing) return existing;
    const base = import.meta.env.BASE_URL;
    const pending = loadHtmlImage(`${base}art/intro/${name}`)
      .then((img) => {
        this.images.set(name, img);
        return img;
      })
      .catch(() => {
        this.failed.add(name);
        return null;
      });
    this.imageLoads.set(name, pending);
    return pending;
  }

  private shotIndexAt(time: number): number {
    return introShotIndex(
      this.shots.map((s) => s.duration),
      time
    );
  }

  private loadCaptions(): Promise<void> {
    if (this.captionsPromise) return this.captionsPromise;
    const base = import.meta.env.BASE_URL;
    this.captionsPromise = (async () => {
      try {
        this.captionFile = (await fetchJsonCached(`${base}story/intro_captions.json`)) as CaptionFile;
        this.applyCaptionRows();
      } catch {
        this.captionFile = this.captionFile ?? null;
      }
    })();
    return this.captionsPromise;
  }

  private applyCaptionRows() {
    const file = this.captionFile;
    if (!file) {
      this.captions = [];
      return;
    }
    const locale = this.story.locale === 'el' ? 'el' : 'en';
    const rows = file[locale] ?? file.en ?? [];
    this.captions = rows
      .filter((row) => typeof row.text === 'string' && typeof row.start === 'number' && typeof row.end === 'number')
      .map((row) => ({ text: row.text as string, start: row.start as number, end: row.end as number }));
  }

  private loadFont(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    return Promise.all([
      this.font
        ? Promise.resolve()
        : loadHtmlImage(`${base}art/font/font_5x7.png`)
            .then((img) => {
              this.font = img;
            })
            .catch(() => undefined),
      fetchJsonCached<{ glyphs?: FontGlyphs }>(`${base}art/font/font_5x7.json`)
        .then((meta) => {
          this.fontGlyphs = meta.glyphs ?? {};
        })
        .catch(() => undefined)
    ]).then(() => undefined);
  }

  private setWaiting(waiting: boolean) {
    if (this.waitingForShot === waiting) return;
    this.waitingForShot = waiting;
    this.needShot?.(waiting);
  }

  private update() {
    const now = performance.now();
    const musicTime = this.timeSource?.();
    if (musicTime != null && Number.isFinite(musicTime) && musicTime >= 0) {
      this.currentTime = musicTime;
    } else if (!this.waitingForShot) {
      this.elapsedMs += now - this.lastTick;
      this.currentTime = this.elapsedMs / 1000;
    }
    this.lastTick = now;
    if (this.currentTime >= INTRO_DURATION_SEC || this.skipped) {
      this.finished = true;
      this.setWaiting(false);
      cancelAnimationFrame(this.raf);
      return;
    }
    const idx = this.shotIndexAt(this.currentTime);
    if (!this.hasShot(idx)) {
      this.setWaiting(true);
      void this.whenShot(idx).then(() => {
        if (this.finished || this.skipped) return;
        this.lastTick = performance.now();
        this.setWaiting(false);
      });
    }
  }

  private render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    const durations = this.shots.map((s) => s.duration);
    const shotIndex = introShotIndex(durations, this.currentTime);
    let elapsed = 0;
    for (let i = 0; i < shotIndex; i++) elapsed += durations[i];
    const shot = this.shots[shotIndex];
    const shotTime = this.currentTime - elapsed;
    const progress = Math.min(1, shotTime / Math.max(0.001, shot.duration));
    this.renderShot(shot, progress, shotTime);

    const text = captionTextAt(this.captions, this.currentTime);
    if (text) this.renderCaption(text);
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
    const lines = wrapCaption(text);
    if (!lines.length) return;
    const ctx = this.ctx;
    const lineH = 10;
    const pad = 6;
    const barH = lines.length * lineH + pad;
    const barY = this.height - barH - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, barY, this.width, barH);
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const x = Math.floor((this.width - line.length * CAPTION_CHAR_PX) / 2);
      const y = barY + 4 + i * lineH;
      drawFont5x7(ctx, this.font, line, x, y, this.fontGlyphs, CAPTION_CHAR_PX, '#ffffff');
    }
  }

  /** Test helper: one update using the music clock or elapsed timer. */
  debugTick(): number {
    this.ensureTimeline();
    this.update();
    return this.currentTime;
  }

  debugShotIndex(): number {
    this.ensureTimeline();
    return this.shotIndexAt(this.currentTime);
  }
}
