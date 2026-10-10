import {
  DEFAULT_EQUIPMENT,
  DEFAULT_FORMATION,
  MELEE_ITEMS,
  type HeroId,
  type ItemType
} from '../constants';
import { ITEM_ACT_SFX } from '../core/types';
import { HAND_COOLDOWN_MS, OIL_MAX } from './constants';
import { StoryText } from './i18n';
import {
  panelContentHeight,
  toPanelLocal,
  type Layout585,
  type LayoutRect
} from './layout585';

export type HandSlot = 'main' | 'off';
export type GearId = ItemType | 'torch_lit' | 'torch_burnt';
type Rect = LayoutRect;

export interface HeroHud {
  id: HeroId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  formation: 'front' | 'back';
  equipment: { main: GearId; off: GearId };
  recovery: { main: number; off: number };
  downed?: boolean;
}

const HERO_ORDER: HeroId[] = ['brannoc', 'wren', 'ilsevar', 'mags'];

const HERO_STATS: Record<HeroId, { maxHp: number; maxMana: number }> = {
  brannoc: { maxHp: 45, maxMana: 0 },
  wren: { maxHp: 32, maxMana: 12 },
  ilsevar: { maxHp: 24, maxMana: 16 },
  mags: { maxHp: 28, maxMana: 0 }
};

const ACT_SFX = ITEM_ACT_SFX;

function healthState(hp: number, maxHp: number): 'healthy' | 'wounded' | 'near_death' {
  const pct = maxHp <= 0 ? 0 : hp / maxHp;
  if (pct < 0.25) return 'near_death';
  if (pct < 0.6) return 'wounded';
  return 'healthy';
}

export class PartyHud {
  story: StoryText;
  heroes: Record<HeroId, HeroHud>;
  logLines: string[] = [];
  lastHand: { hero: HeroId; hand: HandSlot } | null = null;
  handTapCount = 0;
  layout: Layout585;
  designWidth: number;
  designHeight: number;
  private panelTop: number;
  private layoutHeroes = new Map<HeroId, { portrait: Rect; handMain: Rect; handOff: Rect; hpBar: Rect; manaBar: Rect | null }>();
  private oilBar: Rect;
  private logRect: Rect;
  private iconSize = 24;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private icons = new Map<string, string>();
  private fontReady = false;
  private fontImg: HTMLImageElement | null = null;
  private fontCellW = 6;
  private fontCols = 16;
  private oilFn: () => number;
  private onUse: (hero: HeroId, hand: HandSlot) => void;
  private onLog: (text: string) => void;
  private playUi: (name: string) => void;
  private onCancel: () => void;
  private levelFlash: { id: HeroId; started: number } | null = null;
  private readyArmed: Record<string, boolean> = {};
  private notReadyAt: Partial<Record<HeroId, number>> = {};
  private frostHintDismissed = false;
  private frostHintArmed = false;
  private swapArmed = false;
  lastHitType: string | null = null;

