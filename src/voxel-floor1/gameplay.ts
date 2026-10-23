import type { Scene } from 'three';
import type { HeroId, HandSlot } from '../core/types';
import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import { fetchJsonCached } from '../proto3d/asset-cache';
import { AudioManager } from '../proto3d/audio';
import { PartyBag } from '../proto3d/bag';
import { FIRST_FIGHT_PRIORITY_STEMS } from '../proto3d/floor1-sounds';
import {
  asHeroId,
  BarkDirector,
  barkDurationMs,
  DEFAULT_BARK_RULES,
  type BarkLine,
  type BarkPartyMember,
  type BarkRules
} from '../proto3d/bark-picker';
import { SpeechBubble } from '../proto3d/bubble';
import { enterPlayFromIntro, mountIntroSkip, type IntroSkipHandle } from '../proto3d/intro-skip';
import { IntroPlayer } from '../proto3d/intro';
import { InventoryUi } from '../proto3d/inventory-ui';
import {
  canEquip,
  equipSfx,
  isReadable,
  pickupSfx,
  preferredHand,
  normalizeItemId
} from '../proto3d/items';
import { loadLayout585 } from '../proto3d/layout585';
import { oilFlaskPlan } from '../proto3d/oil-flask';
import { resolveLocale, StoryText, type Locale } from '../proto3d/i18n';
import { StoryProgress } from '../proto3d/story-progress';
import { TitleScreen, type TitleAction } from '../proto3d/title';
import type { FloorData } from '../proto3d/types';
import { CELL } from './constants';
import { floor1Sconces } from './fixtures';
import { floor1Map, tileAt, type FloorTile } from './layout';
import { DOOR_LOCKED_MESSAGE, lootRevealed } from './loot';
import type { HudHeroId } from './portrait-layout';
import type { QualityLevel } from './lights';

export type GameplayPhase = 'boot' | 'tap' | 'title' | 'intro' | 'play';

export type GameplayFlags = {
  /** `?test=1` without `?title=1` — skip tap/title/intro so existing floor tests stay playable. */
  skipChrome: boolean;
  /** `?title=1` — Classic title after the first tap; New Game starts the intro. */
  showTitle: boolean;
};

export type GameplayHero = BarkPartyMember & {
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  main?: string;
  off?: string;
  armour?: string;
};

export type GameplayHooks = {
  pushLog: (text: string) => void;
  setSpeaking: (id: HudHeroId | null) => void;
  party: () => GameplayHero[];
  oil: () => number;
  setOil?: (n: number) => void;
  setHand?: (id: HudHeroId, hand: 'main' | 'off', item: string) => void;
  setArmour?: (id: HudHeroId, item: string | undefined) => void;
  setHeroHp?: (id: HudHeroId, hp: number) => void;
  setHeroMana?: (id: HudHeroId, mana: number) => void;
  hideItemAt?: (x: number, y: number) => void;
  openChestAt?: (x: number, y: number) => void;
  unlockFacingDoor?: () => string;
};

export { DOOR_LOCKED_MESSAGE };

export function parseGameplayFlags(search: string): GameplayFlags {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const test = q.get('test') === '1';
  const title = q.get('title') === '1';
  return {
    skipChrome: test && !title,
    showTitle: title
  };
}

export function protoAudioQuality(quality: QualityLevel): 'high' | 'low' {
  return quality === 'max' ? 'high' : 'low';
}

export function floor1BarkAt(x: number, y: number): string | undefined {
  return tileAt(floor1Map, x, y)?.bark;
}

/** Four party hurt clips — decoded in the first-fight burst, played from `noteHero`. */
export const HERO_HURT_STEMS = FIRST_FIGHT_PRIORITY_STEMS.filter((stem) => stem.includes('_hurt_'));

function tapEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('tap-to-start');
}

function tapText(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('tap-to-start-text');
}

