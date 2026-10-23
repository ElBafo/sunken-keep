import type { Scene } from 'three';
import type { CombatEvent, HeroId, HandSlot } from '../core/types';
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
  isSilentLogKey,
  journalIntroKey,
  journalTriggerId,
  NOTE_SCROLL_SFX,
  pickupSfx,
  preferredHand,
  normalizeItemId
} from '../proto3d/items';
import { loadLayout585 } from '../proto3d/layout585';
import { NoteReader } from '../proto3d/note-reader';
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
import {
  FLOOR_NUMBER,
  SAVE_VERSION,
  applyFloorTiles,
  applySconces,
  floorState,
  loadFloorSnapshot,
  loadSlot,
  newestAutosave,
  snapshotCurrentFloor,
  writeAutosave,
  writeFloorSnapshot,
  writeSlot,
  type SaveKind,
  type SavePayload,
  type SavedHero,
  type SavedMonster
} from './saves';

export type GameplayPhase = 'boot' | 'tap' | 'title' | 'intro' | 'play';

export type GameplayFlags = {
  /** `?test=1` without `?title=1` — skip tap/title/intro so existing floor tests stay playable. */
  skipChrome: boolean;
  /** Title after the first tap (Classic). `?test=1` hides it unless `?title=1`. */
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
  monsterAt?: (x: number, y: number) => { kind: string } | undefined;
  usePotion?: (hero: HudHeroId, kind: 'red' | 'blue' | 'green') => CombatEvent[] | undefined;
  position?: () => { x: number; y: number; dir: number };
  setPosition?: (x: number, y: number, dir: number) => void;
  snapshotParty?: () => SavedHero[];
  applyParty?: (party: SavedHero[]) => void;
  snapshotMonsters?: () => SavedMonster[];
  restoreMonsters?: (list: SavedMonster[]) => void | Promise<void>;
  restoreVisuals?: () => void;
  combatBusy?: () => { fight: boolean; gameOver: boolean; near: number; lowHp: boolean };
  frostHintDismissed?: () => boolean;
  setFrostHintDismissed?: (on: boolean) => void;
  closeOverlays?: () => void;
  clearLog?: () => void;
  syncHud?: () => void;
};

export { DOOR_LOCKED_MESSAGE };

