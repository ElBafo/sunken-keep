import { drawSprite, loadSpriteImage, type SpriteImage } from './atlas';
import { fetchJsonCached, loadHtmlImage } from './asset-cache';
import { titleEssentialImageKeys } from './boot-assets';
import { StoryText, type Locale } from './i18n';
import { drawFont5x7, measureFontWidth, wrapFontToWidth, type FontGlyphs } from './font5x7';

const TITLE_FONT_CELL = 6;
const TITLE_FONT_GLYPH_H = 9;

function preloadTitleFont(base = import.meta.env.BASE_URL) {
  if (typeof document === 'undefined') return;
  const add = (href: string, as: 'image' | 'fetch') => {
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    if (as === 'fetch') link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  };
  add(`${base}art/font/font_5x7.png`, 'image');
  add(`${base}art/font/font_5x7.json`, 'fetch');
}

preloadTitleFont();
import {
  formatPlayTime,
  hasAnySave,
  listSlots,
  loadSlot,
  newestSlot,
  type SavePayload,
  type SlotSummary
} from './saves';

export function isStandaloneMode(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function isSafariBrowser(): boolean {
  try {
    const ua = navigator.userAgent;
    if (!/Safari/i.test(ua)) return false;
    if (/CriOS|FxiOS|EdgiOS|Chrome|Chromium|Android|OPR|Edg/i.test(ua)) return false;
    return true;
  } catch {
    return false;
  }
}

export function showInstallHint(): boolean {
  return isSafariBrowser() && !isStandaloneMode();
}

interface TitleLayout {
  canvas: [number, number];
  bg: string;
  logo: string;
  logoPos: [number, number];
  windowsGlow?: string;
  tagline: { y: number; scale: number; color: [number, number, number]; centered: boolean };
  buttons: {
    normal: string;
    pressed: string;
    dim: string;
    size: [number, number];
    positions: Record<string, [number, number]>;
    labelFontScale: number;
  };
  saveSlot: {
    frame: string;
    exampleFilled?: string;
    exampleEmpty?: string;
    size: [number, number];
    portraitWells: number[][];
    portraitInset: number[];
    textLines: number[][];
    fontScale: number;
    maxChars: number;
  };
  overwrite: {
    frame: string;
    size: [number, number];
    textLines: number[][];
    textCentered: boolean;
    buttons: Record<string, [number, number, number, number]>;
  };
}

export type TitleAction =
  | { type: 'new_game' }
  | { type: 'continue'; payload: SavePayload }
  | { type: 'load'; payload: SavePayload }
  | { type: 'open_load' }
  | { type: 'language'; locale: Locale }
  | { type: 'save'; slot: number }
  | { type: 'toast'; text: string };

type Mode = 'title' | 'load' | 'save';

const SLOT_X = 10;
const SLOT_Y0 = 90;
const SLOT_GAP = 10;

export class TitleScreen {
  story: StoryText;
  private layout: TitleLayout | null = null;
  private images = new Map<string, HTMLImageElement>();
  private portraits = new Map<string, SpriteImage>();
  private ctx: CanvasRenderingContext2D;
  private glowAlpha = 0.4;
  private glowDir = 1;
  private mode: Mode = 'title';
  private overwriteSlot: number | null = null;
  private pendingSave: SavePayload | null = null;
  private pressed: string | null = null;
  private raf = 0;
  private onAction: (a: TitleAction) => void;
  private font: HTMLImageElement | null = null;
  private fontGlyphs: FontGlyphs = {};
  visible = false;
  essentialReady = false;
  /** In-game Load: Back closes the overlay instead of returning to the title menu. */
  resumeOnBack = false;
  private restPromise: Promise<void> | null = null;

  constructor(canvas: HTMLCanvasElement, story: StoryText, onAction: (a: TitleAction) => void) {
    this.ctx = canvas.getContext('2d')!;
    this.story = story;
    this.onAction = onAction;
  }

  async load() {
    await this.loadEssential();
    await this.loadRest();
  }

  /** Background, current-language logo, button frames, 5×7 font. Enough to paint the title. */
  async loadEssential() {
    if (this.essentialReady) return;
    const base = import.meta.env.BASE_URL;
    this.layout = (await fetchJsonCached(`${base}art/ui/title/title.json`)) as TitleLayout;
    const files = titleEssentialImageKeys(this.story.locale, this.layout);
    await Promise.all([
      ...files.map((file) => this.cache(file, this.fileUrl(base, file))),
      this.loadFontMeta(base)
    ]);
    this.font = this.images.get('font_5x7.png') ?? null;
    this.essentialReady = true;
  }

  /** Glow, other-language logo, save slots, portraits — fetched while the title is up. */
  loadRest(): Promise<void> {
    if (this.restPromise) return this.restPromise;
    this.restPromise = this.loadRestInner();
    return this.restPromise;
  }

  async ensureLogo() {
    if (!this.layout) return;
    const file = this.logoFile();
    if (this.images.has(file)) return;
    const base = import.meta.env.BASE_URL;
    await this.cache(file, this.fileUrl(base, file));
  }

  private async loadRestInner() {
    if (!this.layout) await this.loadEssential();
    if (!this.layout) return;
    const base = import.meta.env.BASE_URL;
    const files = [
      this.layout.logo,
      'title_logo_el.png',
      this.layout.windowsGlow ?? 'title_windows_glow.png',
      this.layout.saveSlot.frame,
      this.layout.saveSlot.exampleEmpty ?? 'save_slot_empty.png',
      this.layout.saveSlot.exampleFilled ?? 'save_slot.png',
      this.layout.overwrite.frame,
      'brannoc_healthy.png',
      'wren_healthy.png',
      'ilsevar_healthy.png',
      'mags_healthy.png'
    ];
    await Promise.all([
      ...files.filter((file) => !file.endsWith('_healthy.png')).map((file) => this.cache(file, this.fileUrl(base, file))),
      ...['brannoc', 'wren', 'ilsevar', 'mags'].map(async (id) => {
        const file = `${id}_healthy.png`;
        try {
          this.portraits.set(file, await loadSpriteImage(`art/portraits/${file}`));
        } catch {
          /* optional face */
        }
      })
    ]);
  }

  private fileUrl(base: string, file: string): string {
    if (file.includes('/')) return `${base}${file}`;
    if (file.endsWith('_healthy.png')) return `${base}art/portraits/${file}`;
    if (file === 'font_5x7.png') return `${base}art/font/${file}`;
    return `${base}art/ui/title/${file}`;
  }

  private async loadFontMeta(base: string) {
    try {
      const meta = await fetchJsonCached<{ glyphs?: FontGlyphs }>(`${base}art/font/font_5x7.json`);
      this.fontGlyphs = meta.glyphs ?? {};
    } catch {
      this.fontGlyphs = {};
    }
  }

  private cache(key: string, src: string) {
    if (this.images.has(key)) return Promise.resolve();
    return loadHtmlImage(src)
      .then((img) => {
        this.images.set(key, img);
      })
      .catch(() => undefined);
  }

  show(mode: Mode = 'title', opts?: { resumeOnBack?: boolean }) {
    this.mode = mode;
    this.resumeOnBack = !!opts?.resumeOnBack;
    this.overwriteSlot = null;
    this.visible = true;
    const overlay = document.getElementById('title-overlay');
    if (overlay) overlay.classList.add('show');
    this.syncHint();
    this.layoutButtons();
    this.loop();
  }

  hide() {
    this.visible = false;
    this.resumeOnBack = false;
    cancelAnimationFrame(this.raf);
    document.getElementById('title-overlay')?.classList.remove('show');
    const hint = document.getElementById('title-hint');
    if (hint) hint.hidden = true;
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.overwriteSlot = null;
    this.syncHint();
    this.layoutButtons();
    this.draw();
  }

  refreshHint() {
    this.syncHint();
    if (this.visible) this.draw();
  }

  private syncHint() {
    const hint = document.getElementById('title-hint');
    if (!hint) return;
    const show = this.mode === 'title' && showInstallHint();
    hint.textContent = show ? this.story.titleLines('install_hint').join(' ') : '';
    hint.hidden = !show;
  }

  getMode(): Mode {
    return this.mode;
  }

  press(id: string) {
    this.handleHit(id);
  }

  prepareSave(payload: SavePayload) {
    this.pendingSave = payload;
    this.setMode('save');
  }

  private loop() {
    if (!this.visible) return;
    this.glowAlpha += this.glowDir * 0.008;
    if (this.glowAlpha >= 1) {
      this.glowAlpha = 1;
      this.glowDir = -1;
    } else if (this.glowAlpha <= 0.4) {
      this.glowAlpha = 0.4;
      this.glowDir = 1;
    }
    this.draw();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  private logoFile(): string {
    return this.story.locale === 'el' ? 'title_logo_el.png' : this.layout?.logo ?? 'title_logo.png';
  }

  draw() {
    if (!this.layout) return;
    const ctx = this.ctx;
    const [w, h] = this.layout.canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const bg = this.images.get(this.layout.bg);
    if (bg) ctx.drawImage(bg, 0, 0, w, h);
    else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, w, h);
    }
    const glow = this.images.get(this.layout.windowsGlow ?? 'title_windows_glow.png');
    if (glow) {
      ctx.save();
      ctx.globalAlpha = this.glowAlpha;
      ctx.drawImage(glow, 0, 0, w, h);
      ctx.restore();
    }

    if (this.mode === 'title') this.drawTitle();
    else this.drawSlots();
    if (this.overwriteSlot != null) this.drawOverwrite();
  }

  private drawTitle() {
    if (!this.layout) return;
    const ctx = this.ctx;
    const logo = this.images.get(this.logoFile()) ?? this.images.get(this.layout.logo);
    if (logo) ctx.drawImage(logo, this.layout.logoPos[0], this.layout.logoPos[1]);
    const tag = this.story.titleText('tagline');
    const [r, g, b] = this.layout.tagline.color;
    const tagX = this.layout.tagline.centered ? this.layout.canvas[0] / 2 : 10;
    this.paintPixelText(tag, tagX, this.layout.tagline.y, `rgb(${r},${g},${b})`, {
      align: this.layout.tagline.centered ? 'center' : 'left',
      valign: 'middle',
      scale: Math.max(1, this.layout.tagline.scale),
      maxWidth: this.layout.canvas[0] - 16
    });
    const has = hasAnySave();
    this.paintButton('Continue', has ? 'normal' : 'dim');
    this.paintButton('New Game', 'normal');
    this.paintButton('Load', 'normal');
    this.paintButton('Settings', 'normal', this.story.locale === 'el' ? 'EL' : 'EN');
    this.drawHint();
  }

  private drawHint() {
    if (!this.layout || this.mode !== 'title' || !showInstallHint()) return;
    const lines = this.story.titleLines('install_hint').slice(0, 2);
    if (!lines.length) return;
    const canvasW = this.layout.canvas[0];
    const ys = [556, 566];
    lines.forEach((line, i) => {
      const x = Math.floor((canvasW - line.length * 6) / 2);
      drawFont5x7(this.ctx, this.font, line, x, ys[i] ?? 556, this.fontGlyphs, 6, 'rgb(170,190,160)', {
        colour: '#1a1210'
      });
    });
  }

  private paintButton(name: string, state: 'normal' | 'pressed' | 'dim', labelOverride?: string) {
    if (!this.layout) return;
    const pos = this.layout.buttons.positions[name];
    if (!pos) return;
    const [x, y] = pos;
    const [bw, bh] = this.layout.buttons.size;
    const file =
      state === 'dim' ? this.layout.buttons.dim : state === 'pressed' ? this.layout.buttons.pressed : this.layout.buttons.normal;
    const img = this.images.get(this.pressed === name ? this.layout.buttons.pressed : file);
    const ctx = this.ctx;
    if (img) ctx.drawImage(img, x, y, bw, bh);
    else {
      ctx.fillStyle = state === 'dim' ? '#3a3a3a' : '#5a4a3a';
      ctx.fillRect(x, y, bw, bh);
    }
    const key = name === 'Settings' ? 'language' : name.toLowerCase().replace(' ', '_');
    const label =
      labelOverride ??
      (name === 'Settings'
        ? this.story.locale === 'el'
          ? this.story.titleText('language.el')
          : this.story.titleText('language.en')
        : this.story.titleText(`buttons.${key}`) || name);
    this.paintPixelText(label, x + bw / 2, y + bh / 2, state === 'dim' ? '#6a6a6a' : '#d8ccb0', {
      align: 'center',
      valign: 'middle',
      scale: Math.max(1, this.layout.buttons.labelFontScale),
      maxWidth: bw - 8
    });
  }

  /** 5×7 atlas labels. Scale drops to 1 and wraps before any string is shortened. */
  private paintPixelText(
    text: string,
    x: number,
    y: number,
    colour: string,
    opts: {
      align?: 'left' | 'center';
      valign?: 'top' | 'middle';
      scale?: number;
      maxWidth?: number;
    } = {}
  ) {
    if (!this.font || !text) return;
    const preferred = Math.max(1, Math.round(opts.scale ?? 1));
    const maxW = opts.maxWidth;
    let scale = preferred;
    if (maxW && measureFontWidth(text, this.fontGlyphs, TITLE_FONT_CELL, scale) > maxW) scale = 1;
    const lines = maxW
      ? wrapFontToWidth(text, maxW, this.fontGlyphs, TITLE_FONT_CELL, scale)
      : [text];
    const glyphH = TITLE_FONT_GLYPH_H * scale;
    const gap = scale;
    const blockH = lines.length * glyphH + Math.max(0, lines.length - 1) * gap;
    let dy = opts.valign === 'top' ? y : Math.round(y - blockH / 2);
    for (const line of lines) {
      const w = measureFontWidth(line, this.fontGlyphs, TITLE_FONT_CELL, scale);
      const dx = opts.align === 'left' ? x : Math.round(x - w / 2);
      drawFont5x7(this.ctx, this.font, line, dx, dy, this.fontGlyphs, TITLE_FONT_CELL, colour, undefined, scale);
      dy += glyphH + gap;
    }
  }

  private drawSlots() {
    if (!this.layout) return;
    const slots = listSlots();
    const heading =
      this.mode === 'save'
        ? this.story.uiText('buttons.save')
        : this.story.titleText('buttons.load');
    this.paintPixelText(heading, this.layout.canvas[0] / 2, 50, '#d8ccb0', {
      align: 'center',
      valign: 'middle',
      scale: 2,
      maxWidth: this.layout.canvas[0] - 16
    });
    for (let i = 0; i < 3; i++) this.drawSlot(slots[i], SLOT_X, SLOT_Y0 + i * (this.layout.saveSlot.size[1] + SLOT_GAP));
    this.paintButton('Settings', 'normal', this.story.titleText('buttons.back'));
  }

  private drawSlot(entry: SlotSummary, x: number, y: number) {
    if (!this.layout) return;
    const ctx = this.ctx;
    const [w, h] = this.layout.saveSlot.size;
    const frame = this.images.get(this.layout.saveSlot.frame);
    if (frame) ctx.drawImage(frame, x, y, w, h);
    else {
      ctx.fillStyle = '#2a241c';
      ctx.fillRect(x, y, w, h);
    }
    const wells = this.layout.saveSlot.portraitWells;
    const inset = this.layout.saveSlot.portraitInset;
    if (!entry) {
      ctx.fillStyle = '#6a6a6a';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const [lx1, ly1] = this.layout.saveSlot.textLines[0];
      const [lx2, ly2] = this.layout.saveSlot.textLines[1];
      ctx.fillText(this.story.titleText('slot.empty'), x + lx1, y + ly1);
      ctx.fillText(this.story.titleText('slot.empty_sub'), x + lx2, y + ly2);
      return;
    }
    if (entry.status === 'corrupt') {
      ctx.fillStyle = '#c8a070';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const [cx1, cy1] = this.layout.saveSlot.textLines[0];
      const [cx2, cy2] = this.layout.saveSlot.textLines[1];
      ctx.fillText(this.story.uiText('slot.corrupt'), x + cx1, y + cy1);
      ctx.fillText(this.story.uiText('slot.corrupt_sub'), x + cx2, y + cy2);
      return;
    }
    const save = entry.payload;
    const faces = ['brannoc', 'wren', 'ilsevar', 'mags'];
    faces.forEach((id, i) => {
      const well = wells[i];
      if (!well) return;
      const img = this.portraits.get(`${id}_healthy.png`);
      if (!img) return;
      drawSprite(ctx, img, x + well[0] + inset[0], y + well[1] + inset[1], inset[2], inset[3]);
    });
    const area = this.story.titleText(`areas.${save.floor}`) || '';
    const line1 = this.story.titleText('slot.line1', { n: save.floor, area });
    const line2 = this.story.titleText('slot.line2', {
      time: formatPlayTime(save.playTimeMs, (key, vars) => this.story.uiText(key, vars))
    });
    ctx.fillStyle = '#c8c0a8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const [tx1, ty1] = this.layout.saveSlot.textLines[0];
    const [tx2, ty2] = this.layout.saveSlot.textLines[1];
    ctx.fillText(line1, x + tx1, y + ty1);
    ctx.fillText(line2, x + tx2, y + ty2);
  }

  private drawOverwrite() {
    if (!this.layout) return;
    const ctx = this.ctx;
    const [fw, fh] = this.layout.overwrite.size;
    const x = Math.floor((this.layout.canvas[0] - fw) / 2);
    const y = 360;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.layout.canvas[0], this.layout.canvas[1]);
    const frame = this.images.get(this.layout.overwrite.frame);
    if (frame) ctx.drawImage(frame, x, y, fw, fh);
    else {
      ctx.fillStyle = '#2a1a14';
      ctx.fillRect(x, y, fw, fh);
    }
    const [t0, t1] = this.layout.overwrite.textLines;
    const overMax = fw - 16;
    this.paintPixelText(
      this.story.titleText('overwrite.title'),
      x + fw / 2 + t0[0],
      y + t0[1],
      '#d8ccb0',
      { align: 'center', valign: 'top', scale: 1, maxWidth: overMax }
    );
    this.paintPixelText(
      this.story.titleText('overwrite.body'),
      x + fw / 2 + t1[0],
      y + t1[1],
      '#d8ccb0',
      { align: 'center', valign: 'top', scale: 1, maxWidth: overMax }
    );
    this.drawOverwriteBtn('Overwrite', x, y);
    this.drawOverwriteBtn('Keep it', x, y);
  }

  private drawOverwriteBtn(name: 'Overwrite' | 'Keep it', ox: number, oy: number) {
    if (!this.layout) return;
    const [bx, by, bw, bh] = this.layout.overwrite.buttons[name];
    const img = this.images.get(this.layout.buttons.normal);
    if (img) this.ctx.drawImage(img, ox + bx, oy + by, bw, bh);
    const label = name === 'Overwrite' ? this.story.titleText('overwrite.yes') : this.story.titleText('overwrite.no');
    this.paintPixelText(label, ox + bx + bw / 2, oy + by + bh / 2, '#d8ccb0', {
      align: 'center',
      valign: 'middle',
      scale: 1,
      maxWidth: bw - 4
    });
  }

  layoutButtons() {
    const host = document.getElementById('title-stage');
    if (!host || !this.layout) return;
    host.querySelectorAll('.title-hit').forEach((el) => el.remove());
    if (this.mode === 'title') {
      this.placeHit(host, 'Continue', this.layout.buttons.positions.Continue, this.layout.buttons.size);
      this.placeHit(host, 'New Game', this.layout.buttons.positions['New Game'], this.layout.buttons.size);
      this.placeHit(host, 'Load', this.layout.buttons.positions.Load, this.layout.buttons.size);
      this.placeHit(host, 'Settings', this.layout.buttons.positions.Settings, this.layout.buttons.size);
    } else {
      for (let i = 0; i < 3; i++) {
        const y = SLOT_Y0 + i * (this.layout.saveSlot.size[1] + SLOT_GAP);
        this.placeHit(host, `slot-${i + 1}`, [SLOT_X, y], this.layout.saveSlot.size);
      }
      this.placeHit(host, 'Back', this.layout.buttons.positions.Settings, this.layout.buttons.size);
    }
    if (this.overwriteSlot != null) {
      const [fw] = this.layout.overwrite.size;
      const ox = Math.floor((this.layout.canvas[0] - fw) / 2);
      const oy = 360;
      const over = this.layout.overwrite.buttons.Overwrite;
      const keep = this.layout.overwrite.buttons['Keep it'];
      this.placeHit(host, 'Overwrite', [ox + over[0], oy + over[1]], [over[2], over[3]]);
      this.placeHit(host, 'Keep it', [ox + keep[0], oy + keep[1]], [keep[2], keep[3]]);
    }
  }

  private placeHit(host: HTMLElement, id: string, pos: [number, number], size: [number, number]) {
    if (!this.layout) return;
    const [x, y] = pos;
    const [bw, bh] = size;
    const [cw, ch] = this.layout.canvas;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'title-hit';
    btn.dataset.id = id;
    btn.setAttribute('aria-label', id);
    btn.style.left = `${(x / cw) * 100}%`;
    btn.style.top = `${(y / ch) * 100}%`;
    btn.style.width = `${(bw / cw) * 100}%`;
    btn.style.height = `${(bh / ch) * 100}%`;
    btn.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      this.pressed = id;
    });
    btn.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      this.pressed = null;
      e.preventDefault();
      this.handleHit(id);
    });
    btn.addEventListener('pointercancel', () => {
      this.pressed = null;
    });
    host.appendChild(btn);
  }

  private handleHit(id: string) {
    if (this.overwriteSlot != null) {
      if (id === 'Overwrite') {
        const slot = this.overwriteSlot;
        this.overwriteSlot = null;
        if (this.mode === 'save' && this.pendingSave) this.onAction({ type: 'save', slot });
        this.layoutButtons();
        this.draw();
        return;
      }
      if (id === 'Keep it') {
        this.overwriteSlot = null;
        this.layoutButtons();
        this.draw();
        return;
      }
      return;
    }
    if (this.mode === 'title') {
      if (id === 'New Game') {
        this.onAction({ type: 'new_game' });
        return;
      }
      if (id === 'Continue') {
        const found = newestSlot();
        if (!found) {
          this.onAction({ type: 'toast', text: this.story.uiText('status.no_saves') });
          return;
        }
        this.onAction({ type: 'continue', payload: found.payload });
        return;
      }
      if (id === 'Load') {
        this.onAction({ type: 'open_load' });
        return;
      }
      if (id === 'Settings') {
        const next: Locale = this.story.locale === 'el' ? 'en' : 'el';
        this.onAction({ type: 'language', locale: next });
        return;
      }
      return;
    }
    if (id === 'Back') {
      if (this.mode === 'save' || this.resumeOnBack) {
        this.resumeOnBack = false;
        this.hide();
        return;
      }
      this.setMode('title');
      return;
    }
    if (id.startsWith('slot-')) {
      const slot = Number(id.slice(5));
      if (this.mode === 'save') {
        if (listSlots()[slot - 1]) {
          this.overwriteSlot = slot;
          this.layoutButtons();
          this.draw();
          return;
        }
        this.onAction({ type: 'save', slot });
        return;
      }
      const data = loadSlot(slot);
      if (!data) return;
      if (data === 'corrupt') {
        this.onAction({ type: 'toast', text: this.story.uiText('slot.corrupt') });
        return;
      }
      this.onAction({ type: 'load', payload: data });
    }
  }
}