export class Floor1Gameplay {
  readonly story = new StoryText();
  readonly progress = new StoryProgress();
  readonly director = new BarkDirector();
  audio: AudioManager;
  intro: IntroPlayer | null = null;
  title: TitleScreen | null = null;
  bubble: SpeechBubble | null = null;
  bag = new PartyBag();
  inventory: InventoryUi | null = null;
  phase: GameplayPhase = 'boot';
  audioUnlocked = false;
  lastBark: BarkLine | null = null;
  lastBarkTrigger: string | null = null;
  lastMessage = '';
  private hooks: GameplayHooks | null = null;
  private bagWanted = false;
  private flags: GameplayFlags;
  private introSkip: IntroSkipHandle | null = null;
  private playStarted = false;
  private pendingTap = false;
  private scene: Scene | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHp: Record<string, { hp: number; downed: boolean }> = {};
  private firedCells = new Set<string>();
  private storyFlags = new Set<string>();

  constructor(search: string, quality: QualityLevel) {
    this.flags = parseGameplayFlags(search);
    this.audio = new AudioManager(protoAudioQuality(quality));
  }

  allowsInput(): boolean {
    return this.phase === 'play';
  }

  introVisible(): boolean {
    return !!document.getElementById('intro-overlay')?.classList.contains('show');
  }

  titleVisible(): boolean {
    return !!document.getElementById('title-overlay')?.classList.contains('show');
  }

