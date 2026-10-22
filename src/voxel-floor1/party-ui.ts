import { DEFAULT_EQUIPMENT, type HeroId, type ItemType } from '../constants';
import {
  HERO_DISPLAY,
  HERO_IDS,
  HP_FILL,
  HudHeroId,
  MP_FILL,
  PAD_KEYS,
  PORTRAIT_DIR,
  PortraitLayout,
  Rect,
  allPortraitFiles,
  logVisibleSlice,
  measurePortraitLayout,
  nextLogScrollFromBottom,
  parsePartyQuery,
  portraitRelPath,
  portraitState,
  visibleLogLineCount,
  wrapLogMessage,
  type PadKey,
  type SafeInsets
} from './portrait-layout';

const BASE = import.meta.env.BASE_URL;

/** Public HUD art. `hudAsset` prefixes Vite's `BASE_URL` (`/sunken-keep/` on Pages and `vite`). */
export const HUD_ICON = {
  menu: 'art/ui/panel/icon_menu.png',
  bag: 'art/ui/panel/icon_bag.png',
  oil: 'art/ui/items/icon_oil.png',
  turn_left: 'art/ui/panel/icon_turn_left.png',
  forward: 'art/ui/panel/icon_forward.png',
  turn_right: 'art/ui/panel/icon_turn_right.png',
  strafe_left: 'art/ui/panel/icon_strafe_left.png',
  back: 'art/ui/panel/icon_back.png',
  strafe_right: 'art/ui/panel/icon_strafe_right.png'
} as const;

const HAND_FILE: Record<string, string> = {
  axe: 'hand_axe.png',
  shield: 'hand_shield.png',
  mace: 'hand_mace.png',
  prayer_lantern: 'hand_prayer_lantern.png',
  wand: 'hand_wand.png',
  scroll: 'hand_scroll.png',
  dagger: 'hand_dagger.png',
  tricks_pouch: 'hand_tricks_pouch.png'
};

const PAD_BTN_ID: Record<PadKey, string> = {
  turn_left: 'btn-left',
  forward: 'btn-fwd',
  turn_right: 'btn-right',
  strafe_left: 'btn-strafe-left',
  back: 'btn-back',
  strafe_right: 'btn-strafe-right'
};

const COMPASS_DIR = ['N', 'E', 'S', 'W'] as const;

export type PartyHeroState = {
  id: HudHeroId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  downed: boolean;
  main: ItemType;
  off: ItemType;
};

export type PartyUiHooks = {
  onTurnLeft: () => void;
  onTurnRight: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onStrafeLeft: () => void;
  onStrafeRight: () => void;
  onInteract: () => void;
  onMenu: () => void;
  onBag: () => void;
  onPortrait: (id: HudHeroId) => void;
  onHand: (id: HudHeroId, hand: 'main' | 'off') => void;
};

export function hudAsset(rel: string): string {
  return `${BASE}${rel.replace(/^\//, '')}`;
}

function setIcon(el: Element | null, rel: string): void {
  const img = el?.querySelector('img');
  if (img instanceof HTMLImageElement) img.src = hudAsset(rel);
}

function place(el: HTMLElement, r: Rect): void {
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}

export const HERO_MAX_HP: Record<HudHeroId, number> = {
  brannoc: 45,
  wren: 32,
  ilsevar: 24,
  mags: 28
};

let portraitPreload: Promise<void> | null = null;

export function preloadPortraitArt(): Promise<void> {
  if (portraitPreload) return portraitPreload;
  portraitPreload = Promise.all(
    allPortraitFiles().map(
      (file) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = hudAsset(`${PORTRAIT_DIR}/${file}`);
        })
    )
  ).then(() => undefined);
  return portraitPreload;
}

function heroState(id: HudHeroId, downed = false): PartyHeroState {
  const maxHp = HERO_MAX_HP[id];
  const maxMana = id === 'wren' ? 12 : id === 'ilsevar' ? 16 : 0;
  return {
    id,
    hp: downed ? 0 : maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    downed,
    main: DEFAULT_EQUIPMENT[id as HeroId].main,
    off: DEFAULT_EQUIPMENT[id as HeroId].off
  };
}

export class Floor1PartyUi {
  layout: PortraitLayout;
  heroes: Record<HudHeroId, PartyHeroState>;
  oil = 2;
  oilMax = 4;
  logLines: string[] = [];
  private logMessages: string[] = [];
  private logScrollFromBottom = 0;
  private host: HTMLElement;
  private logEl: HTMLElement;
  private compassEl: HTMLImageElement;
  private oilCountEl: HTMLElement;
  private doorBtn: HTMLButtonElement;
  private stripEl: HTMLElement;
  private homeEl: HTMLElement;
  private sheetEl: HTMLElement;
  private bagEl: HTMLElement;
  private menuEl: HTMLElement;
  private hooks: PartyUiHooks;