  constructor(
    story: StoryText,
    oilFn: () => number,
    layout: Layout585,
    hooks: {
      onUse: (hero: HeroId, hand: HandSlot) => void;
      onLog: (text: string) => void;
      playUi: (name: string) => void;
      onCancel: () => void;
    }
  ) {
    this.story = story;
    this.oilFn = oilFn;
    this.layout = layout;
    this.onUse = hooks.onUse;
    this.onLog = hooks.onLog;
    this.playUi = hooks.playUi;
    this.onCancel = hooks.onCancel;
    this.heroes = this.createHeroes();
    this.panelTop = layout.panelTop;
    this.designWidth = layout.canvas[0];
    this.designHeight = panelContentHeight(layout);
    this.oilBar = toPanelLocal(layout.oilBar, this.panelTop);
    this.logRect = toPanelLocal(layout.log, this.panelTop);
    for (const hero of layout.heroes) {
      this.layoutHeroes.set(hero.name, {
        portrait: toPanelLocal(hero.portrait_opens_sheet, this.panelTop),
        handMain: toPanelLocal(hero.hand_main, this.panelTop),
        handOff: toPanelLocal(hero.hand_off, this.panelTop),
        hpBar: toPanelLocal(hero.hpBar, this.panelTop),
        manaBar: hero.manaBar ? toPanelLocal(hero.manaBar, this.panelTop) : null
      });
    }
    this.canvas = document.getElementById('party-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.width = this.designWidth;
    this.canvas.height = this.designHeight;
  }

  private createHeroes(): Record<HeroId, HeroHud> {
    const out = {} as Record<HeroId, HeroHud>;
    for (const id of HERO_ORDER) {
      const stats = HERO_STATS[id];
      out[id] = {
        id,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        mana: stats.maxMana,
        maxMana: stats.maxMana,
        formation: DEFAULT_FORMATION[id],
        equipment: {
          main: DEFAULT_EQUIPMENT[id].main,
          off: DEFAULT_EQUIPMENT[id].off
        },
        recovery: { main: 0, off: 0 }
      };
    }
    return out;
  }

  async load() {
    const base = import.meta.env.BASE_URL;
    const loadImg = (rel: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${rel}`));
        img.src = `${base}${rel}`;
      });
    const cache = async (key: string, rel: string) => {
      const img = await loadImg(rel);
      this.images.set(key, img);
      return img;
    };

    const [hands, fontMeta] = await Promise.all([
      fetch(`${base}art/ui/hands/hands.json`).then((r) => r.json()) as Promise<{
        icons?: Record<string, string>;
        size?: [number, number];
      }>,
      fetch(`${base}art/font/font_5x7.json`).then((r) => r.json()) as Promise<{
        columns?: number;
        cellWidth?: number;
      }>
    ]);

    if (Array.isArray(hands.size) && Number.isFinite(hands.size[0])) this.iconSize = hands.size[0];
    if (Number.isFinite(fontMeta.columns)) this.fontCols = fontMeta.columns!;
    if (Number.isFinite(fontMeta.cellWidth)) this.fontCellW = fontMeta.cellWidth!;
    for (const [id, file] of Object.entries(hands.icons ?? {})) this.icons.set(id, file);

    const portraitFiles = [
      'brannoc_healthy',
      'brannoc_wounded',
      'brannoc_near_death',
      'wren_healthy',
      'wren_wounded',
      'wren_near_death',
      'ilsevar_healthy',
      'ilsevar_wounded',
      'ilsevar_near_death',
      'mags_healthy',
      'mags_wounded',
      'mags_near_death',
      'wren_lantern_bright',
      'wren_lantern_ember'
    ];

    await Promise.all([
      cache('panel', 'art/ui/layout585/panel_585.png'),
      cache('font', 'art/font/font_5x7.png'),
      cache('downed', 'art/ui/panel/portrait_downed.png'),
      cache('levelup1', 'art/ui/panel/portrait_levelup_1.png'),
      cache('levelup2', 'art/ui/panel/portrait_levelup_2.png'),
      cache('levelup3', 'art/ui/panel/portrait_levelup_3.png'),
      cache('oil0', 'art/ui/oil/oil_gauge_0.png'),
      cache('oil1', 'art/ui/oil/oil_gauge_1.png'),
      cache('oil2', 'art/ui/oil/oil_gauge_2.png'),
      cache('oil3', 'art/ui/oil/oil_gauge_3.png'),
      cache('oil4', 'art/ui/oil/oil_gauge_4.png'),
      cache('hint1', 'art/ui/hands/hand_glow_hint_1.png'),
      cache('hint2', 'art/ui/hands/hand_glow_hint_2.png'),
      cache('hint3', 'art/ui/hands/hand_glow_hint_3.png'),
      cache('hint4', 'art/ui/hands/hand_glow_hint_4.png'),
      ...portraitFiles.map((name) => cache(name, `art/portraits/${name}.png`)),
      ...[...this.icons.values()].map((file) => cache(file, `art/ui/hands/${file}`))
    ]);

    this.fontImg = this.images.get('font') ?? null;
    this.fontReady = !!this.fontImg;
    this.mountHandButtons();
    this.mountChoiceLabels();
    this.draw(performance.now());
  }

  private mountChoiceLabels() {
    const take = document.getElementById('btn-torch-take');
    const snuff = document.getElementById('btn-torch-snuff');
    if (take) take.textContent = this.story.uiText('step1_party_panel.torch_choice.take');
    if (snuff) snuff.textContent = this.story.uiText('step1_party_panel.torch_choice.snuff');
  }

  private mountHandButtons() {
    const host = document.getElementById('party-hud');
    if (!host) return;
    host.querySelectorAll('.hand-btn').forEach((el) => el.remove());
    if (!host.dataset.cancelBound) {
      host.dataset.cancelBound = '1';
      host.addEventListener('pointerup', (e) => {
        if (!e.isPrimary) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('.hand-btn')) return;
        this.onCancel();
      });
    }
    for (const id of HERO_ORDER) {
      const layout = this.layoutHeroes.get(id);
      if (!layout) continue;
      this.placeHandBtn(host, id, 'main', layout.handMain);
      this.placeHandBtn(host, id, 'off', layout.handOff);
    }
  }

  private placeHandBtn(host: HTMLElement, hero: HeroId, hand: HandSlot, rect: Rect) {
    const [x, y, w, h] = rect;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hand-btn';
    btn.dataset.hero = hero;
    btn.dataset.hand = hand;
    btn.setAttribute('aria-label', `${hero}-${hand}`);
    btn.style.left = `${(x / this.designWidth) * 100}%`;
    btn.style.top = `${(y / this.designHeight) * 100}%`;
    btn.style.width = `${(w / this.designWidth) * 100}%`;
    btn.style.height = `${(h / this.designHeight) * 100}%`;
    btn.addEventListener('pointerup', (e) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      this.onUse(hero, hand);
    });
    host.appendChild(btn);
  }

  pushLog(text: string) {
    if (!text) return;
    for (const line of text.split('\n')) {
      if (!line) continue;
      this.logLines.push(line);
      this.onLog(line);
    }
    if (this.logLines.length > 12) this.logLines.splice(0, this.logLines.length - 12);
    this.draw(performance.now());
  }

  clearReadyArmed() {
    this.readyArmed = {};
  }

  setHeroHp(id: HeroId, hp: number) {
    const hero = this.heroes[id];
    if (!hero) return;
    hero.hp = Math.max(0, Math.min(hero.maxHp, Math.floor(hp)));
    this.draw(performance.now());
  }

  setHand(id: HeroId, hand: HandSlot, item: GearId) {
    const hero = this.heroes[id];
    if (!hero) return;
    hero.equipment[hand] = item;
    this.draw(performance.now());
  }

  getHands() {
    return HERO_ORDER.map((id) => {
      const h = this.heroes[id];
      return { id, main: h.equipment.main, off: h.equipment.off, formation: h.formation, hp: h.hp, maxHp: h.maxHp };
    });
  }

  /** Front-row hero who just acted, else the first front-row hero. */
  actingFrontHero(): HeroId {
    const last = this.lastHand?.hero;
    if (last && this.heroes[last]?.formation === 'front') return last;
    for (const id of HERO_ORDER) {
      if (this.heroes[id].formation === 'front') return id;
    }
    return 'brannoc';
  }

  isGuaranteedLantern(hero: HeroId, hand: HandSlot): boolean {
    const item = this.heroes[hero]?.equipment[hand];
    return item === 'prayer_lantern';
  }

  findFreeHand(): { hero: HeroId; hand: HandSlot } | null {
    for (const id of HERO_ORDER) {
      const hero = this.heroes[id];
      for (const hand of ['main', 'off'] as const) {
        const item = hero.equipment[hand];
        if (item === 'empty_hand' && !this.isGuaranteedLantern(id, hand)) return { hero: id, hand };
      }
    }
    return null;
  }

  setSwapHighlight(armed: boolean) {
    this.swapArmed = armed;
    document.querySelectorAll<HTMLElement>('.hand-btn').forEach((el) => {
      const hero = el.dataset.hero as HeroId | undefined;
      const hand = el.dataset.hand as HandSlot | undefined;
      const skip = !!(hero && hand && this.isGuaranteedLantern(hero, hand));
      el.classList.toggle('swap-armed', armed && !skip);
    });
    this.draw(performance.now());
  }

  armFrostHint() {
    if (this.frostHintDismissed) return;
    this.frostHintArmed = true;
    this.draw(performance.now());
  }

  dismissFrostHint() {
    this.frostHintDismissed = true;
    this.frostHintArmed = false;
    this.draw(performance.now());
  }

  hideFrostHint() {
    this.frostHintArmed = false;
    this.draw(performance.now());
  }

  frostHintState() {
    return { armed: this.frostHintArmed, dismissed: this.frostHintDismissed };
  }

  carriedTorch(): { hero: HeroId; hand: HandSlot; lit: boolean } | null {
    for (const id of HERO_ORDER) {
      const hero = this.heroes[id];
      for (const hand of ['main', 'off'] as const) {
        const item = hero.equipment[hand];
        if (item === 'torch_lit' || item === 'torch_burnt') {
          return { hero: id, hand, lit: item === 'torch_lit' };
        }
      }
    }
    return null;
  }

  hasLitCarriedTorch(): boolean {
    return this.carriedTorch()?.lit === true;
  }

  dunkCarriedTorches(): { hero: HeroId; hand: HandSlot }[] {
    const dunked: { hero: HeroId; hand: HandSlot }[] = [];
    for (const id of HERO_ORDER) {
      const hero = this.heroes[id];
      for (const hand of ['main', 'off'] as const) {
        if (hero.equipment[hand] === 'torch_lit') {
          hero.equipment[hand] = 'torch_burnt';
          dunked.push({ hero: id, hand });
        }
      }
    }
    if (dunked.length) this.draw(performance.now());
    return dunked;
  }

  /** Step-2 hook: play the hand SFX, start cooldown, log a line. Combat fills this later. */
  useHand(heroId: HeroId, hand: HandSlot): boolean {
    const hero = this.heroes[heroId];
    if (!hero) return false;
    const now = performance.now();
    if (hero.recovery[hand] > now) {
      const last = this.notReadyAt[heroId] ?? -1e9;
      if (now - last >= 1500) {
        this.notReadyAt[heroId] = now;
        this.pushLog(this.story.log('not_ready', { hero: this.story.heroName(heroId) }));
      }
      this.playUi('ui_button_denied');
      return false;
    }
    const item = hero.equipment[hand];
    const sfx = ACT_SFX[item] ?? ACT_SFX.fist;
    this.playUi(sfx);
    hero.recovery[hand] = now + HAND_COOLDOWN_MS;
    this.lastHand = { hero: heroId, hand };
    this.handTapCount += 1;
    const action = this.story.handLabel(item) || this.story.handLabel('fist');
    this.pushLog(`${this.story.heroName(heroId)}: ${action}`);
    this.draw(now);
    return true;
  }

  playLevelUp(id: HeroId) {
    this.levelFlash = { id, started: performance.now() };
    this.draw(performance.now());
  }

  syncHero(
    id: HeroId,
    state: { hp: number; maxHp: number; mana: number; maxMana: number; downed?: boolean; recovery?: { main: number; off: number } }
  ) {
    const hero = this.heroes[id];
    if (!hero) return;
    hero.hp = state.hp;
    hero.maxHp = state.maxHp;
    hero.mana = state.mana;
    hero.maxMana = state.maxMana;
    hero.downed = !!state.downed;
    if (state.recovery) {
      hero.recovery.main = state.recovery.main * 1000;
      hero.recovery.off = state.recovery.off * 1000;
    }
  }

  portraitKey(hero: HeroHud): string {
    const hp = healthState(hero.hp, hero.maxHp);
    if (hero.id !== 'wren') return `${hero.id}_${hp}`;
    if (hp === 'near_death') return 'wren_near_death';
    return this.oilFn() <= 0 ? 'wren_lantern_ember' : 'wren_lantern_bright';
  }

  draw(now: number) {
    this.tickReadySounds(now);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.designWidth, this.designHeight);
    const panel = this.images.get('panel');
    if (panel) {
      if (panel.height >= this.panelTop + this.designHeight) {
        ctx.drawImage(panel, 0, this.panelTop, this.designWidth, this.designHeight, 0, 0, this.designWidth, this.designHeight);
      } else {
        ctx.drawImage(panel, 0, 0);
      }
    } else {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(0, 0, this.designWidth, this.designHeight);
    }

    for (const id of HERO_ORDER) {
      const hero = this.heroes[id];
      const layout = this.layoutHeroes.get(id);
      if (!layout) continue;
      this.drawPortrait(ctx, hero, layout.portrait);
      this.drawBar(ctx, layout.hpBar, hero.hp / hero.maxHp, hero.hp > hero.maxHp * 0.3 ? '#4a8a3a' : '#8a3a3a', '#2a1a1a');
      if (layout.manaBar && hero.maxMana > 0) {
        this.drawBar(ctx, layout.manaBar, hero.mana / hero.maxMana, '#3a5a8a', '#1a1a2a');
      }
      this.drawHandIcon(ctx, hero, 'main', layout.handMain, now);
      this.drawHandIcon(ctx, hero, 'off', layout.handOff, now);
    }
    this.drawOilGauge();
    this.drawLog();
  }

  private tickReadySounds(now: number) {
    for (const id of HERO_ORDER) {
      const hero = this.heroes[id];
      for (const hand of ['main', 'off'] as const) {
        const key = `${id}:${hand}`;
        if (hero.recovery[hand] > now) this.readyArmed[key] = true;
        else if (this.readyArmed[key]) {
          this.readyArmed[key] = false;
          this.playUi('act_ready');
        }
      }
    }
  }

  private drawPortrait(ctx: CanvasRenderingContext2D, hero: HeroHud, rect: Rect) {
    const [x, y, w, h] = rect;
    const img = this.images.get(this.portraitKey(hero));
    if (img) ctx.drawImage(img, x, y, w, h);
    else {
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, w, h);
    }
    if (hero.hp <= 0 || hero.downed) {
      const downed = this.images.get('downed');
      if (downed) {
        ctx.save();
        ctx.filter = 'grayscale(1) brightness(0.6)';
        if (img) ctx.drawImage(img, x, y, w, h);
        ctx.filter = 'none';
        ctx.drawImage(downed, x, y, w, h);
        ctx.restore();
      }
    }
    if (this.levelFlash && this.levelFlash.id === hero.id) {
      const t = (performance.now() - this.levelFlash.started) / 180;
      const frame = Math.min(2, Math.floor(t));
      const flash = this.images.get(`levelup${frame + 1}`);
      if (flash) ctx.drawImage(flash, x, y, w, h);
      if (t >= 3) this.levelFlash = null;
    }
    ctx.lineWidth = hero.formation === 'front' ? 2 : 1;
    ctx.strokeStyle = hero.formation === 'front' ? '#cd7f32' : '#8a8a8a';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawBar(ctx: CanvasRenderingContext2D, rect: Rect, pct: number, fill: string, back: string) {
    const [x, y, w, h] = rect;
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, Math.max(0, w * Math.min(1, Math.max(0, pct))), h);
  }

  private drawOilGauge() {
    const oil = Math.max(0, Math.min(OIL_MAX, this.oilFn()));
    const img = this.images.get(`oil${oil}`);
    const [x, y, w, h] = this.oilBar;
    if (img) this.ctx.drawImage(img, x, y, w, h);
  }

  private drawHandIcon(ctx: CanvasRenderingContext2D, hero: HeroHud, hand: HandSlot, rect: Rect, now: number) {
    const [x, y, w, h] = rect;
    let item = hero.equipment[hand] as string;
    if (item === 'prayer_lantern' && this.oilFn() <= 0) item = 'prayer_lantern_ember';
    const iconKey = item === 'empty_hand' || item === 'fist' ? `fist_${hero.id}` : item;
    const file = this.icons.get(iconKey) ?? `hand_${iconKey}.png`;
    const img = this.images.get(file);
    const recovering = hero.recovery[hand] > now;
    const melee = MELEE_ITEMS.includes(item as ItemType) || item === 'torch_lit' || item === 'torch_burnt';
    const outOfReach = hero.formation === 'back' && melee && item !== 'wand' && item !== 'scroll';
    if (img) {
      const size = Math.min(this.iconSize, w, h);
      const ix = x + (w - size) / 2;
      const iy = y + (h - size) / 2;
      if (recovering || outOfReach || hero.downed) ctx.globalAlpha = 0.35;
      ctx.drawImage(img, ix, iy, size, size);
      ctx.globalAlpha = 1;
    }
    if (recovering) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x, y, w, h);
    }
    if (outOfReach) {
      ctx.strokeStyle = '#8a3a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w - 4, y + h - 4);
      ctx.moveTo(x + w - 4, y + 4);
      ctx.lineTo(x + 4, y + h - 4);
      ctx.stroke();
    }
    this.drawFrostHint(ctx, hero, hand, rect, now, recovering);
  }

  private frostHintHand(hero: HeroHud): HandSlot | null {
    if (hero.equipment.main === 'wand' || hero.equipment.main === 'scroll') return 'main';
    if (hero.equipment.off === 'wand' || hero.equipment.off === 'scroll') return 'off';
    return null;
  }

  private drawFrostHint(
    ctx: CanvasRenderingContext2D,
    hero: HeroHud,
    hand: HandSlot,
    rect: Rect,
    now: number,
    recovering: boolean
  ) {
    if (hero.id !== 'ilsevar') return;
    if (!this.frostHintArmed || this.frostHintDismissed || this.swapArmed) return;
    if (this.frostHintHand(hero) !== hand) return;
    if (recovering || hero.downed || hero.hp <= 0) return;
    const item = hero.equipment[hand];
    if (item === 'scroll' && hero.mana <= 0) return;
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const frame = reduced ? 3 : (Math.floor(now / 500) % 4) + 1;
    const img = this.images.get(`hint${frame}`);
    if (!img) return;
    const [x, y, w, h] = rect;
    ctx.drawImage(img, x, y, w, h);
  }

  private drawLog() {
    const [x, y, w] = this.logRect;
    const lines = this.logLines.slice(-3);
    const pad = 2;
    const lh = 9;
    const maxChars = Math.floor((w - pad * 2) / 6);
    lines.forEach((line, i) => {
      const text = line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
      this.drawFont(text, x + pad, y + pad + i * lh);
    });
  }

  private drawFont(text: string, x: number, y: number) {
    const ctx = this.ctx;
    if (!this.fontReady || !this.fontImg) {
      ctx.fillStyle = '#d8ccb0';
      ctx.font = '8px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(text, x, y);
      return;
    }
    const font = this.fontImg;
    for (let i = 0; i < text.length; i++) {
      const index = text.charCodeAt(i) - 32;
      if (index < 0 || index > 94) continue;
      const sx = (index % this.fontCols) * this.fontCellW;
      const sy = Math.floor(index / this.fontCols) * 10;
      ctx.drawImage(font, sx, sy, 5, 9, x + i * this.fontCellW, y, 5, 9);
    }
  }
}

export { HERO_ORDER };