  async loadStory(search: string): Promise<void> {
    const locale = resolveLocale(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search));
    document.documentElement.lang = locale;
    const base = import.meta.env.BASE_URL;
    await Promise.all([this.story.load(locale), this.progress.load(base), this.loadBarkRules(base)]);
    this.setTapStatus('loading');
  }

  attach(scene: Scene): void {
    this.scene = scene;
    this.audio.attach(scene);
  }

  mountChrome(): void {
    const introCanvas = document.getElementById('intro-canvas') as HTMLCanvasElement | null;
    const titleCanvas = document.getElementById('title-canvas') as HTMLCanvasElement | null;
    const bubbleCanvas = document.getElementById('speech-bubble') as HTMLCanvasElement | null;
    if (bubbleCanvas) this.bubble = new SpeechBubble(bubbleCanvas);
    if (introCanvas) {
      this.intro = new IntroPlayer(introCanvas, this.story);
      this.intro.setTimeSource(() => this.audio.introCurrentTime());
      this.intro.setAudioState(() => this.audio.introAudioState());
      this.intro.setOnFinished(() => this.skipIntro());
      const overlay = document.getElementById('intro-overlay');
      if (overlay) {
        this.introSkip = mountIntroSkip({
          overlay,
          story: this.story,
          onSkip: () => this.skipIntro()
        });
        this.introSkip.hide();
      }
    }
    if (titleCanvas) {
      this.title = new TitleScreen(titleCanvas, this.story, (action) => this.handleTitleAction(action));
    }
    this.wireTap();
  }

  async start(hooks: GameplayHooks): Promise<void> {
    this.hooks = hooks;
    for (const hero of hooks.party()) {
      this.lastHp[hero.id] = { hp: hero.hp ?? 1, downed: !!hero.downed };
    }
    if (typeof document !== 'undefined') {
      this.mountChrome();
      void this.mountInventory();
    }
    const scene = this.scene;
    if (scene) void this.audio.loadBeforePlaySounds(scene);
    void this.audio.loadIntroMusic();
    if (this.flags.showTitle) void this.title?.loadEssential();
    if (this.flags.skipChrome) {
      this.hideTap();
      this.beginPlay();
      return;
    }
    if (this.flags.showTitle) {
      this.phase = 'tap';
      this.showTap('tap_to_start');
      if (this.pendingTap) this.consumeTitleTap();
      return;
    }
    await this.openIntro();
  }

  unlock(): void {
    this.audio.unlock();
    this.audioUnlocked = true;
  }

  skipIntro(): void {
    this.unlock();
    this.intro?.skip();
    enterPlayFromIntro({
      hideSkip: () => this.introSkip?.hide(),
      introOverlay: document.getElementById('intro-overlay'),
      tapToStart: tapEl(),
      alreadyPlaying: this.phase === 'play' || this.playStarted,
      beginPlay: () => this.beginPlay()
    });
  }

  speakBark(trigger: string, forcedSpeaker?: HudHeroId): boolean {
    if (!this.hooks) return false;
    const picked = this.director.pick(trigger, this.story.barksFor(trigger), {
      nowMs: performance.now(),
      party: this.hooks.party(),
      flags: this.storyFlags,
      act: 1,
      forcedSpeaker,
      skipRateLimits: !!forcedSpeaker
    });
    if (!picked) return false;
    this.lastBarkTrigger = trigger;
    return this.deliverBark(picked);
  }

  onStep(x: number, y: number): void {
    if (this.phase !== 'play') return;
    const tile = tileAt(floor1Map, x, y);
    if (!tile) return;
    if (tile.deepWater) {
      this.audio.playStep('step_water_deep');
      if (this.progress.fire('water_deep')) this.pushStoryLog('water_deep');
      this.speakBark('deep_water');
    } else if (tile.shallowWater) {
      this.audio.playStep('step_water_shallow');
      if (this.progress.fire('water_shallow')) this.pushStoryLog('water_shallow');
    } else {
      this.audio.playStep('step');
    }
    this.fireTileBark(x, y);
  }

  onSecretOpened(): void {
    if (this.progress.fire('secret_found')) this.pushStoryLog('secret_found');
    this.speakBark('secret_wall');
  }

  bagOpen(): boolean {
    return this.inventory?.open ?? this.bagWanted;
  }

  hasBagKey(): boolean {
    return this.bag.has('key') || this.bag.has('captain_key');
  }

  takeDoorKey(): boolean {
    if (this.bag.remove('key', 1)) {
      this.inventory?.redraw();
      return true;
    }
    if (this.bag.remove('captain_key', 1)) {
      this.inventory?.redraw();
      return true;
    }
    return false;
  }

  giveItem(id: string, n = 1, journalPage?: number): number {
    const added = this.bag.add(id, n, undefined, journalPage != null ? { journalPage } : undefined);
    this.inventory?.redraw();
    return added;
  }

  onDoorLocked(x: number, y: number): void {
    this.audio.playDoor('door_locked', x, y);
    this.progress.fire('door_locked');
    this.showMessage(DOOR_LOCKED_MESSAGE);
  }

  onDoorResult(result: string, x: number, y: number): void {
    if (result === 'unlocking') {
      this.audio.playDoor('door_unlock', x, y);
      if (this.progress.fire('door_unlocked')) this.pushStoryLog('door_unlocked');
      else this.showMessage(this.story.log('door_unlocked'));
      return;
    }
    if (result !== 'toggled') return;
    const open = !!tileAt(floor1Map, x, y)?.doorOpen;
    this.audio.playDoor(open ? 'door_open' : 'door_close', x, y);
  }

  pickupItemAt(x: number, y: number): boolean {
    const tile = tileAt(floor1Map, x, y);
    if (!tile || !lootRevealed(floor1Map, x, y)) return false;
    if (tile.chest && !tile.chestOpen) return this.lootChest(x, y, tile);
    if (!tile.item) return false;
    const id = normalizeItemId(tile.item);
    const meta = id === 'journal_page' ? { journalPage: tile.journalPage ?? 1 } : undefined;
    const added = this.bag.add(id, 1, undefined, meta);
    if (!added) {
      this.showMessage(this.story.log('bag_full'));
      this.audio.playUi('item_use_fail');
      return true;
    }
    tile.item = undefined;
    this.hooks?.hideItemAt?.(x, y);
    this.audio.playUi(pickupSfx(id));
    const key = id === 'oil_flask' ? 'oil_pickup' : id === 'journal_page' ? 'pickup_scroll' : `pickup_${id}`;
    const named = this.story.log(key);
    this.showMessage(named || this.story.log('pickup_item', { item: this.story.itemName(id) }));
    if (id === 'key' || id === 'captain_key') this.progress.fire('pickup_key');
    this.inventory?.redraw();
    return true;
  }

  openBag(): void {
    this.bagWanted = true;
    if (this.inventory) {
      void this.inventory.load().then(() => {
        if (this.phase === 'play' && this.bagWanted) this.inventory?.show();
      });
    }
    if (this.progress.fire('tut_inventory')) this.speakBark('tut_inventory');
  }

  closeBag(): void {
    this.bagWanted = false;
    this.inventory?.hide();
  }

  toggleBag(): void {
    if (this.bagOpen()) this.closeBag();
    else this.openBag();
  }

  equipmentState(): Record<HeroId, { main: string; off: string; armour?: string }> {
    const out = {} as Record<HeroId, { main: string; off: string; armour?: string }>;
    for (const hero of this.hooks?.party() ?? []) {
      const id = hero.id as HeroId;
      out[id] = { main: hero.main ?? 'empty_hand', off: hero.off ?? 'empty_hand', armour: hero.armour };
    }
    return out;
  }

  handlePortraitTap(hero: HudHeroId): boolean {
    if (!this.inventory?.open || this.inventory.selected < 0) return false;
    const slot = this.bag.slots[this.inventory.selected];
    if (!slot) return false;
    if (slot.item === 'potion_red' || slot.item === 'potion_blue' || slot.item === 'potion_green') {
      this.drinkBagSlot(this.inventory.selected, hero);
      return true;
    }
    if (isReadable(slot.item) || slot.item === 'oil_flask' || slot.item === 'oil' || slot.item === 'key' || slot.item === 'captain_key') {
      this.useBagSlot(this.inventory.selected);
      return true;
    }
    if (this.inventory.equipPick) {
      this.equipBagSlot(this.inventory.selected, hero);
      return true;
    }
    return false;
  }

  handleHandTap(hero: HudHeroId, hand: 'main' | 'off'): boolean {
    if (!this.inventory?.open || this.inventory.selected < 0) return false;
    const slot = this.bag.slots[this.inventory.selected];
    if (!slot) return false;
    if (this.inventory.equipPick) {
      this.equipBagSlot(this.inventory.selected, hero, hand);
      return true;
    }
    return this.handlePortraitTap(hero);
  }

  useBagSlot(index: number): void {
    const slot = this.bag.slots[index];
    if (!slot) return;
    if (isReadable(slot.item)) {
      const page = slot.journalPage ?? 1;
      const key = page === 2 ? 'journal_f2' : 'read_journal';
      if (this.progress.fire(key)) this.pushStoryLog(key);
      else this.showMessage(this.story.log(key));
      this.audio.playUi('scroll');
      return;
    }
    if (slot.item === 'potion_red' || slot.item === 'potion_blue' || slot.item === 'potion_green') {
      this.showMessage(this.story.uiText('bag.who_drinks') || this.story.uiText('bag.pick_hero'));
      if (this.inventory) this.inventory.pickHero = slot.item;
      this.inventory?.redraw();
      return;
    }
    if (slot.item === 'oil_flask' || slot.item === 'oil') {
      this.useOilFlask(index);
      return;
    }
    if (slot.item === 'key' || slot.item === 'captain_key') {
      const result = this.hooks?.unlockFacingDoor?.();
      if (result === 'unlocking' || result === 'toggled') return;
      this.audio.playUi('item_use_fail');
      return;
    }
    this.audio.playUi('item_use_fail');
  }

  drinkBagSlot(index: number, hero: HudHeroId): void {
    const slot = this.bag.slots[index];
    if (!slot) return;
    const member = this.hooks?.party().find((h) => h.id === hero);
    if (!member) return;
    if (slot.item === 'potion_red') {
      const max = member.maxHp ?? member.hp ?? 1;
      const hp = member.hp ?? max;
      if (hp >= max) {
        this.showMessage(this.story.log('full_health', { hero: this.story.heroName(hero) }));
        this.audio.playUi('item_use_fail');
        return;
      }
      if (!this.bag.takeAt(index, 1)) return;
      this.hooks?.setHeroHp?.(hero, Math.min(max, hp + 15));
      this.showMessage(this.story.log('drink_potion', { hero: this.story.heroName(hero), n: 15 }));
    } else if (slot.item === 'potion_blue') {
      const max = member.maxMana ?? 0;
      const mana = member.mana ?? 0;
      if (max <= 0) {
        this.showMessage(this.story.log('no_mana_pool', { hero: this.story.heroName(hero) }));
        this.audio.playUi('item_use_fail');
        return;
      }
      if (!this.bag.takeAt(index, 1)) return;
      this.hooks?.setHeroMana?.(hero, Math.min(max, mana + 8));
      this.showMessage(this.story.log('drink_mana', { hero: this.story.heroName(hero), n: 8 }));
    } else if (slot.item === 'potion_green') {
      const max = member.maxHp ?? member.hp ?? 1;
      const hp = member.hp ?? max;
      if (!this.bag.takeAt(index, 1)) return;
      this.hooks?.setHeroHp?.(hero, Math.min(max, hp + 5));
      this.showMessage(this.story.log('drink_green', { hero: this.story.heroName(hero), n: 5 }));
    } else {
      return;
    }
    this.audio.playUi('potion');
    if (this.inventory) this.inventory.pickHero = null;
    this.inventory?.redraw();
  }

  equipBagSlot(index: number, hero: HudHeroId, slot?: 'main' | 'off' | 'armour' | 'trinket'): boolean {
    const entry = this.bag.slots[index];
    if (!entry || !canEquip(entry.item, hero as HeroId)) {
      this.audio.playUi('item_use_fail');
      return false;
    }
    const item = entry.item;
    if (slot === 'trinket') {
      this.audio.playUi('item_use_fail');
      return false;
    }
    if (item === 'chain_mail' && slot && slot !== 'armour') {
      this.audio.playUi('item_use_fail');
      return false;
    }
    if (item !== 'chain_mail' && slot === 'armour') {
      this.audio.playUi('item_use_fail');
      return false;
    }
    const taken = this.bag.takeAt(index, 1);
    if (!taken) return false;
    const eq = this.equipmentState()[hero as HeroId];
    if (item === 'chain_mail') {
      if (eq?.armour) this.bag.add(eq.armour);
      this.hooks?.setArmour?.(hero, item);
    } else {
      const hand = (slot === 'main' || slot === 'off' ? slot : preferredHand(item)) as HandSlot;
      const prev = eq?.[hand];
      if (prev && prev !== 'empty_hand') this.bag.add(prev);
      this.hooks?.setHand?.(hero, hand, item);
    }
    this.audio.playUi(equipSfx(item));
    this.showMessage(this.story.log('equip', { hero: this.story.heroName(hero), item: this.story.itemName(item) }));
    this.inventory?.select(-1);
    this.inventory?.redraw();
    return true;
  }

  showMessage(text: string): void {
    if (!text) return;
    this.lastMessage = text;
    this.hooks?.pushLog(text);
  }

  noteHero(id: HudHeroId, hp: number, downed: boolean): void {
    const prev = this.lastHp[id] ?? { hp, downed: false };
    if (downed && !prev.downed) this.audio.playHeroDown(id);
    else if (hp < prev.hp) this.audio.playHeroHurt(id, performance.now() / 1000);
    this.lastHp[id] = { hp, downed };
  }

  update(now: number, gridX: number, gridY: number, dir: number): void {
    this.audio.updateListener(gridX, gridY, dir);
    this.audio.update(now, gridX * CELL, gridY * CELL);
    if (this.phase === 'play') this.flushBarks(now);
  }

  storyLog(key: string, vars?: Record<string, string | number>): string {
    return this.story.log(key, vars);
  }

  private async mountInventory(): Promise<void> {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('inventory-screen');
    if (!host) return;
    try {
      const layout = await loadLayout585();
      this.inventory = new InventoryUi(this.story, this.bag, layout.inventoryScreen, {
        equipment: () => this.equipmentState(),
        onUse: (index) => this.useBagSlot(index),
        onEquip: (index, hero, slot) => this.equipBagSlot(index, hero as HudHeroId, slot),
        onDrink: (index, hero) => this.drinkBagSlot(index, hero as HudHeroId),
        onClose: () => this.closeBag(),
        playUi: (name) => this.audio.playUi(name)
      });
      await this.inventory.load();
    } catch (err) {
      console.warn('Inventory UI failed to load', err);
    }
  }

  private lootChest(x: number, y: number, tile: FloorTile): boolean {
    tile.chestOpen = true;
    this.hooks?.openChestAt?.(x, y);
    this.audio.playUi('chest');
    this.showMessage(this.story.log('chest_open'));
    const loot = tile.chestItems?.length ? [...tile.chestItems] : [];
    tile.chestItems = [];
    if (!loot.length) {
      this.showMessage(this.story.log('chest_empty'));
      return true;
    }
    let stored = 0;
    for (const id of loot) stored += this.bag.add(id);
    if (stored === 1) {
      this.audio.playUi('pickup');
      this.showMessage(this.story.log('chest_loot_one', { item: this.story.itemName(loot[0]) }));
    } else if (stored > 1) {
      this.audio.playUi('pickup');
      this.showMessage(this.story.log('chest_loot_all', { n: stored }));
    }
    this.inventory?.redraw();
    return true;
  }

  private useOilFlask(index: number): void {
    const oil = this.hooks?.oil() ?? 2;
    const plan = oilFlaskPlan(oil);
    if (plan.kind === 'full') {
      this.showMessage(this.story.log('oil_full'));
      this.inventory?.wiggleSlot(index);
      return;
    }
    if (!this.bag.takeAt(index, 1)) return;
    this.hooks?.setOil?.(plan.to);
    this.audio.playOilFlask({ fadeAt: plan.fadeAt, fadeSec: 0.05 });
    this.showMessage(this.story.log('oil_use', { n: plan.to, max: 4 }));
    this.inventory?.redraw();
  }

  private async loadBarkRules(base: string): Promise<void> {
    try {
      const raw = await fetchJsonCached<Partial<BarkRules>>(`${base}bark_rules.json`);
      this.director.setRules({
        flavour_gap_s: raw.flavour_gap_s ?? DEFAULT_BARK_RULES.flavour_gap_s,
        flavour_min_interval_s: raw.flavour_min_interval_s ?? DEFAULT_BARK_RULES.flavour_min_interval_s,
        min_gap_s: raw.min_gap_s ?? DEFAULT_BARK_RULES.min_gap_s
      });
    } catch {
      this.director.setRules(DEFAULT_BARK_RULES);
    }
  }

  private setTapStatus(kind: 'loading' | 'tap_to_start'): void {
    const el = tapText();
    if (el) el.textContent = this.story.uiText(kind === 'loading' ? 'status.loading' : 'tap_to_start');
  }

  private showTap(kind: 'loading' | 'tap_to_start'): void {
    this.setTapStatus(kind);
    tapEl()?.classList.remove('hidden');
  }

  private hideTap(): void {
    tapEl()?.classList.add('hidden');
  }

  private wireTap(): void {
    const tap = tapEl();
    const onTap = () => {
      this.unlock();
      const active = !!tap && !tap.classList.contains('hidden');
      if (this.phase === 'intro') {
        this.audio.crossfadeToIntro();
        return;
      }
      if (!active) return;
      if (this.flags.showTitle) {
        if (!this.title?.essentialReady) {
          this.pendingTap = true;
          tap.classList.add('feedback');
          window.setTimeout(() => tap.classList.remove('feedback'), 180);
          return;
        }
        this.consumeTitleTap();
        return;
      }
      void this.openIntro();
    };
    tap?.addEventListener('pointerdown', onTap);
    tap?.addEventListener('pointerup', onTap);
    tap?.addEventListener('click', onTap);
    tap?.addEventListener('touchstart', onTap, { passive: true });
    const intro = document.getElementById('intro-overlay');
    intro?.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('#intro-skip')) return;
        this.unlock();
        if (this.phase === 'intro') this.audio.crossfadeToIntro();
      },
      true
    );
  }

  private consumeTitleTap(): void {
    this.pendingTap = false;
    this.hideTap();
    this.unlock();
    try {
      this.audio.playMenu();
    } catch {
      // Host audio can refuse playback after the overlay is already gone.
    }
    this.phase = 'title';
    this.title?.show('title');
  }

  private handleTitleAction(action: TitleAction): void {
    if (action.type === 'toast' || action.type === 'language') {
      this.audio.playUi('ui_button_denied');
      if (action.type === 'toast') this.showTitleToast(action.text);
      else void this.setLocale(action.locale);
      return;
    }
    this.audio.playUi('ui_button');
    if (action.type === 'new_game') {
      this.title?.hide();
      this.audio.markPlayStarted();
      void this.openIntro();
      return;
    }
    if (action.type === 'continue' || action.type === 'load' || action.type === 'open_load' || action.type === 'save') {
      this.showTitleToast(this.story.uiText('status.no_saves'));
    }
  }

  private showTitleToast(text: string): void {
    const el = document.getElementById('title-toast');
    if (!el) {
      this.hooks?.pushLog(text);
      return;
    }
    el.textContent = text;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 1600);
  }

  private async setLocale(locale: Locale): Promise<void> {
    await this.story.load(locale);
    document.documentElement.lang = locale;
    if (this.title) this.title.story = this.story;
    this.intro?.applyLocale();
    this.introSkip?.refresh();
    await this.title?.ensureLogo();
    this.title?.refreshHint();
    this.title?.layoutButtons();
    this.setTapStatus(this.phase === 'tap' ? 'tap_to_start' : 'loading');
  }

  private async openIntro(): Promise<void> {
    if (this.phase === 'intro' || this.phase === 'play') return;
    this.hideTap();
    const overlay = document.getElementById('intro-overlay');
    if (!overlay || !this.intro) {
      this.beginPlay();
      return;
    }
    this.phase = 'intro';
    this.intro.preloadShot1();
    await this.intro.whenShot1();
    this.intro.setNeedShot((waiting) => {
      if (this.phase !== 'intro') return;
      if (waiting) this.showTap('loading');
      else this.hideTap();
    });
    overlay.classList.add('show');
    this.introSkip?.refresh();
    this.introSkip?.show();
    this.intro.start();
    if (this.audioUnlocked) this.audio.crossfadeToIntro();
  }

  private beginPlay(): void {
    if (this.playStarted) return;
    this.playStarted = true;
    this.phase = 'play';
    this.hideTap();
    if (typeof document !== 'undefined') document.getElementById('intro-overlay')?.classList.remove('show');
    this.introSkip?.hide();
    this.title?.hide();
    this.unlock();
    this.progress.startNewGame();
    this.director.reset();
    this.audio.markPlayStarted();
    this.audio.armFirstFightCap();
    void this.audio.startPlayStreaming();
    this.audio.crossfadeToAct1();
    if (this.progress.fire('enter_floor1')) this.pushStoryLog('enter_floor1');
    this.progress.fire('f1_start');
    this.startFloorAudio();
  }

  private startFloorAudio(): void {
    const scene = this.scene;
    const oil = (this.hooks?.oil() ?? 2) > 0;
    try {
      if (scene) {
        this.audio.attachWaterPools(scene, rawFloor1 as FloorData);
        for (const sconce of floor1Sconces) {
          if (sconce.lit && !sconce.capped) this.audio.startTorchLoop(sconce);
        }
      }
      this.audio.startFloorLoops(oil);
    } catch (err) {
      console.warn('Audio init failed', err);
      this.audio.startLanternLoop(oil);
    }
  }

  private pushStoryLog(key: string): void {
    const text = this.story.log(key);
    if (!text) return;
    this.lastMessage = text;
    this.hooks?.pushLog(text);
    if (!this.story.logIsSilent(key)) this.audio.playUi('ui_log_line');
  }

  private fireTileBark(x: number, y: number): void {
    const bark = tileAt(floor1Map, x, y)?.bark;
    if (!bark) return;
    const key = `bark:${bark}`;
    if (this.firedCells.has(key) || !this.progress.fire(bark)) return;
    if (this.speakBark(bark)) this.firedCells.add(key);
  }

  private flushBarks(nowMs: number): void {
    const picked = this.director.flush(nowMs);
    if (picked) this.deliverBark(picked);
  }

  private deliverBark(picked: BarkLine): boolean {
    const speaker = asHeroId(picked.speaker);
    const name = this.story.speakerName(picked.speaker);
    const line = `${name}: ${picked.text}`;
    this.lastBark = picked;
    this.hooks?.pushLog(line);
    this.hooks?.setSpeaking(speaker);
    if (this.speakTimer) clearTimeout(this.speakTimer);
    this.speakTimer = setTimeout(() => this.hooks?.setSpeaking(null), barkDurationMs(picked));
    void this.bubble?.load().then(() => this.bubble?.show(picked.text, speaker, name));
    this.audio.playBarkVoice(picked.speaker);
    return true;
  }
}