export function parseGameplayFlags(search: string): GameplayFlags {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const test = q.get('test') === '1';
  const title = q.get('title') === '1';
  return {
    skipChrome: test && !title,
    showTitle: !test || title
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
  noteReader: NoteReader | null = null;
  noteOpen = false;
  gameOver = false;
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
  private journalPages = new Set<string>();
  private dialogue = new Map<string, string>();
  private floorStates: Record<string, SavePayload['floors'][string]> = {};
  private playAccMs = 0;
  private playStartedAt = 0;
  private pendingStartSnapshot = false;
  private visibilityWired = false;
  currentSlot = 0;

  constructor(search: string, quality: QualityLevel) {
    this.flags = parseGameplayFlags(search);
    this.audio = new AudioManager(protoAudioQuality(quality));
  }

  allowsInput(): boolean {
    return this.phase === 'play' && !this.noteOpen && !this.gameOver && !this.titleVisible();
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
      this.noteReader = new NoteReader(() => this.hideNote());
      await Promise.all([this.mountInventory(), this.noteReader.load()]);
    }
    const scene = this.scene;
    if (scene) void this.audio.loadBeforePlaySounds(scene);
    void this.audio.loadIntroMusic();
    void this.title?.loadEssential();
    this.wireVisibilityAutosave();
    this.wireGameOver();
    this.applyStoryLabels();
    if (this.flags.skipChrome) {
      this.hideTap();
      this.beginPlay();
      return;
    }
    this.phase = 'tap';
    this.showTap('tap_to_start');
    if (this.pendingTap) this.consumeTitleTap();
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
    this.fireTileStepUi(x, y);
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
    const guard = this.hooks?.monsterAt?.(x, y);
    if (guard && (tile.item || (tile.chest && !tile.chestOpen))) {
      this.showMessage(this.story.log('item_guarded', { monster: this.story.monsterName(guard.kind) }));
      this.audio.playUi('item_use_fail');
      return true;
    }
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
    if (isReadable(id)) this.readBagSlot(this.bag.slots.length - 1);
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
      this.readBagSlot(index);
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
    const kind =
      slot.item === 'potion_red' ? 'red' : slot.item === 'potion_blue' ? 'blue' : slot.item === 'potion_green' ? 'green' : null;
    if (!kind) return;
    const events = this.hooks?.usePotion?.(hero, kind);
    if (!events) {
      this.audio.playUi('item_use_fail');
      return;
    }
    const failed = events.some((e) => e.type === 'log' && (e.key === 'full_health' || e.key === 'no_mana_pool'));
    if (failed || !this.bag.takeAt(index, 1)) {
      this.audio.playUi('item_use_fail');
      if (this.inventory) this.inventory.pickHero = null;
      this.inventory?.redraw();
      return;
    }
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

  showNote(title: string, text: string): void {
    this.lastMessage = text;
    const titleEl = document.getElementById('note-title');
    const textEl = document.getElementById('note-text');
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    this.noteReader?.show(title, text);
    document.getElementById('note-overlay')?.classList.add('show');
    this.noteOpen = true;
    this.audio.playUi(NOTE_SCROLL_SFX);
  }

  hideNote(): boolean {
    const wasOpen = this.noteOpen;
    this.noteReader?.hide();
    document.getElementById('note-overlay')?.classList.remove('show');
    this.noteOpen = false;
    return wasOpen;
  }

  showGameOver(): void {
    this.gameOver = true;
    try {
      this.audio.stopFloorLoops();
      this.audio.stopWindup();
      this.audio.playUi('game_over');
    } catch {
      // Audio may still be unlocking.
    }
    this.refreshGameOverButtons();
    document.getElementById('gameover')?.classList.add('show');
  }

  gameOverVisible(): boolean {
    return !!document.getElementById('gameover')?.classList.contains('show');
  }

  private readBagSlot(index: number): void {
    const slot = this.bag.slots[index];
    if (!slot || !isReadable(slot.item)) return;
    const doc = this.story.readableItem(slot.item, slot.journalPage);
    if (!doc) return;
    if (doc.kind === 'journal') {
      const page = slot.journalPage && slot.journalPage > 0 ? slot.journalPage : 1;
      const introKey = journalIntroKey(page);
      const trigger = journalTriggerId(page);
      if (this.progress.fire(introKey)) this.pushStoryLog(introKey);
      else this.showMessage(this.story.log(introKey));
      this.progress.fire(trigger);
      this.journalPages.add(introKey);
      this.journalPages.add(trigger);
    }
    this.showNote(doc.title, doc.text);
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
    if (action.type === 'open_load') {
      void this.openLoadSlots();
      return;
    }
    if (action.type === 'continue' || action.type === 'load') {
      this.title?.hide();
      this.audio.markPlayStarted();
      this.runContinue(action.payload);
      return;
    }
    if (action.type === 'save') this.commitSlot(action.slot);
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
    this.applyStoryLabels();
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

  private beginPlay(from?: SavePayload): void {
    if (this.playStarted && !from) return;
    const first = !this.playStarted;
    this.playStarted = true;
    this.phase = 'play';
    this.gameOver = false;
    this.hideTap();
    if (typeof document !== 'undefined') {
      document.getElementById('intro-overlay')?.classList.remove('show');
      document.getElementById('gameover')?.classList.remove('show');
    }
    this.introSkip?.hide();
    this.title?.hide();
    this.unlock();
    if (from) {
      this.applySave(from);
    } else {
      this.progress.startNewGame();
      this.director.reset();
      this.journalPages.clear();
      this.dialogue.clear();
      this.floorStates = {};
      this.playAccMs = 0;
      this.playStartedAt = performance.now();
      this.pendingStartSnapshot = true;
      if (this.progress.fire('enter_floor1')) this.pushStoryLog('enter_floor1');
      this.progress.fire('f1_start');
      if (this.pendingStartSnapshot) {
        this.takeFloorSnapshot();
        this.pendingStartSnapshot = false;
      }
    }
    if (first) {
      this.audio.markPlayStarted();
      this.audio.armFirstFightCap();
      void this.audio.startPlayStreaming();
      this.audio.crossfadeToAct1();
      this.startFloorAudio();
    }
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

  private rebuildAudioFromState(): void {
    try {
      this.audio.stopPresenceLoops();
      this.audio.rebuildFloorLoops({
        oil: this.hooks?.oil() ?? 2,
        sconces: floor1Sconces,
        leeches: (this.hooks?.snapshotMonsters?.() ?? []).map((m) => ({
          kind: m.kind,
          x: m.x,
          y: m.y,
          alive: m.alive
        })),
        carriedTorch: false
      });
    } catch {
      this.startFloorAudio();
    }
  }

  private applyStoryLabels(): void {
    const door = document.getElementById('btn-door');
    if (door && !door.textContent) door.textContent = this.story.uiText('controls.door');
    const save = document.getElementById('btn-save');
    if (save) save.textContent = this.story.uiText('buttons.save') || 'Save';
    const load = document.getElementById('btn-load');
    if (load) load.textContent = this.story.titleText('buttons.load') || 'Load';
    this.refreshGameOverButtons();
    this.introSkip?.refresh();
  }

  private refreshGameOverButtons(): void {
    const title = document.getElementById('gameover-title');
    const body = document.getElementById('gameover-body');
    const goSave = document.getElementById('btn-go-autosave');
    const goFloor = document.getElementById('btn-go-floor');
    if (title) title.textContent = this.story.uiText('game_over.title');
    if (body) body.textContent = this.story.uiText('game_over.body');
    if (goSave) {
      goSave.textContent = this.story.uiText('game_over.load_last');
      goSave.hidden = !newestAutosave();
    }
    if (goFloor) goFloor.textContent = this.story.uiText('game_over.load_floor', { n: FLOOR_NUMBER });
  }

  private wireGameOver(): void {
    if (typeof document === 'undefined') return;
    const save = document.getElementById('btn-go-autosave');
    const floor = document.getElementById('btn-go-floor');
    if (save && !save.dataset.bound) {
      save.dataset.bound = '1';
      save.addEventListener('click', () => this.loadAutosave());
    }
    if (floor && !floor.dataset.bound) {
      floor.dataset.bound = '1';
      floor.addEventListener('click', () => this.restartFloor());
    }
  }

  private wireVisibilityAutosave(): void {
    if (this.visibilityWired || typeof document === 'undefined') return;
    this.visibilityWired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.tryAutosave('quiet');
    });
    window.addEventListener('pagehide', () => this.tryAutosave('quiet'));
  }

  private playTimeMs(): number {
    if (!this.playStartedAt) return this.playAccMs;
    return this.playAccMs + Math.max(0, performance.now() - this.playStartedAt);
  }

  captureSave(kind: SaveKind = 'slot'): SavePayload {
    const pos = this.hooks?.position?.() ?? { x: floor1Map.startX, y: floor1Map.startY, dir: floor1Map.startDir };
    this.floorStates[String(FLOOR_NUMBER)] = snapshotCurrentFloor(floor1Map, this.hooks?.snapshotMonsters?.() ?? []);
    const story = this.progress.serialize();
    const flags = new Set(this.storyFlags);
    if (this.hooks?.frostHintDismissed?.()) flags.add('frost_hint_dismissed');
    for (const key of this.firedCells) flags.add(key);
    return {
      version: SAVE_VERSION,
      kind,
      timestamp: Date.now(),
      playTimeMs: this.playTimeMs(),
      locale: this.story.locale,
      floor: FLOOR_NUMBER,
      position: { ...pos },
      oil: this.hooks?.oil() ?? 2,
      party: this.hooks?.snapshotParty?.() ?? [],
      bag: this.bag.serialize(),
      floors: { ...this.floorStates },
      flags: [...flags],
      firedOnce: story.fired,
      goals: story.goals,
      journalPages: [...this.journalPages],
      dialogue: Object.fromEntries(this.dialogue),
      escapeRunActive: false,
      leader: 'brannoc'
    };
  }

  applySave(save: SavePayload): void {
    try {
      this.audio.fadeGameOver(300);
    } catch {
      // Audio may still be unlocking.
    }
    this.director.clearQueue();
    this.bubble?.hide();
    document.getElementById('gameover')?.classList.remove('show');
    this.gameOver = false;
    this.hooks?.clearLog?.();
    this.lastMessage = '';
    this.storyFlags = new Set(save.flags ?? []);
    this.firedCells = new Set([...this.storyFlags].filter((id) => id.startsWith('bark:')));
    this.progress.restore({ fired: save.firedOnce, goals: save.goals });
    this.playAccMs = save.playTimeMs ?? 0;
    this.playStartedAt = performance.now();
    this.hooks?.setOil?.(save.oil);
    this.bag.load(save.bag ?? []);
    this.floorStates = { ...(save.floors ?? {}) };
    this.journalPages = new Set(save.journalPages ?? []);
    this.dialogue = new Map(Object.entries(save.dialogue ?? {}));
    const floor = floorState(save) ?? this.floorStates[String(save.floor)];
    applyFloorTiles(floor1Map, floor?.tiles);
    applySconces(floor?.sconces);
    this.hooks?.applyParty?.(save.party ?? []);
    void this.hooks?.restoreMonsters?.(floor?.monsters ?? []);
    this.hooks?.setFrostHintDismissed?.(this.storyFlags.has('frost_hint_dismissed'));
    this.hooks?.setPosition?.(save.position.x, save.position.y, save.position.dir);
    this.hooks?.restoreVisuals?.();
    this.hooks?.closeOverlays?.();
    this.closeBag();
    this.hideNote();
    this.inventory?.redraw();
    this.hooks?.syncHud?.();
    this.refreshGameOverButtons();
    this.rebuildAudioFromState();
    this.phase = 'play';
    this.playStarted = true;
  }

  canAutosave(): boolean {
    if (this.phase !== 'play') return false;
    const busy = this.hooks?.combatBusy?.();
    if (this.gameOver || busy?.gameOver) return false;
    if (busy?.fight) return false;
    if (busy && busy.near <= 2) return false;
    if (busy?.lowHp) return false;
    return true;
  }

  tryAutosave(_reason = 'auto'): boolean {
    if (!this.canAutosave()) return false;
    return writeAutosave(this.captureSave('autosave'));
  }

  takeFloorSnapshot(): void {
    writeFloorSnapshot(this.captureSave('floor'));
  }

  saveBlockedReason(): string | null {
    if (this.hooks?.combatBusy?.().fight) return 'combat';
    return null;
  }

  requestManualSave(): void {
    const blocked = this.saveBlockedReason();
    if (blocked) {
      this.showMessage(this.story.titleText('save_blocked'));
      this.audio.playUi('ui_button_denied');
      return;
    }
    void this.openSaveSlots();
  }

  requestManualLoad(): void {
    void this.openLoadSlots();
  }

  private async openSaveSlots(): Promise<void> {
    if (!this.title) return;
    this.hooks?.closeOverlays?.();
    await this.title.loadEssential();
    await this.title.loadRest();
    this.title.prepareSave(this.captureSave('slot'));
    this.title.show('save');
  }

  private async openLoadSlots(): Promise<void> {
    if (!this.title) return;
    this.hooks?.closeOverlays?.();
    await this.title.loadEssential();
    await this.title.loadRest();
    this.title.show('load');
  }

  private runContinue(payload: SavePayload): void {
    if (this.playStarted) this.applySave(payload);
    else this.beginPlay(payload);
  }

  commitSlot(slot: number): boolean {
    const payload = this.captureSave('slot');
    if (writeSlot(slot, payload)) {
      this.currentSlot = slot;
      this.showMessage(this.story.titleText('saved'));
      this.audio.playUi('save');
      this.title?.hide();
      return true;
    }
    this.showMessage(this.story.uiText('status.save_failed'));
    return false;
  }

  loadFromSlot(slot: number): boolean {
    const data = loadSlot(slot);
    if (!data || data === 'corrupt') return false;
    this.runContinue(data);
    this.title?.hide();
    return true;
  }

  loadAutosave(): void {
    try {
      this.audio.fadeGameOver(300);
    } catch {
      // Audio may still be unlocking.
    }
    const save = newestAutosave();
    if (save) this.applySave(save);
    else this.restartFloor();
  }

  restartFloor(): void {
    try {
      this.audio.fadeGameOver(300);
    } catch {
      // Audio may still be unlocking.
    }
    const snap = loadFloorSnapshot(FLOOR_NUMBER);
    if (snap) {
      this.applySave(snap);
      return;
    }
    if (typeof location !== 'undefined') location.reload();
  }

  private pushStoryLog(key: string): void {
    const text = this.story.log(key);
    if (!text) return;
    this.lastMessage = text;
    this.hooks?.pushLog(text);
    if (!this.story.logIsSilent(key) && !isSilentLogKey(key)) this.audio.playUi('ui_log_line');
  }

  private fireTileBark(x: number, y: number): void {
    const bark = tileAt(floor1Map, x, y)?.bark;
    if (!bark) return;
    const key = `bark:${bark}`;
    if (this.firedCells.has(key) || !this.progress.fire(bark)) return;
    if (this.speakBark(bark)) {
      this.firedCells.add(key);
      this.storyFlags.add(key);
    }
  }

  /** Full `ui_text` line every visit. Voxel wraps it; never the `_short` sibling. */
  fireTileStepUi(x: number, y: number): void {
    const tile = tileAt(floor1Map, x, y);
    const path = typeof tile?.stepUi === 'string' ? tile.stepUi : '';
    if (!path) return;
    const toast = this.story.uiText(path);
    if (!toast) return;
    this.showMessage(toast);
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