  constructor(host: HTMLElement, layout: PortraitLayout, hooks: PartyUiHooks) {
    this.host = host;
    this.layout = layout;
    this.hooks = hooks;
    this.heroes = {
      brannoc: heroState('brannoc'),
      wren: heroState('wren'),
      ilsevar: heroState('ilsevar'),
      mags: heroState('mags')
    };
    this.applyPartyQuery(typeof location === 'undefined' ? '' : location.search);
    this.logEl = host.querySelector('#message-log')!;
    this.compassEl = host.querySelector('#compass-face') as HTMLImageElement;
    this.oilCountEl = host.querySelector('#oil-count')!;
    this.doorBtn = host.querySelector('#btn-door') as HTMLButtonElement;
    this.stripEl = host.querySelector('#party-strip')!;
    this.homeEl = host.querySelector('#home-band')!;
    this.sheetEl = document.getElementById('hero-sheet')!;
    this.bagEl = document.getElementById('bag-overlay')!;
    this.menuEl = document.getElementById('menu-overlay')!;
    this.bind();
    this.applyLayout(layout);
    this.drawPortraits();
    this.setOil(this.oil);
  }

  static mount(hooks: PartyUiHooks, layout: PortraitLayout): Floor1PartyUi {
    const host = document.getElementById('game-hud');
    if (!host) throw new Error('game-hud missing');
    return new Floor1PartyUi(host, layout, hooks);
  }

  applyLayout(layout: PortraitLayout): void {
    this.layout = layout;
    const root = document.documentElement;
    root.style.setProperty('--view-h', `${layout.view.h}px`);
    root.style.setProperty('--strip-h', `${layout.strip.h}px`);
    root.style.setProperty('--safe-top', `${layout.safe.top}px`);
    root.style.setProperty('--safe-bottom', `${layout.safe.bottom}px`);
    place(this.host.querySelector('#btn-menu') as HTMLElement, layout.menu);
    place(this.host.querySelector('#btn-bag') as HTMLElement, layout.bag);
    place(this.host.querySelector('#compass') as HTMLElement, layout.compass);
    place(this.host.querySelector('#btn-oil') as HTMLElement, layout.oil);
    setIcon(this.host.querySelector('#btn-menu'), HUD_ICON.menu);
    setIcon(this.host.querySelector('#btn-bag'), HUD_ICON.bag);
    setIcon(this.host.querySelector('#btn-oil'), HUD_ICON.oil);
    setIcon(document.getElementById('btn-left'), HUD_ICON.turn_left);
    setIcon(document.getElementById('btn-fwd'), HUD_ICON.forward);
    setIcon(document.getElementById('btn-right'), HUD_ICON.turn_right);
    setIcon(document.getElementById('btn-strafe-left'), HUD_ICON.strafe_left);
    setIcon(document.getElementById('btn-back'), HUD_ICON.back);
    setIcon(document.getElementById('btn-strafe-right'), HUD_ICON.strafe_right);
    this.renderLog();
    place(this.host.querySelector('#move-pad') as HTMLElement, layout.pad);
    for (const key of PAD_KEYS) {
      const btn = document.getElementById(PAD_BTN_ID[key]);
      if (!btn) continue;
      const r = layout.padButtons[key];
      btn.style.left = `${r.x - layout.pad.x}px`;
      btn.style.top = `${r.y - layout.pad.y}px`;
      btn.style.width = `${r.w}px`;
      btn.style.height = `${r.h}px`;
    }
    place(this.stripEl, layout.strip);
    place(this.homeEl, layout.homeBand);
    this.drawPortraits();
  }

  setOil(n: number): void {
    this.oil = Math.max(0, Math.min(this.oilMax, n));
    if (this.oilCountEl) this.oilCountEl.textContent = `${this.oil}/${this.oilMax}`;
  }

  setCompass(dir: number): void {
    const face = COMPASS_DIR[dir & 3];
    if (this.compassEl) this.compassEl.src = hudAsset(`art/ui/panel/compass_${face}.png`);
  }

  setDoor(show: boolean, label: string): void {
    this.doorBtn.classList.toggle('visible', show);
    this.doorBtn.textContent = label;
  }

  pushLog(text: string): void {
    if (!text) return;
    this.logMessages.push(text);
    this.logScrollFromBottom = 0;
    this.renderLog();
  }

