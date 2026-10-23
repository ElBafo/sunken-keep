import { DEFAULT_EQUIPMENT, DEFAULT_FORMATION, MELEE_ITEMS, type FormationRow, type HeroId, type ItemType } from '../constants';
import { heroDisplayName, perkChoices, type PerkCopy } from './perks';
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
  main: string;
  off: string;
  armour?: string;
  formation: FormationRow;
  recovery: { main: number; off: number };
  pendingPerk: number | null;
  level: number;
  xp: number;
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
  onPickPerk?: (id: HudHeroId, perkId: string) => boolean;
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
    off: DEFAULT_EQUIPMENT[id as HeroId].off,
    formation: DEFAULT_FORMATION[id as HeroId],
    recovery: { main: 0, off: 0 },
    pendingPerk: null,
    level: 1,
    xp: 0
  };
}

export class Floor1PartyUi {
  layout: PortraitLayout;
  heroes: Record<HudHeroId, PartyHeroState>;
  oil = 2;
  oilMax = 4;
  speaking: HudHeroId | null = null;
  inCombat = false;
  frostHintArmed = false;
  frostHintDismissed = false;
  perkCopy: PerkCopy | null = null;
  logLines: string[] = [];
  private nowSec = 0;
  private nowMs = 0;
  private levelFlash: { id: HudHeroId; started: number } | null = null;
  private perkPick: { hero: HudHeroId; level: number; selected: string | null } | null = null;
  private readyArmed = new Set<string>();
  private onHandReady: ((name: string) => void) | null = null;
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
    this.bindPerkScreen();
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
    const perk = document.getElementById('perk-screen');
    if (perk) perk.style.height = `${layout.view.h}px`;
    this.drawPortraits();
    if (this.perkPick) this.renderPerkScreen();
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

