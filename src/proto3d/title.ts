import { StoryText, type Locale } from './i18n';
import {
  formatPlayTime,
  hasAnySave,
  listSlots,
  loadSlot,
  newestSlot,
  type SavePayload,
  type SlotSummary
} from './saves';

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
  private ctx: CanvasRenderingContext2D;
  private glowAlpha = 0.4;
  private glowDir = 1;
  private mode: Mode = 'title';
  private overwriteSlot: number | null = null;
  private pendingSave: SavePayload | null = null;
  private pressed: string | null = null;
  private raf = 0;
  private onAction: (a: TitleAction) => void;
  visible = false;

  constructor(canvas: HTMLCanvasElement, story: StoryText, onAction: (a: TitleAction) => void) {
    this.ctx = canvas.getContext('2d')!;
    this.story = story;
    this.onAction = onAction;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}art/ui/title/title.json`);
    this.layout = (await res.json()) as TitleLayout;
    const files = [
      this.layout.bg,
      this.layout.logo,
      'title_logo_el.png',
      this.layout.windowsGlow ?? 'title_windows_glow.png',
      this.layout.buttons.normal,
      this.layout.buttons.pressed,
      this.layout.buttons.dim,
      this.layout.saveSlot.frame,
      this.layout.saveSlot.exampleEmpty ?? 'save_slot_empty.png',
      this.layout.saveSlot.exampleFilled ?? 'save_slot.png',
      this.layout.overwrite.frame,
      'brannoc_healthy.png',
      'wren_healthy.png',
      'ilsevar_healthy.png',
      'mags_healthy.png'
    ];
    await Promise.all(
      files.map((file) => {
        const rel = file.includes('/')
          ? file
          : file.endsWith('_healthy.png')
            ? `art/portraits/${file}`
            : `art/ui/title/${file}`;
        return this.cache(file, `${base}${rel}`);
      })
    );
  }

  private cache(key: string, src: string) {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  show(mode: Mode = 'title') {
    this.mode = mode;
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
    cancelAnimationFrame(this.raf);
    document.getElementById('title-overlay')?.classList.remove('show');
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.overwriteSlot = null;
    this.syncHint();
    this.layoutButtons();
    this.draw();
  }

  private syncHint() {
    const hint = document.getElementById('title-hint');
    if (hint) hint.style.visibility = this.mode === 'title' ? 'visible' : 'hidden';
  }

  getMode(): Mode {
    return this.mode;
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
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.font = `${Math.max(10, this.layout.tagline.scale * 11)}px serif`;
    ctx.textAlign = this.layout.tagline.centered ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, this.layout.tagline.centered ? this.layout.canvas[0] / 2 : 10, this.layout.tagline.y);
    const has = hasAnySave();
    this.paintButton('Continue', has ? 'normal' : 'dim');
    this.paintButton('New Game', 'normal');
    this.paintButton('Load', 'normal');
    this.paintButton('Settings', 'normal', this.story.locale === 'el' ? 'EL' : 'EN');
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
    ctx.fillStyle = state === 'dim' ? '#6a6a6a' : '#d8ccb0';
    ctx.font = `${this.layout.buttons.labelFontScale * 8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + bw / 2, y + bh / 2);
  }

  private drawSlots() {
    if (!this.layout) return;
    const ctx = this.ctx;
    const slots = listSlots();
    ctx.fillStyle = '#d8ccb0';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const heading =
      this.mode === 'save' ? this.story.uiText('buttons.save') || 'Save' : this.story.titleText('load_title') || 'Load Game';
    ctx.fillText(heading, this.layout.canvas[0] / 2, 50);
    for (let i = 0; i < 3; i++) this.drawSlot(slots[i], SLOT_X, SLOT_Y0 + i * (this.layout.saveSlot.size[1] + SLOT_GAP));
    this.paintButton('Settings', 'normal', this.story.titleText('buttons.back') || 'Back');
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
    const save = entry.payload;
    const faces = ['brannoc', 'wren', 'ilsevar', 'mags'];
    faces.forEach((id, i) => {
      const well = wells[i];
      if (!well) return;
      const img = this.images.get(`${id}_healthy.png`);
      if (!img) return;
      ctx.drawImage(img, x + well[0] + inset[0], y + well[1] + inset[1], inset[2], inset[3]);
    });
    const area = this.story.titleText(`areas.${save.floor}`) || '';
    const line1 = this.story.titleText('slot.line1', { n: save.floor, area });
    const line2 = this.story.titleText('slot.line2', { time: formatPlayTime(save.playTimeMs) });
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
    ctx.fillStyle = '#d8ccb0';
    ctx.font = '11px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const [t0, t1] = this.layout.overwrite.textLines;
    ctx.fillText(this.story.titleText('overwrite.title'), x + fw / 2 + t0[0], y + t0[1]);
    ctx.fillText(this.story.titleText('overwrite.body'), x + fw / 2 + t1[0], y + t1[1]);
    this.drawOverwriteBtn('Overwrite', x, y);
    this.drawOverwriteBtn('Keep it', x, y);
  }

  private drawOverwriteBtn(name: 'Overwrite' | 'Keep it', ox: number, oy: number) {
    if (!this.layout) return;
    const [bx, by, bw, bh] = this.layout.overwrite.buttons[name];
    const img = this.images.get(this.layout.buttons.normal);
    if (img) this.ctx.drawImage(img, ox + bx, oy + by, bw, bh);
    this.ctx.fillStyle = '#d8ccb0';
    this.ctx.font = '10px serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const label = name === 'Overwrite' ? this.story.titleText('overwrite.yes') : this.story.titleText('overwrite.no');
    this.ctx.fillText(label, ox + bx + bw / 2, oy + by + bh / 2);
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
          this.onAction({ type: 'toast', text: this.story.titleText('no_saves') || this.story.uiText('status.no_saves') });
          return;
        }
        this.onAction({ type: 'continue', payload: found.payload });
        return;
      }
      if (id === 'Load') {
        this.setMode('load');
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
      if (this.mode === 'save') {
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