  private renderLog(): void {
    this.logLines = this.logMessages.flatMap((text) => wrapLogMessage(text, this.layout.logMaxChars));
    const visible = visibleLogLineCount(this.layout.log.h);
    this.logScrollFromBottom = Math.min(
      this.logScrollFromBottom,
      Math.max(0, this.logLines.length - visible)
    );
    const shown = logVisibleSlice(this.logLines, visible, this.logScrollFromBottom);
    place(this.logEl, this.layout.log);
    place(this.doorBtn, this.layout.open);
    this.logEl.classList.toggle('can-scroll', this.logLines.length > visible);
    this.logEl.replaceChildren();
    for (const line of shown) {
      const row = document.createElement('div');
      row.className = 'log-line';
      row.textContent = line;
      this.logEl.appendChild(row);
    }
  }

  private pageLog(): void {
    const visible = visibleLogLineCount(this.layout.log.h);
    if (this.logLines.length <= visible) return;
    this.logScrollFromBottom = nextLogScrollFromBottom(
      this.logLines.length,
      visible,
      this.logScrollFromBottom
    );
    this.renderLog();
  }

  setHeroDowned(id: HudHeroId, downed: boolean): void {
    const hero = this.heroes[id];
    hero.downed = downed;
    hero.hp = downed ? 0 : hero.maxHp;
    this.drawPortraits();
  }

  setHeroHp(id: HudHeroId, hp: number): void {
    const hero = this.heroes[id];
    hero.hp = Math.max(0, Math.min(hero.maxHp, Math.round(hp)));
    hero.downed = hero.hp <= 0;
    this.drawPortraits();
  }

  applyPartyQuery(search: string): void {
    const overrides = parsePartyQuery(search, HERO_MAX_HP);
    for (const id of HERO_IDS) {
      const next = overrides[id];
      if (!next) continue;
      this.heroes[id].hp = next.hp;
      this.heroes[id].downed = next.downed;
    }
  }

  private faceSrc(id: HudHeroId): string {
    const hero = this.heroes[id];
    return hudAsset(portraitRelPath(id, portraitState(hero.hp, hero.maxHp, hero.downed), this.layout.cssW));
  }

  openSheet(id: HudHeroId): void {
    const hero = this.heroes[id];
    this.closeOverlays();
    const body = this.sheetEl.querySelector('.sheet-body')!;
    const mp = hero.maxMana > 0 ? `<div>MP ${hero.mana}/${hero.maxMana}</div>` : '';
    const downed = hero.downed || hero.hp <= 0;
    body.innerHTML =
      `<div class="sheet-portrait-wrap${downed ? ' downed' : ''}">` +
      `<img class="sheet-portrait" alt="" src="${this.faceSrc(id)}" />` +
      (downed ? `<div class="portrait-downed-veil"></div>` : '') +
      `</div>` +
      `<div class="sheet-copy">` +
      `<h2>${HERO_DISPLAY[id]}</h2>` +
      `<div>HP ${hero.hp}/${hero.maxHp}</div>${mp}` +
      `<div>Main ${hero.main.replace(/_/g, ' ')}</div>` +
      `<div>Off ${hero.off.replace(/_/g, ' ')}</div>` +
      (downed ? `<div class="sheet-down">Downed</div>` : '') +
      `</div>`;
    this.sheetEl.hidden = false;
    this.sheetEl.dataset.hero = id;
  }

  toggleBag(): void {
    const open = this.bagEl.hidden;
    this.closeOverlays();
    this.bagEl.hidden = !open;
  }

  toggleMenu(): void {
    const open = this.menuEl.hidden;
    this.closeOverlays();
    this.menuEl.hidden = !open;
  }

  closeOverlays(): void {
    this.sheetEl.hidden = true;
    this.bagEl.hidden = true;
    this.menuEl.hidden = true;
  }

  overlayOpen(): boolean {
    return !this.sheetEl.hidden || !this.bagEl.hidden || !this.menuEl.hidden;
  }