  setSpeaking(id: HudHeroId | null): void {
    if (this.speaking === id) return;
    this.speaking = id;
    this.drawPortraits();
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
    const waiting = this.pendingEntries(id);
    const gift = waiting
      .map(
        (row) =>
          `<button class="sheet-gift" type="button" data-hero="${id}" data-level="${row.level}">` +
          `${this.perkCopy?.title ?? 'Choose a gift'}` +
          `</button>`
      )
      .join('');
    body.innerHTML =
      `<div class="sheet-portrait-wrap${downed ? ' downed' : ''}">` +
      `<img class="sheet-portrait" alt="" src="${this.faceSrc(id)}" />` +
      (downed ? `<div class="portrait-downed-veil"></div>` : '') +
      `</div>` +
      `<div class="sheet-copy">` +
      `<h2>${HERO_DISPLAY[id]}</h2>` +
      `<div>Level ${hero.level}</div>` +
      `<div>XP ${hero.xp}</div>` +
      `<div>HP ${hero.hp}/${hero.maxHp}</div>${mp}` +
      `<div>Main ${hero.main.replace(/_/g, ' ')}</div>` +
      `<div>Off ${hero.off.replace(/_/g, ' ')}</div>` +
      (downed ? `<div class="sheet-down">Downed</div>` : '') +
      gift +
      `</div>`;
    this.sheetEl.hidden = false;
    this.sheetEl.dataset.hero = id;
    body.querySelectorAll<HTMLButtonElement>('.sheet-gift').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const level = Number(btn.dataset.level);
        this.openPerkScreen(id, Number.isFinite(level) ? level : hero.pendingPerk ?? 3);
      });
    });
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
    this.closePerkScreen();
  }

  clearLog(): void {
    this.logLines = [];
    this.logMessages = [];
    this.logScrollFromBottom = 0;
    this.renderLog();
  }

  overlayOpen(): boolean {
    return !this.sheetEl.hidden || !this.bagEl.hidden || !this.menuEl.hidden || this.perkScreenOpen();
  }

  perkScreenOpen(): boolean {
    return !!document.getElementById('perk-screen')?.classList.contains('show');
  }

  setHand(id: HudHeroId, hand: 'main' | 'off', item: string): void {
    this.heroes[id][hand] = item;
    this.drawPortraits();
  }

  setArmour(id: HudHeroId, item: string | undefined): void {
    this.heroes[id].armour = item;
  }

  setHeroMana(id: HudHeroId, mana: number): void {
    const hero = this.heroes[id];
    hero.mana = Math.max(0, Math.min(hero.maxMana, Math.round(mana)));
    this.drawPortraits();
  }

  setHandReady(fn: (name: string) => void): void {
    this.onHandReady = fn;
  }

  syncHero(
    id: HudHeroId,
    state: {
      hp: number;
      maxHp: number;
      mana: number;
      maxMana: number;
      downed?: boolean;
      recovery?: { main: number; off: number };
      formation?: FormationRow;
      pendingPerk?: number | null;
      level?: number;
      xp?: number;
    }
  ): void {
    const hero = this.heroes[id];
    if (!hero) return;
    hero.hp = state.hp;
    hero.maxHp = state.maxHp;
    hero.mana = state.mana;
    hero.maxMana = state.maxMana;
    hero.downed = !!state.downed;
    if (state.formation) hero.formation = state.formation;
    if (state.recovery) {
      hero.recovery.main = state.recovery.main;
      hero.recovery.off = state.recovery.off;
    }
    if (state.pendingPerk !== undefined) hero.pendingPerk = state.pendingPerk;
    if (state.level != null) hero.level = state.level;
    if (state.xp != null) hero.xp = state.xp;
    this.drawPortraits();
  }

  playLevelUp(id: HudHeroId): void {
    this.levelFlash = { id, started: performance.now() };
    this.drawPortraits();
  }

  setPendingList(rows: Array<{ hero: string; level: number }>): void {
    for (const id of HERO_IDS) {
      const match = rows.filter((r) => r.hero === id).sort((a, b) => a.level - b.level);
      this.heroes[id].pendingPerk = match[0]?.level ?? null;
    }
    this.drawPortraits();
  }

  pendingEntries(id: HudHeroId): Array<{ hero: HudHeroId; level: number }> {
    const hero = this.heroes[id];
    return hero.pendingPerk ? [{ hero: id, level: hero.pendingPerk }] : [];
  }

  openPerkScreen(id: HudHeroId, level = this.heroes[id].pendingPerk ?? 3): boolean {
    const choices = perkChoices(id, level);
    const el = document.getElementById('perk-screen');
    if (!choices || !el || !this.perkCopy) return false;
    this.sheetEl.hidden = true;
    this.bagEl.hidden = true;
    this.menuEl.hidden = true;
    this.perkPick = { hero: id, level, selected: null };
    this.renderPerkScreen();
    el.classList.add('show');
    el.hidden = false;
    return true;
  }

  closePerkScreen(): void {
    const el = document.getElementById('perk-screen');
    el?.classList.remove('show');
    if (el) el.hidden = true;
    this.perkPick = null;
  }

  armFrostHint(): void {
    if (this.frostHintDismissed) return;
    this.frostHintArmed = true;
    this.refreshHandState();
  }

  hideFrostHint(): void {
    this.frostHintArmed = false;
    this.refreshHandState();
  }

  dismissFrostHint(): void {
    this.frostHintDismissed = true;
    this.frostHintArmed = false;
    this.refreshHandState();
  }

  tick(nowMs: number): void {
    this.nowMs = nowMs;
    this.nowSec = nowMs / 1000;
    this.tickPortraitFx(nowMs);
    for (const id of HERO_IDS) {
      const hero = this.heroes[id];
      for (const hand of ['main', 'off'] as const) {
        const key = `${id}:${hand}`;
        if (hero.recovery[hand] > this.nowSec) this.readyArmed.add(key);
        else if (this.readyArmed.has(key)) {
          this.readyArmed.delete(key);
          this.onHandReady?.('act_ready');
        }
      }
    }
    this.refreshHandState();
  }

  private refreshHandState(): void {
    for (const btn of this.stripEl.querySelectorAll<HTMLElement>('.hand-hit')) {
      const id = btn.dataset.hero as HudHeroId | undefined;
      const hand = btn.dataset.hand as 'main' | 'off' | undefined;
      if (!id || !hand) continue;
      const hero = this.heroes[id];
      const recovering = hero.recovery[hand] > this.nowSec;
      const item = hand === 'main' ? hero.main : hero.off;
      const melee =
        MELEE_ITEMS.includes(item as ItemType) || item === 'torch_lit' || item === 'torch_burnt';
      const outOfReach = this.inCombat && hero.formation === 'back' && melee && item !== 'wand' && item !== 'scroll';
      btn.classList.toggle('recovering', recovering);
      btn.classList.toggle('out-of-reach', outOfReach);
      btn.classList.toggle('downed', hero.downed);
      const frostHand = this.frostHintHand(id);
      const hint = this.frostHintArmed && !this.frostHintDismissed && frostHand === hand && !recovering && !hero.downed;
      btn.classList.toggle('wand-hint', hint);
      if (hint) btn.dataset.hint = 'wand';
      else delete btn.dataset.hint;
    }
  }

  private frostHintHand(id: HudHeroId): 'main' | 'off' | null {
    if (id !== 'ilsevar') return null;
    const hero = this.heroes.ilsevar;
    if (hero.main === 'wand' || (hero.main === 'scroll' && hero.mana > 0)) return 'main';
    if (hero.off === 'wand' || (hero.off === 'scroll' && hero.mana > 0)) return 'off';
    return null;
  }

  private tickPortraitFx(nowMs: number): void {
    if (this.levelFlash && nowMs - this.levelFlash.started >= 540) {
      this.levelFlash = null;
      const flash = this.stripEl.querySelector('.portrait-levelup');
      if (flash) flash.remove();
    } else if (this.levelFlash) {
      const t = (nowMs - this.levelFlash.started) / 180;
      const frame = Math.min(3, Math.floor(t) + 1);
      const img = this.stripEl.querySelector<HTMLImageElement>(
        `.portrait-cell[data-hero="${this.levelFlash.id}"] .portrait-levelup`
      );
      if (img) img.src = hudAsset(`art/ui/panel/portrait_levelup_${frame}.png`);
    }
    const badgeFrame = (Math.floor(nowMs / 1000) * 2) % 4 + 1;
    for (const img of this.stripEl.querySelectorAll<HTMLImageElement>('.perk-badge')) {
      img.src = hudAsset(`art/ui/perks/perk_pending_${badgeFrame}.png`);
    }
  }

  private bindPerkScreen(): void {
    const el = document.getElementById('perk-screen');
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target === el) this.closePerkScreen();
    });
    document.getElementById('perk-back')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closePerkScreen();
    });
    document.getElementById('perk-confirm')?.addEventListener('click', (e) => {
      e.preventDefault();
      const pick = this.perkPick;
      if (!pick?.selected) return;
      const ok = this.hooks.onPickPerk?.(pick.hero, pick.selected);
      if (ok) this.closePerkScreen();
    });
  }

  private renderPerkScreen(): void {
    const pick = this.perkPick;
    const copy = this.perkCopy;
    const el = document.getElementById('perk-screen');
    if (!pick || !copy || !el) return;
    const choices = perkChoices(pick.hero, pick.level);
    if (!choices) return;
    const title = document.getElementById('perk-title');
    const sub = document.getElementById('perk-sub');
    const portrait = document.getElementById('perk-portrait') as HTMLImageElement | null;
    const confirm = document.getElementById('perk-confirm') as HTMLButtonElement | null;
    const back = document.getElementById('perk-back');
    if (title) title.textContent = copy.title;
    if (sub) sub.textContent = copy.sub(heroDisplayName(pick.hero));
    if (portrait) portrait.src = this.faceSrc(pick.hero);
    if (back) back.textContent = copy.back;
    if (confirm) {
      confirm.textContent = copy.confirm;
      confirm.disabled = !pick.selected;
    }
    const cards = el.querySelectorAll<HTMLButtonElement>('.perk-card');
    cards.forEach((card, i) => {
      const id = choices[i];
      if (!id) return;
      const selected = pick.selected === id;
      const other = pick.selected && pick.selected !== id;
      card.classList.toggle('selected', selected);
      card.classList.toggle('dim', !!other);
      card.dataset.perk = id;
      const icon = card.querySelector<HTMLImageElement>('.perk-card-icon');
      const name = card.querySelector('.perk-card-name');
      const desc = card.querySelector('.perk-card-desc');
      if (icon) {
        icon.src = hudAsset(`art/ui/perks/perk_${id}${other ? '_dim' : ''}.png`);
        icon.alt = '';
      }
      if (name) name.textContent = copy.name(id);
      if (desc) desc.textContent = copy.desc(id);
      card.onclick = (e) => {
        e.preventDefault();
        this.perkPick = { ...pick, selected: id };
        this.renderPerkScreen();
      };
    });
    el.style.height = `${this.layout.view.h}px`;
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
      const speaking = this.speaking === spec.id;
      cell.className = `portrait-cell${downed ? ' downed' : ''}${speaking ? ' speaking' : ''}`;
      cell.dataset.hero = spec.id;
      if (speaking) cell.dataset.speaking = '1';
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
      if (this.levelFlash?.id === spec.id) {
        const flash = document.createElement('img');
        flash.className = 'portrait-levelup';
        flash.alt = '';
        const t = (this.nowMs - this.levelFlash.started) / 180;
        const frame = Math.min(3, Math.max(1, Math.floor(t) + 1));
        flash.src = hudAsset(`art/ui/panel/portrait_levelup_${frame}.png`);
        cell.appendChild(flash);
      }
      if (hero.pendingPerk) {
        const badge = document.createElement('img');
        badge.className = 'perk-badge';
        badge.alt = '';
        const badgeFrame = (Math.floor(this.nowMs / 1000) * 2) % 4 + 1;
        badge.src = hudAsset(`art/ui/perks/perk_pending_${badgeFrame}.png`);
        cell.appendChild(badge);
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
    item: string,
    visual: Rect,
    tap: Rect,
    cell: Rect
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `hand-hit ${hand}`;
    btn.dataset.hero = id;
    btn.dataset.hand = hand;
    const hero = this.heroes[id];
    const recovering = hero.recovery[hand] > this.nowSec;
    const melee = MELEE_ITEMS.includes(item as ItemType) || item === 'torch_lit' || item === 'torch_burnt';
    const outOfReach = this.inCombat && hero.formation === 'back' && melee && item !== 'wand' && item !== 'scroll';
    btn.classList.toggle('recovering', recovering);
    btn.classList.toggle('out-of-reach', outOfReach);
    btn.classList.toggle('downed', hero.downed);
    btn.setAttribute('aria-label', `${HERO_DISPLAY[id]} ${hand}`);
    place(btn, { x: tap.x - cell.x, y: tap.y - cell.y, w: tap.w, h: tap.h });
    const icon = document.createElement('img');
    icon.className = 'hand-icon';
    icon.alt = '';
    icon.src = hudAsset(`art/ui/hands/${HAND_FILE[item] ?? (item === 'iron_shield' ? 'hand_shield.png' : 'hand_axe.png')}`);
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