  private bind(): void {
    const click = (id: string, fn: (e: Event) => void) => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn(e);
      });
    };
    click('btn-left', () => this.hooks.onTurnLeft());
    click('btn-right', () => this.hooks.onTurnRight());
    click('btn-fwd', () => this.hooks.onStepForward());
    click('btn-back', () => this.hooks.onStepBack());
    click('btn-strafe-left', () => this.hooks.onStrafeLeft());
    click('btn-strafe-right', () => this.hooks.onStrafeRight());
    click('btn-door', () => this.hooks.onInteract());
    click('btn-menu', () => this.hooks.onMenu());
    click('btn-bag', () => this.hooks.onBag());
    this.logEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pageLog();
    });
    this.sheetEl.querySelector('.overlay-close')?.addEventListener('click', () => this.closeOverlays());
    this.bagEl.querySelector('.overlay-close')?.addEventListener('click', () => this.closeOverlays());
    this.menuEl.querySelector('.overlay-close')?.addEventListener('click', () => this.closeOverlays());
    this.sheetEl.addEventListener('click', (e) => {
      if (e.target === this.sheetEl) this.closeOverlays();
    });
    this.bagEl.addEventListener('click', (e) => {
      if (e.target === this.bagEl) this.closeOverlays();
    });
    this.menuEl.addEventListener('click', (e) => {
      if (e.target === this.menuEl) this.closeOverlays();
    });
  }

  private drawPortraits(): void {
    this.stripEl.replaceChildren();
    for (const spec of this.layout.portraits) {
      const hero = this.heroes[spec.id];
      const cell = document.createElement('div');
      const downed = hero.downed || hero.hp <= 0;
      cell.className = `portrait-cell${downed ? ' downed' : ''}`;
      cell.dataset.hero = spec.id;
      cell.dataset.state = portraitState(hero.hp, hero.maxHp, hero.downed);
      place(cell, { x: spec.rect.x - this.layout.strip.x, y: 0, w: spec.rect.w, h: spec.rect.h });

      const img = document.createElement('img');
      img.className = 'portrait-face';
      img.alt = HERO_DISPLAY[spec.id];
      img.src = this.faceSrc(spec.id);
      img.draggable = false;
      cell.appendChild(img);
      if (downed) {
        const veil = document.createElement('div');
        veil.className = 'portrait-downed-veil';
        cell.appendChild(veil);
      }

      const fade = document.createElement('div');
      fade.className = 'bar-fade';
      place(fade, { x: 0, y: spec.bars.gradient.y - spec.rect.y, w: spec.rect.w, h: spec.bars.gradient.h });
      cell.appendChild(fade);

      cell.appendChild(this.barEl(spec.bars.hp, spec.rect, hero.hp / Math.max(1, hero.maxHp), 'hp'));
      if (spec.bars.mp) {
        cell.appendChild(this.barEl(spec.bars.mp, spec.rect, hero.mana / Math.max(1, hero.maxMana), 'mp'));
      }

      cell.appendChild(this.handEl(spec.id, 'main', hero.main, spec.handMain.visual, spec.handMain.tap, spec.rect));
      cell.appendChild(this.handEl(spec.id, 'off', hero.off, spec.handOff.visual, spec.handOff.tap, spec.rect));

      const sheet = document.createElement('button');
      sheet.type = 'button';
      sheet.className = 'portrait-sheet-hit';
      sheet.setAttribute('aria-label', `${HERO_DISPLAY[spec.id]} sheet`);
      sheet.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hooks.onPortrait(spec.id);
      });
      cell.appendChild(sheet);

      this.stripEl.appendChild(cell);
    }
  }

  private barEl(bar: Rect, cell: Rect, pct: number, kind: 'hp' | 'mp'): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `vital-bar ${kind}`;
    place(wrap, { x: bar.x - cell.x, y: bar.y - cell.y, w: bar.w, h: bar.h });
    const fill = document.createElement('div');
    fill.className = 'vital-fill';
    fill.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
    fill.style.background = kind === 'hp' ? HP_FILL : MP_FILL;
    wrap.appendChild(fill);
    return wrap;
  }

  private handEl(
    id: HudHeroId,
    hand: 'main' | 'off',
    item: ItemType,
    visual: Rect,
    tap: Rect,
    cell: Rect
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `hand-hit ${hand}`;
    btn.dataset.hero = id;
    btn.dataset.hand = hand;
    btn.setAttribute('aria-label', `${HERO_DISPLAY[id]} ${hand}`);
    place(btn, { x: tap.x - cell.x, y: tap.y - cell.y, w: tap.w, h: tap.h });
    const icon = document.createElement('img');
    icon.className = 'hand-icon';
    icon.alt = '';
    icon.src = hudAsset(`art/ui/hands/${HAND_FILE[item] ?? 'hand_axe.png'}`);
    icon.style.left = `${visual.x - tap.x}px`;
    icon.style.top = `${visual.y - tap.y}px`;
    icon.style.width = `${visual.w}px`;
    icon.style.height = `${visual.h}px`;
    btn.appendChild(icon);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hooks.onHand(id, hand);
    });
    return btn;
  }
}

export function layoutFromViewport(
  cssW: number,
  cssH: number,
  safe: SafeInsets
): PortraitLayout {
  return measurePortraitLayout(cssW, cssH, safe);
}
