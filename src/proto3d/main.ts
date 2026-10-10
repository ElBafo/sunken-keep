import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
import { AudioManager } from './audio';
import {
  BRIGHT_MAX,
  BRIGHT_MIN,
  CELL_SIZE,
  DOOR_UNLOCK_LEAD_MS,
  HERO_VOICES,
  OIL_FLASK,
  OIL_MAX,
  OIL_START,
  OIL_TORCH_COST,
  parseAmbientFloor,
  STEP_VOLUME,
  SWAP_ARM_MS,
  TORCH_IGNITE_FLARE_MS
} from './constants';
import { CombatEngine, HERO_IDS, openGrid, parseRules, Rng, type CombatEvent } from '../core';
import { Dressing } from './dressing';
import { floor1, floor1Sconces } from './floor-data';
import { InputManager } from './input';
import { MoveResult, Player } from './player';
import { loadProgress, persistEnabled, saveProgress } from './progress';
import {
  hasAnySave,
  listAutosaves,
  loadFloorSnapshot,
  newestAutosave,
  persistStorage,
  SAVE_VERSION,
  snapshotHero,
  snapshotMonster,
  loadSlot,
  writeAutosave,
  writeFloorSnapshot,
  writeSlot,
  floorState,
  type SavePayload,
  type SavedFloor
} from './saves';
import { TitleScreen } from './title';
import { IntroPlayer } from './intro';
import { SpeechBubble } from './bubble';
import { StoryProgress } from './story-progress';
import { saveLocale, type Locale } from './i18n';
import { qualityFromSearch, QualityLevel } from './quality';
import { PixelRenderer } from './renderer';
import { SceneBuilder } from './scene-builder';
import { SpriteManager } from './sprites';
import { TorchSystem, torchWorldPos } from './torches';
import { Sconce, Tile } from './types';
import { VertexLightingManager } from './vertex-lighting';
import { WaterSystem } from './water';
import { DarkFx } from './dark-fx';
import { isFloorProp, PropBuilder } from './props';
import { resolveLocale, StoryText } from './i18n';
import { loadLayout585 } from './layout585';
import { PartyHud, type GearId, type HandSlot } from './party-hud';
import type { HeroId } from '../constants';
import { PartyBag } from './bag';
import { InventoryUi } from './inventory-ui';
import { canEquip, equipSfx, pickupSfx, preferredHand } from './items';

const FLOOR_NUMBER = 1;
const FLOOR_SCONCE_DEFAULTS = floor1Sconces.map((s) => ({ ...s }));

class Game {
  renderer!: PixelRenderer;
  sceneBuilder!: SceneBuilder;
  player!: Player;
  inputManager!: InputManager;
  spriteManager!: SpriteManager;
  vertexLighting!: VertexLightingManager;
  audioManager!: AudioManager;
  atmosphere!: Atmosphere;
  dressing!: Dressing;
  water!: WaterSystem;
  torches!: TorchSystem;
  darkFx!: DarkFx;
  props!: PropBuilder;
  quality: QualityLevel = 'high';
  bright = 1;
  oil = OIL_START;
  persist = true;
  story = new StoryText();
  hud!: PartyHud;
  combat!: CombatEngine;
  private perkHooks: Array<{ hero: string; level: number }> = [];
  private perkScreenOpen = false;
  private torchChoice: { sconce: Sconce } | null = null;
  private swapSconce: Sconce | null = null;
  private swapUntil = 0;
  private swapTimer: ReturnType<typeof setTimeout> | null = null;
  bag = new PartyBag();
  inventory!: InventoryUi;
  private pendingPotion: 'potion_red' | 'potion_blue' | 'potion_green' | null = null;
  private lootSnap: Array<{ x: number; y: number; item?: string; chest?: boolean; chestItems?: string[]; chestOpen?: boolean }> = [];
  lastMessage = '';
  lastHitType: string | null = null;
  lastFlank: 'left' | 'right' | 'behind' | null = null;
  private flankTimer: ReturnType<typeof setTimeout> | null = null;
  lampNote = { title: '', text: '' };
  noteOpen = false;
  interactCount = 0;
  messageTimer = 0;

  lastTime = 0;
  fpsCounter: HTMLElement | null = null;
  fpsFrames = 0;
  fpsLastTime = 0;
  lastFps = 0;
  private doorUnlockTimer = 0;
  private pendingUnlock: { x: number; y: number } | null = null;
  private flags = new Set<string>();
  private journalPages = new Set<string>();
  private dialogue = new Map<string, string>();
  private floorStates: Record<string, SavedFloor> = {};
  private storyProgress = new StoryProgress();
  private playStartedAt = 0;
  private playAccMs = 0;
  private escapeRunActive = false;
  private phase: 'title' | 'intro' | 'play' = 'play';
  private skipTitle = false;
  private title!: TitleScreen;
  private intro: IntroPlayer | null = null;
  private bubble: SpeechBubble | null = null;
  private loopStarted = false;
  currentSlot: number | null = null;
  private tileSnap: Array<{
    x: number;
    y: number;
    doorOpen?: boolean;
    doorLocked?: boolean;
    secretOpen?: boolean;
    item?: string;
    chest?: boolean;
    chestItems?: string[];
    chestOpen?: boolean;
  }> = [];

  async init() {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    const params = new URLSearchParams(window.location.search);
    this.quality = qualityFromSearch(params);
    this.persist = persistEnabled();
    const brightParam = params.get('bright');
    if (brightParam != null && brightParam !== '') {
      const brightRaw = Number(brightParam);
      if (Number.isFinite(brightRaw)) {
        this.bright = Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, brightRaw));
      }
    }
    this.oil = loadProgress(floor1Sconces, this.persist && params.get('test') === '1');
    persistStorage();
    this.skipTitle = params.get('test') === '1' && params.get('title') !== '1';

    const locale = resolveLocale(params, this.persist);
    document.documentElement.lang = locale;
    await this.story.load(locale);
    await this.storyProgress.load(import.meta.env.BASE_URL);
    if (this.skipTitle) this.storyProgress.startNewGame();
    this.applyStoryLabels();

    const layout = await loadLayout585();
    this.renderer = new PixelRenderer(canvas, layout.view[2], layout.view[3]);
    await this.renderer.loadPalette();
    if (params.get('palette') === '0') this.renderer.setPaletteEnabled(false);
    if (params.get('debug') === '1') {
      const el = document.createElement('div');
      el.id = 'fps-counter';
      el.textContent = 'FPS: --';
      el.style.display = 'block';
      document.body.appendChild(el);
      this.fpsCounter = el;
    }

    this.atmosphere = new Atmosphere(this.quality);
    this.atmosphere.applyFog(this.renderer.scene, this.renderer.renderer);

    this.sceneBuilder = new SceneBuilder();
    await this.sceneBuilder.loadTextures();
    this.sceneBuilder.buildScene(this.renderer.scene, floor1);

    this.dressing = new Dressing();
    this.water = new WaterSystem();
    this.props = new PropBuilder();
    await Promise.all([this.dressing.load(), this.water.load(), this.props.load()]);
    await this.dressing.place(this.renderer.scene, floor1);
    this.props.place(this.renderer.scene, floor1);

    this.atmosphere.build(this.renderer.scene, floor1, this.dressing);
    this.water.build(this.renderer.scene, floor1, floor1Sconces, this.dressing.marks.sunbeams);

    this.player = new Player(this.renderer.camera, floor1);
    const startX = params.has('x') ? Number(params.get('x')) : floor1.startX;
    const startY = params.has('y') ? Number(params.get('y')) : floor1.startY;
    const startDir = params.has('dir') ? Number(params.get('dir')) : floor1.startDir;
    if (Number.isFinite(startX) && Number.isFinite(startY) && Number.isFinite(startDir)) {
      this.player.setPosition(startX, startY, startDir);
    }

    this.vertexLighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: parseAmbientFloor(params.get('ambientFloor'), 1),
      bright: this.bright,
      sunbeams: this.dressing.marks.sunbeams,
      oil: () => this.oil
    });
    this.vertexLighting.setPartyPosition(this.player.x, this.player.y);

    this.torches = new TorchSystem(this.renderer.camera);
    await this.torches.load(this.renderer.scene, floor1Sconces);
    this.torches.setParty(this.player.x, this.player.y, this.player.dir);

    this.vertexLighting.registerScene(this.renderer.scene);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);

    this.spriteManager = new SpriteManager(this.renderer.camera);
    await this.spriteManager.loadSprites(this.renderer.scene, floor1);
    this.darkFx = new DarkFx();
    await this.darkFx.load(this.renderer.scene, floor1, this.spriteManager);
    this.hud = new PartyHud(this.story, () => this.oil, layout, {
      onUse: (hero, hand) => this.handleHandTap(hero, hand),
      onLog: () => this.audioManager?.playUi('ui_log_line'),
      playUi: (name) => this.audioManager?.playUi(name),
      onCancel: () => {
        this.cancelSwap();
        this.hideTorchChoice();
      },
      onPortrait: (hero) => this.handlePortraitTap(hero),
      onBag: () => this.toggleBag(),
      onSave: () => this.requestManualSave(),
      onPotion: (kind) => this.quickPotion(kind),
      potionCounts: () => ({
        health: this.bag.countOf('potion_red'),
        mana: this.bag.countOf('potion_blue')
      })
    });
    await this.initCombat(params);
    this.loadLampNote();
    this.updateOilHud();
    await this.hud.load();
    this.syncPartyHud();
    this.inventory = new InventoryUi(this.story, this.bag, layout.inventoryScreen, {
      equipment: () => this.equipmentState(),
      onUse: (index) => this.useBagSlot(index),
      onEquip: (index, hero, slot) => this.equipBagSlot(index, hero, slot),
      onDrink: (index, hero) => this.drinkBagSlot(index, hero),
      onClose: () => this.closeBag(),
      playUi: (name) => this.audioManager?.playUi(name)
    });
    await this.inventory.load();
    this.snapshotLoot();
    this.snapshotTiles();
    this.wireTorchChoice();
    this.wireGameOver();
    this.wireInventoryControls();
    this.wireVisibilityAutosave();
    this.renderer.resize();

    this.audioManager = new AudioManager(this.quality);
    this.audioManager.attach(this.renderer.scene);
    this.audioManager.updateListener(this.player.x, this.player.y, this.player.dir);
    await this.audioManager.init();
    this.atmosphere.setSplashHandler((x, y, z) => this.audioManager.playDrip(x, y, z));

    this.inputManager = new InputManager(this.player, {
      onMove: (result) => {
        if (this.inventory?.open) this.closeBag();
        this.cancelSwap();
        this.hideTorchChoice();
        this.handleMove(result);
      },
      onInteract: (x, y) => this.interact(x, y)
    });

    await this.wireTitleAndIntro();
    this.setupTapToStart();
    this.exposeDebugApi();
    this.updateDoorButton();
  }

  handleMove(result: MoveResult) {
    if (this.phase !== 'play') return;
    this.cancelSwap();
    if (this.combat?.gameOver) return;
    if (result === 'ok') {
      this.playFootstep(this.player.moveToX, this.player.moveToY);
      this.maybeDunkTorch(this.player.moveToX, this.player.moveToY);
      this.fireTileBark(this.player.moveToX, this.player.moveToY);
      return;
    }
    if (result === 'secret') {
      const { x, y } = this.player.facingPos(1);
      if (this.openSecretAt(x, y)) return;
    }
    if (result === 'busy') return;
    if (result === 'monster') {
      const { x, y } = this.player.facingPos(1);
      this.applyEvents(this.combat.bump(x, y, this.nowSec()));
    }
    this.audioManager.playUi('bump');
  }

  playFootstep(x: number, y: number) {
    const tile = this.player.tileAt(x, y);
    if (!tile) return;
    if (tile.deepWater) {
      this.audioManager.playStep('step_water_deep');
      this.atmosphere.spawnStepSplash(x * CELL_SIZE, y * CELL_SIZE);
      if (this.storyProgress.fire('water_deep')) this.showMessage(this.storyLog('water_deep'));
    } else if (tile.shallowWater) {
      this.audioManager.playStep('step_water_shallow');
      this.atmosphere.spawnStepSplash(x * CELL_SIZE, y * CELL_SIZE);
      if (this.storyProgress.fire('water_shallow')) this.showMessage(this.storyLog('water_shallow'));
    } else {
      this.audioManager.playStep('step');
    }
  }

  doorAhead(): { x: number; y: number } | null {
    const { x, y } = this.player.facingPos(1);
    const tile = this.player.tileAt(x, y);
    if (tile?.door) return { x, y };
    return null;
  }

  updateDoorButton() {
    const btn = document.getElementById('btn-door');
    if (!btn) return;
    btn.classList.toggle('visible', !!this.doorAhead());
  }

  showMessage(text: string, prompt = false) {
    if (!text) return;
    this.lastMessage = text;
    this.hud?.pushLog(text);
    if (!prompt) return;
    const el = document.getElementById('message-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    this.messageTimer = performance.now() + 1200;
  }

  private showPrompt(text: string) {
    this.showMessage(text, true);
  }

  private storyLog(key: string, vars?: Record<string, string | number>): string {
    return this.story.log(key, vars);
  }

  pickupKeyAt(x: number, y: number): boolean {
    return this.pickupItemAt(x, y);
  }

  pickupOilAt(x: number, y: number): boolean {
    return this.pickupItemAt(x, y);
  }

  private snapshotLoot() {
    this.lootSnap = [];
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        const tile = floor1.tiles[y][x];
        if (!tile.item && !tile.chest) continue;
        this.lootSnap.push({
          x,
          y,
          item: tile.item,
          chest: tile.chest,
          chestItems: tile.chestItems ? [...tile.chestItems] : undefined,
          chestOpen: tile.chestOpen
        });
      }
    }
  }

  private snapshotTiles() {
    this.tileSnap = [];
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        const tile = floor1.tiles[y][x];
        this.tileSnap.push({
          x,
          y,
          doorOpen: tile.doorOpen,
          doorLocked: tile.doorLocked,
          secretOpen: tile.secretOpen,
          item: tile.item,
          chest: tile.chest,
          chestItems: tile.chestItems ? [...tile.chestItems] : undefined,
          chestOpen: tile.chestOpen
        });
      }
    }
  }

  private restoreTiles() {
    for (const snap of this.tileSnap) {
      const tile = floor1.tiles[snap.y][snap.x];
      tile.doorOpen = snap.doorOpen;
      tile.doorLocked = snap.doorLocked;
      tile.secretOpen = snap.secretOpen;
      tile.item = snap.item;
      tile.chest = snap.chest;
      tile.chestItems = snap.chestItems ? [...snap.chestItems] : undefined;
      tile.chestOpen = snap.chestOpen;
      if (tile.door) {
        const visual = this.sceneBuilder.doors.get(snap.x, snap.y);
        if (visual) this.sceneBuilder.doors.snapOpen(visual, !!snap.doorOpen);
      }
      if (tile.secret) this.sceneBuilder.setSecretOpen(this.renderer.scene, snap.x, snap.y, !!snap.secretOpen);
    }
    this.spriteManager.resetItems(floor1);
  }

  private restoreLoot() {
    for (const snap of this.lootSnap) {
      const tile = floor1.tiles[snap.y][snap.x];
      tile.item = snap.item;
      tile.chest = snap.chest;
      tile.chestItems = snap.chestItems ? [...snap.chestItems] : undefined;
      tile.chestOpen = snap.chestOpen;
    }
    this.spriteManager.resetItems(floor1);
    this.bag.clear();
    this.player.hasKey = false;
    this.inventory?.redraw();
  }

  equipmentState(): Record<HeroId, { main: string; off: string; armour?: string }> {
    const out = {} as Record<HeroId, { main: string; off: string; armour?: string }>;
    for (const id of HERO_IDS) {
      const h = this.hud.heroes[id];
      out[id] = { main: h.equipment.main, off: h.equipment.off, armour: h.armour };
    }
    return out;
  }

  hasBagKey(): boolean {
    return this.bag.has('key') || this.bag.has('captain_key') || this.player.hasKey;
  }

  private rememberStoryKey(id: string, branch?: string) {
    if (/journal|note_lampkeeper|lampkeeper_note|read_journal/i.test(id)) this.journalPages.add(id);
    if (/^(f\d_|hobb|dialogue|dlg_)/i.test(id) || /frogcatcher|grate_tam|tam_cell|captain/i.test(id)) {
      this.dialogue.set(id, branch ?? this.dialogue.get(id) ?? 'seen');
    }
  }

  pickupItemAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile) return false;
    if (tile.chest && !tile.chestOpen) return this.lootChest(x, y, tile);
    if (!tile.item) return false;
    const id = tile.item === 'oil' ? 'oil_flask' : tile.item;
    const added = this.bag.add(id);
    if (!added) {
      this.showPrompt(this.storyLog('bag_full'));
      this.audioManager.playUi('item_use_fail');
      return true;
    }
    tile.item = undefined;
    this.spriteManager.hideItemAt(x, y);
    this.darkFx.hideItemAt(x, y);
    this.syncKeyFlag();
    this.audioManager.playUi(pickupSfx(id));
    const key = `pickup_${id}`;
    const named = this.storyLog(key);
    this.showMessage(named || this.storyLog('pickup_item', { item: this.story.itemName(id) }));
    this.inventory?.redraw();
    return true;
  }

  private lootChest(x: number, y: number, tile: Tile): boolean {
    tile.chestOpen = true;
    this.spriteManager.openChestAt(x, y);
    this.audioManager.playUi('chest');
    this.showMessage(this.storyLog('chest_open'));
    const loot = tile.chestItems?.length ? [...tile.chestItems] : [];
    tile.chestItems = [];
    if (!loot.length) {
      this.showMessage(this.storyLog('chest_empty'));
      return true;
    }
    let stored = 0;
    for (const id of loot) {
      stored += this.bag.add(id);
    }
    if (stored === 1) {
      this.audioManager.playUi('pickup');
      this.showMessage(this.storyLog('chest_loot_one', { item: this.story.itemName(loot[0]) }));
    } else if (stored > 1) {
      this.audioManager.playUi('pickup');
      this.showMessage(this.storyLog('chest_loot_all', { n: stored }));
    }
    this.syncKeyFlag();
    this.inventory?.redraw();
    return true;
  }

  private syncKeyFlag() {
    this.player.hasKey = this.bag.has('key') || this.bag.has('captain_key');
  }

  openBag() {
    if (this.inventory?.open) return;
    this.inventory.show();
  }

  closeBag() {
    if (!this.inventory?.open) return;
    this.clearPotionPick();
    this.inventory.hide();
  }

  toggleBag() {
    if (this.inventory?.open) this.closeBag();
    else this.openBag();
  }

  private clearPotionPick() {
    this.pendingPotion = null;
    this.inventory.pickHero = null;
    this.hud.setPickHero(false);
    this.inventory.redraw();
    document.getElementById('message-toast')?.classList.remove('show');
    this.messageTimer = 0;
  }

  private wireInventoryControls() {
    // Bag / potion buttons live on the party HUD (layout585 inventory + potion rects).
  }

  private handlePortraitTap(hero: HeroId) {
    if (this.pendingPotion) {
      this.drinkPendingPotion(hero);
      return;
    }
    if (this.inventory?.open && this.inventory.pickHero) {
      this.drinkPendingPotion(hero);
      return;
    }
    if (this.inventory?.open && this.inventory.selected >= 0) {
      const slot = this.bag.slots[this.inventory.selected];
      if (slot?.item === 'potion_red' || slot?.item === 'potion_blue' || slot?.item === 'potion_green') {
        this.drinkBagSlot(this.inventory.selected, hero);
        return;
      }
      if (this.inventory.equipPick) this.equipBagSlot(this.inventory.selected, hero);
    }
  }

  private drinkBagSlot(index: number, hero: HeroId) {
    const slot = this.bag.slots[index];
    if (!slot) return;
    if (slot.item !== 'potion_red' && slot.item !== 'potion_blue' && slot.item !== 'potion_green') return;
    this.pendingPotion = slot.item;
    this.drinkPendingPotion(hero);
  }

  private quickPotion(kind: 'health' | 'mana') {
    const id = kind === 'health' ? 'potion_red' : 'potion_blue';
    if (!this.bag.has(id)) {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    this.beginPotionPick(id);
  }

  private beginPotionPick(id: 'potion_red' | 'potion_blue' | 'potion_green') {
    this.pendingPotion = id;
    this.inventory.pickHero = id;
    this.hud.setPickHero(true);
    this.inventory.redraw();
    this.showPrompt(this.story.uiText('bag.who_drinks') || this.story.uiText('bag.pick_hero'));
  }

  useBagSlot(index: number) {
    const slot = this.bag.slots[index];
    if (!slot) return;
    if (slot.item === 'potion_red' || slot.item === 'potion_blue' || slot.item === 'potion_green') {
      this.beginPotionPick(slot.item);
      return;
    }
    if (slot.item === 'oil_flask' || slot.item === 'oil') {
      this.useOilFlask(index);
      return;
    }
    if (slot.item === 'key' || slot.item === 'captain_key') {
      const ahead = this.doorAhead();
      const tile = ahead ? this.player.tileAt(ahead.x, ahead.y) : null;
      if (ahead && tile?.doorLocked && !tile.doorOpen) {
        this.bag.takeAt(index, 1);
        this.syncKeyFlag();
        this.player.hasKey = true;
        this.handleDoor(ahead.x, ahead.y);
        this.inventory.redraw();
        return;
      }
      this.audioManager.playUi('item_use_fail');
      return;
    }
    this.audioManager.playUi('item_use_fail');
  }

  private useOilFlask(index: number) {
    if (this.oil >= OIL_MAX) {
      this.showPrompt(this.storyLog('oil_full'));
      this.audioManager.playUi('item_use_fail');
      return;
    }
    if (!this.bag.takeAt(index, 1)) return;
    this.setOil(this.oil + OIL_FLASK);
    this.audioManager.playUi('lantern_refill');
    this.showMessage(this.storyLog('oil_use', { n: this.oil, max: OIL_MAX }));
    this.inventory.redraw();
  }

  private drinkPendingPotion(hero: HeroId) {
    const id = this.pendingPotion ?? this.inventory.pickHero;
    if (!id) return;
    const kind = id === 'potion_red' ? 'red' : id === 'potion_blue' ? 'blue' : 'green';
    const events = this.combat.usePotion(hero, kind, this.nowSec());
    const failed = events.some(
      (e) => e.type === 'log' && (e.key === 'full_health' || e.key === 'no_mana_pool')
    );
    this.applyEvents(events);
    if (failed || !this.bag.remove(id, 1)) {
      this.audioManager.playUi('item_use_fail');
      this.clearPotionPick();
      return;
    }
    this.clearPotionPick();
    this.inventory.redraw();
  }

  equipBagSlot(index: number, hero: HeroId, slot?: 'main' | 'off' | 'armour' | 'trinket') {
    const entry = this.bag.slots[index];
    if (!entry || !canEquip(entry.item, hero)) {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    const item = entry.item;
    if (slot === 'trinket') {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    if (item === 'chain_mail' && slot && slot !== 'armour') {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    if (item !== 'chain_mail' && slot === 'armour') {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    const taken = this.bag.takeAt(index, 1);
    if (!taken) return;
    if (item === 'chain_mail') {
      const prev = this.hud.heroes[hero].armour;
      if (prev) this.bag.add(prev);
      this.hud.setArmour(hero, item);
    } else {
      const hand = slot === 'main' || slot === 'off' ? slot : preferredHand(item);
      const prev = this.hud.heroes[hero].equipment[hand];
      if (prev && prev !== 'empty_hand') this.bag.add(prev);
      this.hud.setHand(hero, hand, item as GearId);
      this.combat?.setEquipment(hero, hand, item);
    }
    this.audioManager.playUi(equipSfx(item));
    this.showMessage(
      this.storyLog('equip', { hero: this.story.heroName(hero), item: this.story.itemName(item) })
    );
    this.inventory.select(-1);
    this.inventory.redraw();
  }

  private applyStoryLabels() {
    const tap = document.getElementById('tap-to-start-text');
    if (tap) tap.textContent = this.story.uiText('tap_to_start');
    const door = document.getElementById('btn-door');
    if (door) door.textContent = this.story.uiText('controls.door');
    const goTitle = document.getElementById('gameover-title');
    if (goTitle) goTitle.textContent = this.story.uiText('game_over.title');
    const goBody = document.getElementById('gameover-body');
    if (goBody) goBody.textContent = this.story.uiText('game_over.body');
    this.refreshGameOverButtons();
  }

  private refreshGameOverButtons() {
    const goSave = document.getElementById('btn-go-autosave');
    if (goSave) {
      goSave.textContent = this.story.uiText('game_over.load_last');
      goSave.hidden = !newestAutosave();
    }
    const goFloor = document.getElementById('btn-go-floor');
    if (goFloor) goFloor.textContent = this.story.uiText('game_over.load_floor', { n: FLOOR_NUMBER });
  }

  private nowSec() {
    return performance.now() / 1000;
  }

  private async initCombat(params: URLSearchParams) {
    const base = import.meta.env.BASE_URL;
    const [actions, monsters] = await Promise.all([
      fetch(`${base}levels/actions.json`).then((r) => r.json()),
      fetch(`${base}levels/monsters.json`).then((r) => r.json())
    ]);
    const seedRaw = params.get('seed');
    const seed = seedRaw != null && seedRaw !== '' && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : Date.now() >>> 0;
    this.combat = new CombatEngine(parseRules(actions, monsters), new Rng(seed));
    const testMode = params.get('test') === '1';
    const combatOn = params.get('combat') === '1';
    this.combat.setChaseEnabled(!testMode || combatOn);
    this.combat.setOccupancy(
      openGrid(
        (x, y) => {
          const tile = floor1.tiles[y]?.[x];
          if (!tile || tile.wall) return true;
          if (tile.secret && !tile.secretOpen) return true;
          if (tile.door && !tile.doorOpen) return true;
          if (isFloorProp(tile)) return true;
          return false;
        },
        floor1.width,
        floor1.height,
        (x, y) => {
          const tile = floor1.tiles[y]?.[x];
          return !!(tile?.deepWater || tile?.shallowWater);
        }
      )
    );
    this.player.isOccupiedByMonster = (x, y) => !!this.combat.monsterAt(x, y);
    this.spawnFloorMonsters();
    this.combat.setPartyPos(this.player.x, this.player.y, this.player.dir);
    this.syncEquipmentToCombat();
  }

  private spawnFloorMonsters() {
    this.combat.clearMonsters();
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        const tile = floor1.tiles[y][x];
        if (!tile.monster) continue;
        const m = this.combat.spawnMonster(tile.monster, x, y, tile.monsterHp);
        this.spriteManager.bindMonster(x, y, m.id);
      }
    }
  }

  private syncEquipmentToCombat() {
    if (!this.combat || !this.hud) return;
    for (const id of HERO_IDS) {
      const h = this.hud.heroes[id];
      this.combat.setEquipment(id, 'main', h.equipment.main);
      this.combat.setEquipment(id, 'off', h.equipment.off);
    }
  }

  private syncPartyHud() {
    if (!this.hud || !this.combat) return;
    for (const id of HERO_IDS) {
      this.hud.syncHero(id, this.combat.heroes[id]);
    }
    this.hud.draw(performance.now());
  }

  private logVars(vars?: Record<string, string | number>) {
    if (!vars) return vars;
    const out: Record<string, string | number> = { ...vars };
    if (typeof out.hero === 'string') out.hero = this.story.heroName(out.hero);
    if (typeof out.monster === 'string') out.monster = this.story.monsterName(out.monster);
    if (typeof out.target === 'string') out.target = this.story.heroName(out.target);
    return out;
  }

  private combatLog(key: string, vars?: Record<string, string | number>) {
    const text = this.story.log(key, this.logVars(vars));
    if (!text) return;
    this.lastMessage = text;
    this.hud?.pushLog(text);
  }

  private applyEvents(events: CombatEvent[]) {
    if (!events.length) return;
    const nowMs = performance.now();
    const nowSec = this.nowSec();
    for (const e of events) {
      switch (e.type) {
        case 'log':
          this.combatLog(e.key, e.vars);
          break;
        case 'sfx':
          if (e.name === 'hero_down') break;
          this.audioManager?.playCombat(e.name, e.volume ?? 1, e.x, e.y, e.id);
          break;
        case 'sfx_stop':
          this.audioManager?.stopWindup(e.id);
          break;
        case 'hit_type':
          this.lastHitType = e.kind;
          this.hud.lastHitType = e.kind;
          this.spriteManager.playHitFx(e.id, e.kind, nowMs);
          if (e.kind === 'resist') this.hud.armFrostHint();
          break;
        case 'monster_anim':
          this.spriteManager.playAnimId(e.id, e.anim, nowMs);
          break;
        case 'monster_move':
          this.spriteManager.moveMonsterId(e.id, e.to.x, e.to.y);
          this.darkFx.moveEye(e.from.x, e.from.y, e.to.x, e.to.y, this.audioManager);
          break;
        case 'monster_dead':
          this.spriteManager.playAnimId(e.id, 'death', nowMs);
          this.darkFx.hideEye(e.x, e.y, this.audioManager);
          this.audioManager?.stopWindup(e.id);
          break;
        case 'hero':
        case 'hero_revive':
          break;
        case 'hero_hurt':
          this.audioManager?.playHeroHurt(e.hero, nowSec);
          break;
        case 'hero_down':
          this.audioManager?.playCombat('hero_down');
          this.audioManager?.playHeroDown(e.hero);
          break;
        case 'perk_pending':
          this.perkScreenOpen = false;
          break;
        case 'level_up':
          this.hud.playLevelUp(e.hero);
          break;
        case 'perk_hook':
          this.perkHooks.push({ hero: e.hero, level: e.level });
          this.perkScreenOpen = false;
          break;
        case 'fight_start':
          this.audioManager?.setFightDuck(true);
          break;
        case 'fight_end':
          this.audioManager?.setFightDuck(false);
          this.hud.hideFrostHint();
          this.clearFlankFlash();
          break;
        case 'flank':
          this.flashFlank(e.side);
          break;
        case 'game_over':
          this.showGameOver();
          break;
        case 'hand_used':
          this.hud.lastHand = { hero: e.hero, hand: e.hand };
          this.hud.handTapCount += 1;
          if (e.hero === 'ilsevar' && (e.item === 'wand' || e.item === 'scroll')) {
            this.hud.dismissFrostHint();
          }
          break;
        case 'out_of_reach':
        case 'denied':
          this.audioManager?.playUi('ui_button_denied');
          break;
        default:
          break;
      }
    }
    this.syncPartyHud();
  }

  private flashFlank(side: 'left' | 'right' | 'behind') {
    this.lastFlank = side;
    const el = document.getElementById('flank-flash');
    if (!el) return;
    el.dataset.side = side;
    el.classList.add('show');
    if (this.flankTimer) clearTimeout(this.flankTimer);
    this.flankTimer = setTimeout(() => this.clearFlankFlash(), 420);
  }

  private clearFlankFlash() {
    const el = document.getElementById('flank-flash');
    if (!el) return;
    el.classList.remove('show');
    delete el.dataset.side;
    if (this.flankTimer) {
      clearTimeout(this.flankTimer);
      this.flankTimer = null;
    }
  }

  private wireGameOver() {
    document.getElementById('btn-go-autosave')?.addEventListener('click', () => this.loadAutosave());
    document.getElementById('btn-go-floor')?.addEventListener('click', () => this.restartFloor());
  }

  private showGameOver() {
    this.audioManager?.stopFloorLoops();
    this.audioManager?.stopWindup();
    this.audioManager?.playUi('game_over');
    this.refreshGameOverButtons();
    const el = document.getElementById('gameover');
    if (el) el.classList.add('show');
  }

  private restoreSconceDefaults() {
    for (const s of floor1Sconces) {
      const def = FLOOR_SCONCE_DEFAULTS.find((d) => d.x === s.x && d.y === s.y && d.face === s.face);
      if (!def || s.capped) continue;
      s.lit = def.lit;
      s.empty = !!def.empty;
      this.torches?.syncFromSconce(s);
    }
    this.oil = OIL_START;
  }

  loadAutosave() {
    const save = newestAutosave();
    if (save) this.applySave(save);
    else this.restartFloor();
  }

  restartFloor() {
    const snap = loadFloorSnapshot(FLOOR_NUMBER);
    if (snap) {
      this.applySave(snap);
      return;
    }
    this.restoreSconceDefaults();
    this.resetFloorState();
  }

  private resetFloorState() {
    document.getElementById('gameover')?.classList.remove('show');
    this.perkHooks = [];
    this.perkScreenOpen = false;
    this.hud?.clearReadyArmed();
    this.hud?.clearLog();
    this.lastMessage = '';
    this.combat.resetParty();
    this.spriteManager.resetMonsters(floor1);
    this.darkFx.resetEyes(this.audioManager);
    this.spawnFloorMonsters();
    this.player.setPosition(floor1.startX, floor1.startY, floor1.startDir);
    this.combat.setPartyPos(this.player.x, this.player.y, this.player.dir);
    this.syncEquipmentToCombat();
    this.syncPartyHud();
    this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
    this.torches.setParty(this.player.x, this.player.y, this.player.dir);
    this.syncCarriedLight();
    this.vertexLighting.relight();
    this.updateOilHud();
    this.updateDoorButton();
    this.rebuildAudioFromState();
    this.lastHitType = null;
    this.hud.hideFrostHint();
    this.restoreLoot();
    this.restoreTiles();
    this.flags.clear();
    this.closeBag();
    this.audioManager?.updateListener(this.player.x, this.player.y, this.player.dir);
  }

  updateOilHud() {
    const el = document.getElementById('oil-readout');
    if (!el) return;
    const text =
      this.story.uiText('step1_party_panel.bars.oil_readout', { n: this.oil, max: OIL_MAX }) || this.story.log('no_oil');
    el.textContent = text;
    this.hud?.draw(performance.now());
  }

  loadLampNote() {
    this.lampNote.title = this.story.noteTitle();
    this.lampNote.text = this.story.noteText();
  }

  showNote() {
    const text = this.lampNote.text;
    this.lastMessage = text;
    const overlay = document.getElementById('note-overlay');
    const titleEl = document.getElementById('note-title');
    const textEl = document.getElementById('note-text');
    if (titleEl) titleEl.textContent = this.lampNote.title;
    if (textEl) textEl.textContent = text.replace(/\. /g, '.\n');
    if (overlay) overlay.classList.add('show');
    document.getElementById('message-toast')?.classList.remove('show');
    this.noteOpen = true;
    this.messageTimer = performance.now() + 6000;
  }

  hideNote() {
    document.getElementById('note-overlay')?.classList.remove('show');
    this.noteOpen = false;
  }

  readFacingDesk(): boolean {
    const { x, y } = this.player.facingPos(1);
    const tile = this.player.tileAt(x, y);
    if (!tile) return false;
    if (tile.prop !== 'desk' && !tile.readNote) return false;
    if (this.noteOpen) {
      this.hideNote();
      this.messageTimer = 0;
      return true;
    }
    this.storyProgress.fire('note_lampkeeper');
    this.flags.add('note_lampkeeper');
    this.rememberStoryKey('note_lampkeeper');
    this.rememberStoryKey('journal_page_1');
    this.showNote();
    return true;
  }

  setOil(value: number) {
    const next = Math.min(OIL_MAX, Math.max(0, Math.floor(value)));
    const prev = this.oil;
    this.oil = next;
    if (prev > 0 && next <= 0) {
      this.audioManager.playUi('oil_empty');
      this.audioManager.startLanternLoop(false);
    } else if (prev <= 0 && next > 0) {
      this.audioManager.startLanternLoop(true);
    }
    this.updateOilHud();
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
    if (prev > 0 && next <= 0) this.showPrompt(this.storyLog('lantern_out'));
  }

  handleFacingTorch(): boolean {
    const sconce = this.torches.facingTorch(this.player.x, this.player.y, this.player.dir);
    if (!sconce) return false;
    if (sconce.capped) {
      this.audioManager.playDoor('door_locked', sconce.x, sconce.y);
      this.showPrompt(this.storyLog('torch_capped'));
      return true;
    }
    if (this.torches.isTapLocked(sconce)) return true;
    if (sconce.lit) {
      this.showTorchChoice(sconce);
      return true;
    }
    if (this.hud.hasLitCarriedTorch()) {
      this.placeCarriedTorch(sconce);
      return true;
    }
    this.relightTorch(sconce);
    return true;
  }

  lightFacingTorch(): boolean {
    return this.handleFacingTorch();
  }

  private snuffTorch(sconce: Sconce) {
    if (!sconce.lit) return;
    const now = performance.now();
    this.torches.snuff(sconce, now);
    this.vertexLighting.relight();
    const pos = torchWorldPos(sconce);
    this.audioManager.playPositional('torch_extinguish', pos.x, pos.y, pos.z, 1);
    this.audioManager.stopTorchLoop(sconce);
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.showMessage(this.storyLog('torch_snuffed', { hero: this.story.heroName(this.hud.actingFrontHero()) }));
  }

  private relightTorch(sconce: Sconce) {
    if (sconce.lit) return;
    if (this.oil < OIL_TORCH_COST) {
      this.showPrompt(this.storyLog('no_oil'));
      return;
    }
    const now = performance.now();
    this.torches.ignite(sconce, now);
    this.vertexLighting.relight();
    const pos = torchWorldPos(sconce);
    this.audioManager.playPositional('torch_ignite', pos.x, pos.y, pos.z, 1);
    window.setTimeout(() => this.audioManager.startTorchLoop(sconce), TORCH_IGNITE_FLARE_MS);
    this.setOil(this.oil - OIL_TORCH_COST);
    this.water.addSconceGlint(sconce);
    this.showMessage(this.storyLog('torch_relit'));
  }

  interact(clientX?: number, clientY?: number) {
    if (this.phase !== 'play') return;
    this.interactCount += 1;
    if (this.inventory?.open) {
      if (this.inventory.selected >= 0) {
        this.useBagSlot(this.inventory.selected);
        return;
      }
      this.closeBag();
      return;
    }
    if (this.cancelSwap()) return;
    if (this.torchChoice) {
      this.hideTorchChoice();
      return;
    }
    if (clientX != null && clientY != null) {
      const hit = this.spriteManager.hitItem(
        this.renderer.canvas,
        clientX,
        clientY,
        this.player.x,
        this.player.y,
        this.player.dir
      );
      if (hit && this.pickupItemAt(hit.x, hit.y)) return;
    }
    if (this.pickupItemAt(this.player.x, this.player.y)) return;
    const facing = this.player.facingPos(1);
    if (this.pickupItemAt(facing.x, facing.y)) return;
    if (this.openSecretAt(facing.x, facing.y)) return;
    if (this.handleFacingTorch()) return;
    if (this.handleFacingProp()) return;

    const ahead = this.doorAhead();
    if (ahead) this.handleDoor(ahead.x, ahead.y);
    else this.hideNote();
  }

  private handleFacingProp(): boolean {
    const { x, y } = this.player.facingPos(1);
    const tile = this.player.tileAt(x, y);
    if (!tile || !isFloorProp(tile)) return false;
    if (tile.readNote || tile.prop === 'desk') return this.readFacingDesk();
    if (tile.bark) {
      if (this.speakBark(tile.bark)) return true;
    }
    if (tile.prop === 'lamp_capped') {
      this.showPrompt(this.storyLog('torch_capped'));
      return true;
    }
    return true;
  }

  private wireTorchChoice() {
    const take = document.getElementById('btn-torch-take');
    const snuff = document.getElementById('btn-torch-snuff');
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    take?.addEventListener('pointerup', (e) => {
      if (!(e as PointerEvent).isPrimary) return;
      stop(e);
      this.confirmTake();
    });
    snuff?.addEventListener('pointerup', (e) => {
      if (!(e as PointerEvent).isPrimary) return;
      stop(e);
      this.confirmSnuff();
    });
    take?.addEventListener('click', stop);
    snuff?.addEventListener('click', stop);
  }

  private showTorchChoice(sconce: Sconce) {
    this.torchChoice = { sconce };
    const el = document.getElementById('torch-choice');
    if (el) {
      el.hidden = false;
      el.classList.add('show');
    }
  }

  hideTorchChoice() {
    this.torchChoice = null;
    const el = document.getElementById('torch-choice');
    if (el) {
      el.hidden = true;
      el.classList.remove('show');
    }
  }

  private confirmTake() {
    const sconce = this.torchChoice?.sconce;
    this.hideTorchChoice();
    if (sconce) this.takeWallTorch(sconce);
  }

  private confirmSnuff() {
    const sconce = this.torchChoice?.sconce;
    this.hideTorchChoice();
    if (sconce) this.snuffTorch(sconce);
  }

  isSwapArmed(): boolean {
    return this.swapSconce != null && performance.now() < this.swapUntil;
  }

  cancelSwap(): boolean {
    const was = this.swapSconce != null;
    if (this.swapTimer != null) {
      clearTimeout(this.swapTimer);
      this.swapTimer = null;
    }
    this.swapSconce = null;
    this.swapUntil = 0;
    this.hud?.setSwapHighlight(false);
    return was;
  }

  private armSwap(sconce: Sconce) {
    if (this.swapTimer != null) clearTimeout(this.swapTimer);
    this.swapSconce = sconce;
    this.swapUntil = performance.now() + SWAP_ARM_MS;
    this.hud.setSwapHighlight(true);
    this.swapTimer = setTimeout(() => {
      this.swapTimer = null;
      this.cancelSwap();
    }, SWAP_ARM_MS);
  }

  private takeBagFrom(hero: HeroId, hand: HandSlot): GearId | null {
    return this.bag.takeFrom(hero, hand) as GearId | null;
  }

  private giveTorchTo(sconce: Sconce, hero: HeroId, hand: HandSlot) {
    if (!sconce.lit || sconce.capped) {
      this.cancelSwap();
      return;
    }
    if (this.hud.isGuaranteedLantern(hero, hand)) return;
    const current = this.hud.heroes[hero]?.equipment[hand];
    let stashed = false;
    if (current && current !== 'empty_hand') {
      this.bag.add(current, 1, { hero, hand });
      stashed = true;
      this.showMessage(
        this.storyLog('unequip', {
          hero: this.story.heroName(hero),
          item: this.story.itemName(current)
        })
      );
    }
    this.torches.takeOffWall(sconce);
    this.audioManager.stopTorchLoop(sconce);
    this.audioManager.startCarriedTorchLoop();
    this.hud.setHand(hero, hand, 'torch_lit');
    this.combat?.setEquipment(hero, hand, 'torch_lit');
    this.cancelSwap();
    this.vertexLighting.relight();
    this.syncCarriedLight();
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.audioManager.playUi('torch_take');
    if (stashed) this.audioManager.playUi('ui_inventory_move');
    this.showMessage(this.storyLog('torch_take', { hero: this.story.heroName(hero) }));
  }

  private takeWallTorch(sconce: Sconce) {
    if (!sconce.lit || sconce.capped) return;
    const slot = this.hud.findFreeHand();
    if (!slot) {
      this.armSwap(sconce);
      this.showPrompt(this.story.uiText('torch_choice.hands_full') || this.storyLog('hands_full'));
      return;
    }
    this.giveTorchTo(sconce, slot.hero, slot.hand);
  }

  private placeCarriedTorch(sconce: Sconce) {
    const held = this.hud.carriedTorch();
    if (!held || !held.lit || sconce.lit || sconce.capped) return;
    const now = performance.now();
    const restored = this.takeBagFrom(held.hero, held.hand);
    this.hud.setHand(held.hero, held.hand, restored ?? 'empty_hand');
    this.combat?.setEquipment(held.hero, held.hand, restored ?? 'empty_hand');
    this.audioManager.stopCarriedTorchLoop();
    this.torches.ignite(sconce, now);
    this.vertexLighting.relight();
    this.syncCarriedLight();
    const pos = torchWorldPos(sconce);
    this.audioManager.playUi('torch_place');
    if (restored) this.audioManager.playUi('ui_inventory_move');
    window.setTimeout(() => this.audioManager.startTorchLoop(sconce), TORCH_IGNITE_FLARE_MS);
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.showMessage(this.storyLog('torch_place', { hero: this.story.heroName(held.hero) }));
    void pos;
  }

  private maybeDunkTorch(x: number, y: number) {
    const tile = this.player.tileAt(x, y);
    if (!tile?.deepWater) return;
    const dunked = this.hud.dunkCarriedTorches();
    if (!dunked.length) return;
    for (const d of dunked) this.combat?.setEquipment(d.hero, d.hand, 'torch_burnt');
    this.audioManager.playUi('torch_dunk');
    this.audioManager.stopCarriedTorchLoop();
    this.syncCarriedLight();
    this.showMessage(this.storyLog('torch_dunk', { hero: this.story.heroName(dunked[0].hero) }));
  }

  private syncCarriedLight() {
    this.vertexLighting.setCarriedTorch(this.hud.hasLitCarriedTorch());
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
  }

  handleHandTap(hero: HeroId, hand: HandSlot) {
    this.hideTorchChoice();
    if (this.isSwapArmed() && this.swapSconce) {
      if (this.hud.isGuaranteedLantern(hero, hand)) return;
      this.giveTorchTo(this.swapSconce, hero, hand);
      return;
    }
    this.cancelSwap();
    this.useHand(hero, hand);
  }

  useHand(hero: HeroId, hand: HandSlot): boolean {
    if (!this.combat || this.combat.gameOver) return false;
    this.syncEquipmentToCombat();
    const before = this.hud.handTapCount;
    this.applyEvents(this.combat.useHand(hero, hand, this.nowSec()));
    return this.hud.handTapCount > before;
  }

  private playTimeMs() {
    if (!this.playStartedAt) return this.playAccMs;
    return this.playAccMs + Math.max(0, performance.now() - this.playStartedAt);
  }

  private snapshotCurrentFloor(): SavedFloor {
    const tiles: SavedFloor['tiles'] = [];
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        const tile = floor1.tiles[y][x];
        const snap = this.tileSnap[y * floor1.width + x];
        const puzzle =
          tile.puzzle && typeof tile.puzzle === 'object'
            ? (tile.puzzle as Record<string, string | number | boolean>)
            : undefined;
        if (!tile.door && !tile.secret && !tile.chest && !tile.item && !snap?.item && !snap?.chest && !puzzle) continue;
        tiles.push({
          x,
          y,
          doorOpen: tile.doorOpen,
          doorLocked: tile.doorLocked,
          secretOpen: tile.secretOpen,
          chestOpen: tile.chestOpen,
          chestItems: tile.chestItems ? [...tile.chestItems] : tile.chestItems,
          item: tile.item ?? null,
          puzzle
        });
      }
    }
    return {
      tiles,
      sconces: floor1Sconces.map((s) => ({
        x: s.x,
        y: s.y,
        face: s.face,
        lit: !!s.lit,
        empty: !!s.empty,
        capped: !!s.capped
      })),
      monsters: this.combat.monsters.map(snapshotMonster)
    };
  }

  captureSave(kind: SavePayload['kind'] = 'slot'): SavePayload {
    this.floorStates[String(FLOOR_NUMBER)] = this.snapshotCurrentFloor();
    return {
      version: SAVE_VERSION,
      kind,
      timestamp: Date.now(),
      playTimeMs: this.playTimeMs(),
      locale: this.story.locale,
      floor: FLOOR_NUMBER,
      position: { x: this.player.x, y: this.player.y, dir: this.player.dir },
      oil: this.oil,
      party: HERO_IDS.map((id) => snapshotHero(this.combat.heroes[id], this.hud.heroes[id]?.armour)),
      bag: this.bag.serialize(),
      floors: { ...this.floorStates },
      flags: [...this.flags],
      firedOnce: this.storyProgress.serialize().fired,
      goals: this.storyProgress.serialize().goals,
      journalPages: [...this.journalPages],
      dialogue: Object.fromEntries(this.dialogue),
      escapeRunActive: this.escapeRunActive,
      leader: 'brannoc'
    };
  }

  applySave(save: SavePayload) {
    document.getElementById('gameover')?.classList.remove('show');
    this.hud?.clearLog();
    this.lastMessage = '';
    this.restoreTiles();
    this.restoreSconceDefaults();
    this.flags = new Set(save.flags ?? []);
    this.storyProgress.restore({ fired: save.firedOnce, goals: save.goals });
    this.playAccMs = save.playTimeMs ?? 0;
    this.playStartedAt = performance.now();
    this.escapeRunActive = !!save.escapeRunActive;
    this.oil = save.oil;
    this.bag.load(save.bag ?? []);
    this.player.hasKey = this.bag.has('key') || this.bag.has('captain_key');
    this.floorStates = { ...(save.floors ?? {}) };
    this.journalPages = new Set(save.journalPages ?? []);
    this.dialogue = new Map(Object.entries(save.dialogue ?? {}));
    const floor = floorState(save) ?? this.floorStates[String(save.floor)];
    for (const t of floor?.tiles ?? []) {
      const tile = floor1.tiles[t.y]?.[t.x];
      if (!tile) continue;
      if (t.item === null) tile.item = undefined;
      else if (t.item !== undefined) tile.item = t.item;
      if (t.chestOpen !== undefined) tile.chestOpen = t.chestOpen;
      if (t.chestItems !== undefined) tile.chestItems = [...t.chestItems];
      if (t.doorOpen !== undefined) {
        tile.doorOpen = t.doorOpen;
        const visual = this.sceneBuilder.doors.get(t.x, t.y);
        if (visual) this.sceneBuilder.doors.snapOpen(visual, !!t.doorOpen);
      }
      if (t.doorLocked !== undefined) tile.doorLocked = t.doorLocked;
      if (t.secretOpen !== undefined) {
        tile.secretOpen = t.secretOpen;
        this.sceneBuilder.setSecretOpen(this.renderer.scene, t.x, t.y, !!t.secretOpen);
      }
      if (t.puzzle) tile.puzzle = { ...t.puzzle };
    }
    this.spriteManager.resetItems(floor1);
    for (const s of floor?.sconces ?? []) {
      const live = floor1Sconces.find((c) => c.x === s.x && c.y === s.y && c.face === s.face);
      if (!live || live.capped) continue;
      live.lit = !!s.lit;
      live.empty = !!s.empty;
      this.torches.syncFromSconce(live);
    }
    this.combat.resetParty();
    for (const hero of save.party ?? []) this.combat.applyHero(hero);
    this.combat.restoreMonsters(floor?.monsters ?? []);
    this.spriteManager.resetMonsters(floor1);
    for (const m of this.combat.monsters) {
      const sprite =
        this.spriteManager.sprites.find((s) => s.kind === 'monster' && s.monsterKind === m.kind && !s.monsterId) ??
        this.spriteManager.sprites.find((s) => s.kind === 'monster' && s.monsterKind === m.kind);
      if (!sprite) continue;
      sprite.monsterId = m.id;
      this.spriteManager.moveMonsterId(m.id, m.x, m.y);
      if (!m.alive) this.spriteManager.hideDeadMonsterId(m.id);
    }
    for (const id of HERO_IDS) {
      const h = this.combat.heroes[id];
      this.hud.setHand(id, 'main', h.equipment.main as GearId);
      this.hud.setHand(id, 'off', h.equipment.off as GearId);
      if (this.hud.heroes[id]) this.hud.heroes[id].armour = save.party.find((p) => p.id === id)?.armour;
    }
    this.player.setPosition(save.position.x, save.position.y, save.position.dir);
    this.combat.setPartyPos(this.player.x, this.player.y, this.player.dir);
    this.syncEquipmentToCombat();
    this.syncPartyHud();
    this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
    this.torches.setParty(this.player.x, this.player.y, this.player.dir);
    this.syncCarriedLight();
    this.vertexLighting.relight();
    this.updateOilHud();
    this.updateDoorButton();
    this.inventory?.redraw();
    this.lastHitType = null;
    this.hud.hideFrostHint();
    this.clearFlankFlash();
    this.closeBag();
    this.rebuildAudioFromState();
    this.audioManager?.updateListener(this.player.x, this.player.y, this.player.dir);
  }

  private rebuildAudioFromState() {
    this.audioManager?.stopPresenceLoops();
    this.audioManager?.rebuildFloorLoops({
      oil: this.oil,
      sconces: floor1Sconces,
      leeches: this.combat.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, alive: m.alive })),
      carriedTorch: !!this.hud.carriedTorch()?.lit
    });
  }

  canAutosave(): boolean {
    if (this.phase !== 'play') return false;
    if (this.escapeRunActive) return false;
    if (this.combat?.gameOver) return false;
    if (this.combat?.fight) return false;
    if (this.combat && this.combat.nearestMonsterDist() <= 2) return false;
    if (this.combat && this.combat.allHeroesUnderHpFrac(0.25)) return false;
    return true;
  }

  tryAutosave(_reason = 'auto'): boolean {
    if (!this.canAutosave()) return false;
    return writeAutosave(this.captureSave('autosave'));
  }

  takeFloorSnapshot() {
    writeFloorSnapshot(this.captureSave('floor'));
  }

  saveBlockedReason(): string | null {
    if (this.combat?.fight) return 'combat';
    if (this.escapeRunActive) return 'escape';
    return null;
  }

  requestManualSave() {
    const blocked = this.saveBlockedReason();
    if (blocked) {
      this.showPrompt(this.story.titleText('save_blocked'));
      this.audioManager?.playUi('ui_button_denied');
      return;
    }
    this.title.prepareSave(this.captureSave('slot'));
    this.title.show('save');
  }

  commitSlot(slot: number) {
    const payload = this.title.getMode() === 'save' ? this.captureSave('slot') : this.captureSave('slot');
    if (writeSlot(slot, payload)) {
      this.currentSlot = slot;
      this.showPrompt(this.story.titleText('saved'));
      this.audioManager?.playUi('save');
      this.title.hide();
    } else {
      this.showPrompt(this.story.uiText('status.save_failed'));
    }
  }

  private speakBark(trigger: string, forcedSpeaker?: HeroId) {
    const entry = this.story.barkEntry(trigger);
    const text = entry?.text || this.story.bark(trigger);
    if (!text) return false;
    const speaker = (forcedSpeaker || (entry?.speaker as HeroId) || 'brannoc') as HeroId;
    const name = this.story.speakerName(speaker);
    this.lastMessage = `${name}: ${text}`;
    this.hud?.pushLog(`${name}: ${text}`);
    this.bubble?.show(text, speaker, name);
    return true;
  }

  private fireTileBark(x: number, y: number) {
    const tile = this.player.tileAt(x, y);
    if (!tile?.bark) return;
    const key = `bark:${tile.bark}`;
    if (this.flags.has(key) || !this.storyProgress.fire(tile.bark)) return;
    if (this.speakBark(tile.bark)) this.flags.add(key);
  }

  openSecretAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile?.secret || tile.secretOpen) return false;
    tile.secretOpen = true;
    this.flags.add('secret_found');
    this.sceneBuilder.setSecretOpen(this.renderer.scene, x, y, true);
    this.spriteManager.resetItems(floor1);
    this.combat.setOccupancy(
      openGrid(
        (ox, oy) => {
          const t = floor1.tiles[oy]?.[ox];
          if (!t || t.wall) return true;
          if (t.secret && !t.secretOpen) return true;
          if (t.door && !t.doorOpen) return true;
          if (t.prop === 'beams_fallen' || t.prop === 'desk') return true;
          return false;
        },
        floor1.width,
        floor1.height,
        (ox, oy) => {
          const t = floor1.tiles[oy]?.[ox];
          return !!(t?.deepWater || t?.shallowWater);
        }
      )
    );
    this.vertexLighting.relight();
    if (this.storyProgress.fire('secret_found')) this.showMessage(this.storyLog('secret_found'));
    this.speakBark('secret_wall', 'brannoc');
    return true;
  }

  private async setLocale(locale: Locale) {
    saveLocale(locale);
    await this.story.load(locale);
    document.documentElement.lang = locale;
    this.applyStoryLabels();
    this.title.story = this.story;
    this.title.refreshHint();
    this.title.layoutButtons();
  }

  private async wireTitleAndIntro() {
    const titleCanvas = document.getElementById('title-canvas') as HTMLCanvasElement | null;
    const introCanvas = document.getElementById('intro-canvas') as HTMLCanvasElement | null;
    const bubbleCanvas = document.getElementById('speech-bubble') as HTMLCanvasElement | null;
    if (bubbleCanvas) {
      this.bubble = new SpeechBubble(bubbleCanvas);
      await this.bubble.load();
    }
    if (introCanvas) {
      this.intro = new IntroPlayer(introCanvas, this.story);
      await this.intro.load();
      introCanvas.addEventListener('pointerup', (e) => {
        if (!e.isPrimary) return;
        this.skipIntro();
      });
    }
    if (!titleCanvas) return;
    this.title = new TitleScreen(titleCanvas, this.story, (action) => {
      if (action.type === 'toast' || action.type === 'language') {
        this.audioManager?.playUi('ui_button_denied');
        if (action.type === 'toast') this.showTitleToast(action.text);
        else void this.setLocale(action.locale);
        return;
      }
      this.audioManager?.playUi('ui_button');
      if (action.type === 'new_game') {
        this.startNewGame();
        return;
      }
      if (action.type === 'continue' || action.type === 'load') {
        this.title.hide();
        this.applySave(action.payload);
        this.beginPlay();
        return;
      }
      if (action.type === 'save') this.commitSlot(action.slot);
    });
    await this.title.load();
    this.title.refreshHint();
    if (!this.skipTitle) {
      this.phase = 'title';
      document.getElementById('tap-to-start')?.classList.add('hidden');
      this.title.show('title');
      void this.audioManager.loadSounds(this.renderer.scene, floor1Sconces).then(() => {
        this.audioManager.playMenu();
      });
    }
  }

  private showTitleToast(text: string) {
    const el = document.getElementById('title-toast');
    if (!el) {
      this.showPrompt(text);
      return;
    }
    el.textContent = text;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 1600);
  }

  private wireVisibilityAutosave() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.tryAutosave('quiet');
    });
    window.addEventListener('pagehide', () => this.tryAutosave('quiet'));
  }

  private startNewGame() {
    this.title.hide();
    this.restoreSconceDefaults();
    this.resetFloorState();
    this.flags.clear();
    this.playAccMs = 0;
    this.playStartedAt = performance.now();
    this.storyProgress.startNewGame();
    this.journalPages.clear();
    this.dialogue.clear();
    this.floorStates = {};
    this.takeFloorSnapshot();
    this.phase = 'intro';
    this.audioManager.crossfadeToIntro();
    const overlay = document.getElementById('intro-overlay');
    if (overlay && this.intro) {
      overlay.classList.add('show');
      this.intro.start();
    } else {
      this.beginPlay();
    }
  }

  private skipIntro() {
    this.intro?.skip();
    document.getElementById('intro-overlay')?.classList.remove('show');
    this.beginPlay();
  }

  private beginPlay() {
    this.phase = 'play';
    if (!this.playStartedAt) this.playStartedAt = performance.now();
    if (this.storyProgress.fire('enter_floor1')) this.showMessage(this.storyLog('enter_floor1'));
    this.storyProgress.fire('f1_start');
    this.audioManager.crossfadeToAct1();
    this.startLoop();
  }

  private startLoop() {
    if (this.loopStarted) {
      this.audioManager.unlock();
      return;
    }
    this.loopStarted = true;
    document.getElementById('tap-to-start')?.classList.add('hidden');
    this.audioManager.unlock();
    this.lastTime = performance.now();
    this.fpsLastTime = this.lastTime;
    requestAnimationFrame(() => this.gameLoop());
    void this.loadFloorAudio();
  }

  private async loadFloorAudio() {
    try {
      await this.audioManager.loadSounds(this.renderer.scene, floor1Sconces);
      this.audioManager.attachDressing(this.renderer.scene, this.dressing.marks);
      this.audioManager.attachWaterPools(this.renderer.scene, floor1);
      this.audioManager.startNamedLoop('lamp_hooks', 11 * CELL_SIZE, 0.55, 9 * CELL_SIZE, 0.38, 'named');
      this.rebuildAudioFromState();
    } catch (err) {
      console.warn('Audio init failed', err);
      this.audioManager.startLanternLoop(this.oil > 0);
    }
  }

  handleDoor(x: number, y: number) {
    const ahead = this.doorAhead();
    if (!ahead || ahead.x !== x || ahead.y !== y) return;
    const visual = this.sceneBuilder.doors.get(x, y);
    if (!visual || visual.busy || this.pendingUnlock) return;
    const tile = visual.tile;
    if (tile.doorLocked && !tile.doorOpen) {
      const fromBag = this.bag.has('key');
      if (!fromBag && !this.player.hasKey) {
        this.audioManager.playDoor('door_locked', x, y);
        if (this.storyProgress.fire('door_locked')) this.showPrompt(this.storyLog('door_locked'));
        return;
      }
      if (fromBag) this.bag.remove('key', 1);
      this.syncKeyFlag();
      tile.doorLocked = false;
      this.audioManager.playDoor('door_unlock', x, y);
      this.pendingUnlock = { x, y };
      this.doorUnlockTimer = performance.now() + DOOR_UNLOCK_LEAD_MS;
      return;
    }
    const opening = !tile.doorOpen;
    this.sceneBuilder.doors.startSlide(visual, opening, performance.now());
    this.audioManager.playDoor(opening ? 'door_open' : 'door_close', x, y);
    this.vertexLighting.relight();
  }

  exposeDebugApi() {
    (window as unknown as { __proto3d: unknown }).__proto3d = {
      ready: true,
      setPosition: (x: number, y: number, dir: number) => {
        this.cancelSwap();
        this.hideTorchChoice();
        this.player.setPosition(x, y, dir);
        this.combat?.setPartyPos(this.player.x, this.player.y, this.player.dir);
        this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
        this.syncCarriedLight();
        this.torches.setParty(this.player.x, this.player.y, this.player.dir);
        this.torches.update(performance.now(), this.player.x, this.player.y, this.player.dir);
        this.dressing.update(performance.now(), this.player.x, this.player.y, this.player.dir);
        this.spriteManager.update(performance.now(), this.player.x, this.player.y, this.player.dir);
        this.darkFx.update(
          performance.now(),
          this.vertexLighting,
          this.spriteManager,
          this.audioManager,
          this.player.x,
          this.player.y
        );
        this.audioManager?.updateListener(this.player.x, this.player.y, this.player.dir);
        this.props?.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale());
        this.updateDoorButton();
        this.renderer.render();
      },
      getPosition: () => ({ x: this.player.x, y: this.player.y, dir: this.player.dir }),
      sprites: () =>
        this.spriteManager.sprites.map((s) => ({
          x: s.x,
          y: s.y,
          kind: s.kind,
          monsterKind: s.monsterKind,
          itemId: s.itemId,
          visible: s.object.visible && !s.hidden,
          world: s.object.position.toArray(),
          worldX: s.object.position.x,
          worldY: s.object.position.y,
          worldZ: s.object.position.z,
          scale: s.object.scale.toArray(),
          scaleX: s.object.scale.x,
          scaleY: s.object.scale.y,
          baseH: s.baseH,
          renderOrder: s.object.renderOrder,
          depthTest: (s.material as THREE.Material).depthTest,
          item: s.object.userData.item,
          frames: s.frames?.length ?? 0,
          currentFrame: s.currentFrame
        })),
      regionStats: (x0: number, y0: number, x1: number, y1: number) => {
        this.renderer.render();
        const gl = this.renderer.renderer.getContext();
        const w = this.renderer.canvas.width;
        const h = this.renderer.canvas.height;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const xMin = Math.max(0, Math.floor(x0));
        const xMax = Math.min(w, Math.ceil(x1));
        const yMin = Math.max(0, Math.floor(y0));
        const yMax = Math.min(h, Math.ceil(y1));
        let sum = 0;
        let fog = 0;
        let n = 0;
        for (let y = yMin; y < yMax; y++) {
          for (let x = xMin; x < xMax; x++) {
            const i = ((h - 1 - y) * w + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            sum += (r + g + b) / 3;
            if (r < 14 && g < 14 && b < 14) fog++;
            n++;
          }
        }
        return { luma: n ? sum / n : 0, fogRatio: n ? fog / n : 0, n };
      },
      faceKinds: () => {
        const out: Array<{ kind: string; lightX: number; lightY: number; face?: string }> = [];
        this.renderer.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (typeof obj.userData.kind !== 'string') return;
          out.push({
            kind: obj.userData.kind,
            lightX: obj.userData.lightX,
            lightY: obj.userData.lightY,
            face: obj.userData.face
          });
        });
        return out;
      },
      faceLighting: () => {
        this.renderer.scene.updateMatrixWorld(true);
        const out: Array<{
          kind: string;
          lightX: number;
          lightY: number;
          face?: string;
          worldX: number;
          worldZ: number;
          avgR: number;
        }> = [];
        const v = new THREE.Vector3();
        this.renderer.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (typeof obj.userData.kind !== 'string') return;
          const pos = obj.geometry.attributes.position;
          const col = obj.geometry.attributes.color;
          if (!pos) return;
          obj.updateWorldMatrix(true, false);
          let sx = 0;
          let sz = 0;
          let sr = 0;
          const n = pos.count;
          for (let i = 0; i < n; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
            sx += v.x;
            sz += v.z;
            sr += col ? col.getX(i) : 1;
          }
          out.push({
            kind: obj.userData.kind,
            lightX: obj.userData.lightX,
            lightY: obj.userData.lightY,
            face: obj.userData.face,
            worldX: sx / n,
            worldZ: sz / n,
            avgR: sr / n
          });
        });
        return out;
      },
      getCamera: () => ({
        position: this.renderer.camera.position.toArray(),
        rotation: this.renderer.camera.rotation.toArray().slice(0, 3),
        fov: this.renderer.camera.fov
      }),
      meanLuma: () => {
        this.renderer.render();
        const gl = this.renderer.renderer.getContext();
        const w = this.renderer.canvas.width;
        const h = this.renderer.canvas.height;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        }
        return sum / (w * h);
      },
      fps: () => this.lastFps,
      quality: () => this.quality,
      setQuality: (q: QualityLevel) => {
        this.quality = q;
        this.atmosphere.setQuality(q);
        this.audioManager.setQuality(q);
      },
      interact: () => this.interact(),
      interactCount: () => this.interactCount,
      giveKey: () => {
        this.player.hasKey = true;
      },
      hasKey: () => this.player.hasKey,
      lastMessage: () => this.lastMessage,
      lastHitType: () => this.lastHitType ?? this.spriteManager.lastHitType,
      playingLoops: () => this.audioManager.playingLoops(),
      loopKit: () => this.audioManager.loopKit(),
      playHitFx: (id: string, kind: 'resist' | 'weak' | 'crit' | 'hit') => {
        this.spriteManager.playHitFx(id, kind, performance.now());
        this.lastHitType = kind;
        this.hud.lastHitType = kind;
        if (kind === 'resist') this.hud.armFrostHint();
      },
      hitFxPlaying: () => this.spriteManager.hitFxPlaying(),
      hostTint: (id: string) => this.spriteManager.hostTint(id),
      frostHint: () => this.hud.frostHintState(),
      lastFlank: () => this.lastFlank,
      flashFlank: (side: 'left' | 'right' | 'behind') => this.flashFlank(side),
      partyState: () => this.combat.partyState(),
      lastNote: () => this.lampNote,
      noteOpen: () => this.noteOpen,
      getOil: () => this.oil,
      setOil: (n: number) => this.setOil(n),
      getBright: () => this.bright,
      getAmbientFloor: () => this.vertexLighting.getAmbientFloor(),
      getAmbient: () => this.vertexLighting.ambientBrightness(),
      setBright: (n: number) => {
        this.bright = Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, n));
        this.vertexLighting.setBright(this.bright);
        this.vertexLighting.updateAllMeshes(this.renderer.scene);
        this.renderer.render();
      },
      torchStates: () =>
        floor1Sconces.map((s) => ({ x: s.x, y: s.y, face: s.face, lit: s.lit, capped: !!s.capped })),
      torches: () => this.torches.snapshot(),
      torchLit: (x: number, y: number) => !!floor1Sconces.find((s) => s.x === x && s.y === y)?.lit,
      tileBrightness: (x: number, y: number) =>
        this.vertexLighting.calculateBrightness(x, y, !!floor1.tiles[y]?.[x]?.floorNDark),
      tileLight: (x: number, y: number) =>
        this.vertexLighting.calculateBrightness(x, y, !!floor1.tiles[y]?.[x]?.floorNDark),
      sourceLight: (x: number, y: number) => this.vertexLighting.sourceLight(x, y),
      isSquareLit: (x: number, y: number) => this.vertexLighting.isSquareLit(x, y),
      stepVolume: () => STEP_VOLUME,
      lastStep: () => this.audioManager.lastStep(),
      oil: () => this.oil,
      giveOil: (n = 1) => this.setOil(this.oil + n),
      setFlickerFrame: (frame: number) => {
        this.vertexLighting.setFlickerFrame(frame);
        this.renderer.render();
      },
      darkFx: () => this.darkFx.snapshot(),
      lightFacingTorch: () => this.handleFacingTorch(),
      snuffFacing: () => {
        const sconce = this.torches.facingTorch(this.player.x, this.player.y, this.player.dir);
        if (sconce?.lit) this.snuffTorch(sconce);
      },
      takeFacingTorch: () => {
        const sconce = this.torches.facingTorch(this.player.x, this.player.y, this.player.dir);
        if (sconce?.lit) this.takeWallTorch(sconce);
      },
      torchChoiceVisible: () => !!this.torchChoice,
      hideTorchChoice: () => this.hideTorchChoice(),
      setHeroHp: (id: HeroId, hp: number) => {
        this.combat?.debugSetHp(id, hp);
        this.hud.setHeroHp(id, hp);
        this.syncPartyHud();
      },
      setHand: (id: HeroId, hand: HandSlot, item: string) => {
        this.hud.setHand(id, hand, item as never);
        this.combat?.setEquipment(id, hand, item);
      },
      getHands: () => this.hud.getHands(),
      useHand: (id: HeroId, hand: HandSlot) => this.useHand(id, hand),
      lastHand: () => this.hud.lastHand,
      handTapCount: () => this.hud.handTapCount,
      carriedTorch: () => this.hud.carriedTorch(),
      hasCarriedTorchLight: () => this.vertexLighting.hasCarriedTorch(),
      getBag: () => this.bag.serialize(),
      giveItem: (id: string, n = 1) => {
        this.bag.add(id, n);
        this.syncKeyFlag();
        this.inventory?.redraw();
      },
      openBag: () => this.openBag(),
      closeBag: () => this.closeBag(),
      bagOpen: () => !!this.inventory?.open,
      useBagSlot: (i: number) => this.useBagSlot(i),
      equipBagSlot: (i: number, hero: HeroId) => this.equipBagSlot(i, hero),
      drinkPotion: (hero: HeroId, kind: 'potion_red' | 'potion_blue' | 'potion_green') => {
        this.pendingPotion = kind;
        this.drinkPendingPotion(hero);
      },
      lastCompare: () => this.inventory?.lastCompare ?? null,
      locale: () => this.story.locale,
      pickupHere: () => this.pickupItemAt(this.player.x, this.player.y),
      pickupFacing: () => {
        const { x, y } = this.player.facingPos(1);
        return this.pickupItemAt(x, y);
      },
      chestOpen: (x: number, y: number) => !!this.player.tileAt(x, y)?.chestOpen,
      fillChest: (x: number, y: number, items: string[]) => {
        const tile = this.player.tileAt(x, y);
        if (!tile) return false;
        tile.chest = true;
        tile.chestOpen = false;
        tile.chestItems = [...items];
        return true;
      },
      setAdjacentScale: (n: number) => {
        this.spriteManager.setAdjacentScale(n);
        this.spriteManager.update(performance.now(), this.player.x, this.player.y, this.player.dir);
        this.props.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale());
        this.renderer.render();
      },
      adjacentScale: () => this.spriteManager.integerAdjacentScale(),
      listenerPose: () => this.audioManager.listenerPose(),
      propTiles: () => {
        const out: Array<{ x: number; y: number; prop: string }> = [];
        for (let y = 0; y < floor1.height; y++) {
          for (let x = 0; x < floor1.width; x++) {
            const p = floor1.tiles[y][x].prop;
            if (p) out.push({ x, y, prop: p });
          }
        }
        return out;
      },
      partySave: () => ({
        bag: this.bag.serialize(),
        equipment: this.equipmentState(),
        oil: this.oil
      }),
      captureSave: () => this.captureSave('slot'),
      applySave: (raw: SavePayload) => this.applySave(raw),
      saveToSlot: (slot: number) => {
        const ok = writeSlot(slot, this.captureSave('slot'));
        if (ok) this.currentSlot = slot;
        return ok;
      },
      loadFromSlot: (slot: number) => {
        const data = loadSlot(slot);
        if (!data || data === 'corrupt') return false;
        this.applySave(data);
        return true;
      },
      requestManualSave: () => this.requestManualSave(),
      commitSlot: (slot: number) => this.commitSlot(slot),
      tryAutosave: () => this.tryAutosave('auto'),
      canAutosave: () => this.canAutosave(),
      takeFloorSnapshot: () => this.takeFloorSnapshot(),
      loadAutosave: () => this.loadAutosave(),
      newestAutosave: () => newestAutosave(),
      hasAnySave: () => hasAnySave(),
      listAutosaves: () => listAutosaves(),
      fireVisibilityAutosave: () => this.tryAutosave('quiet'),
      openSecret: (x: number, y: number) => this.openSecretAt(x, y),
      secretOpen: (x: number, y: number) => !!this.player.tileAt(x, y)?.secretOpen,
      speakBark: (trigger: string, speaker?: HeroId) => this.speakBark(trigger, speaker),
      bubbleVisible: () => !!this.bubble?.visible,
      bubbleText: () => this.bubble?.displayText() ?? '',
      flags: () => [...this.flags],
      addFlag: (f: string) => {
        this.flags.add(f);
        this.rememberStoryKey(f);
        this.storyProgress.fire(f);
      },
      fireOnce: (id: string) => {
        const ok = this.storyProgress.fire(id);
        if (ok) this.rememberStoryKey(id);
        return ok;
      },
      firedOnce: () => [...this.storyProgress.fired],
      goals: () => this.storyProgress.snapshotGoals(),
      setGoal: (id: string, status: 'hidden' | 'active' | 'done' | 'failed') => {
        this.storyProgress.goals.set(id, status);
      },
      loopNames: () =>
        this.audioManager
          .loopKit(false)
          .names.filter((n) => n !== 'menu' && n !== 'intro')
          .slice()
          .sort(),
      persistCalled: () => !!(globalThis as { __proto3dPersistCalled?: boolean }).__proto3dPersistCalled,
      killKind: (kind: string) => {
        const m = this.combat.monsters.find((x) => x.kind === kind && x.alive);
        if (!m) return false;
        m.alive = false;
        m.hp = 0;
        m.deadAt = 1;
        this.spriteManager.hideDeadMonsterId(m.id);
        return true;
      },
      mapState: () => ({
        oil: this.oil,
        bag: this.bag.serialize(),
        carried: this.hud.carriedTorch(),
        position: { x: this.player.x, y: this.player.y, dir: this.player.dir },
        doors: this.tileSnap
          .filter((t) => floor1.tiles[t.y][t.x].door)
          .map((t) => ({ x: t.x, y: t.y, open: !!floor1.tiles[t.y][t.x].doorOpen })),
        secrets: this.tileSnap
          .filter((t) => floor1.tiles[t.y][t.x].secret)
          .map((t) => ({ x: t.x, y: t.y, open: !!floor1.tiles[t.y][t.x].secretOpen })),
        items: this.tileSnap
          .filter((t) => floor1.tiles[t.y][t.x].item || t.item)
          .map((t) => ({ x: t.x, y: t.y, item: floor1.tiles[t.y][t.x].item ?? null })),
        chests: this.tileSnap
          .filter((t) => floor1.tiles[t.y][t.x].chest)
          .map((t) => ({
            x: t.x,
            y: t.y,
            open: !!floor1.tiles[t.y][t.x].chestOpen,
            loot: floor1.tiles[t.y][t.x].chestItems ?? []
          })),
        sconces: floor1Sconces.map((s) => ({
          x: s.x,
          y: s.y,
          face: s.face,
          lit: !!s.lit,
          empty: !!s.empty
        })),
        monsters: this.combat.monsters.map((m) => ({
          kind: m.kind,
          x: m.x,
          y: m.y,
          hp: m.hp,
          alive: m.alive
        })),
        flags: [...this.flags],
        firedOnce: [...this.storyProgress.fired],
        goals: this.storyProgress.snapshotGoals()
      }),
      setEscapeRun: (on: boolean) => {
        this.escapeRunActive = on;
      },
      titleVisible: () => !!document.getElementById('title-overlay')?.classList.contains('show'),
      introVisible: () => !!document.getElementById('intro-overlay')?.classList.contains('show'),
      startNewGame: () => this.startNewGame(),
      skipIntro: () => this.skipIntro(),
      setLocale: (locale: Locale) => this.setLocale(locale),
      showTitle: () => this.title.show('title'),
      currentSlot: () => this.currentSlot,
      blockReason: (x: number, y: number) => this.player.blockReason(x, y),
      interactFacingProp: () => this.handleFacingProp(),
      swapArmed: () => this.isSwapArmed(),
      swapHighlightCount: () => document.querySelectorAll('.hand-btn.swap-armed').length,
      lastUi: () => this.audioManager.lastUi(),
      lanternLoop: () => this.audioManager.lanternLoop(),
      playLevelUp: (id: HeroId) => this.hud.playLevelUp(id),
      inCombat: () => !!this.combat?.fight,
      combatHeroes: () =>
        HERO_IDS.map((id) => {
          const h = this.combat.heroes[id];
          return {
            id,
            hp: h.hp,
            maxHp: h.maxHp,
            downed: h.downed,
            level: h.level,
            xp: h.xp,
            pendingPerk: h.pendingPerk
          };
        }),
      combatMonsters: () =>
        this.combat.monsters.map((m) => ({
          id: m.id,
          kind: m.kind,
          x: m.x,
          y: m.y,
          hp: m.hp,
          alive: m.alive,
          windup: m.windup?.kind ?? null
        })),
      pendingPerks: () => this.combat.pendingPerks.slice(),
      perkHooks: () => this.perkHooks.slice(),
      perkScreenOpen: () => this.perkScreenOpen,
      heroVoices: () => HERO_VOICES,
      lastHeroVoice: () => this.audioManager.lastHeroVoice,
      forceWipe: () => this.applyEvents(this.combat.forceWipe()),
      restartFloor: () => this.restartFloor(),
      addXp: (n: number) => this.applyEvents(this.combat.debugAddXp(n, this.nowSec())),
      finishFight: () => this.applyEvents(this.combat.finishFight(this.nowSec())),
      forceWindup: () => {
        const m = this.combat.adjacentMonster() ?? this.combat.fightMonster();
        if (!m) return false;
        m.attackCount = 2;
        m.nextAttackAt = this.nowSec();
        this.applyEvents(this.combat.tick(this.nowSec()));
        return !!m.windup;
      },
      forceSwing: () => {
        const m = this.combat.fightMonster() ?? this.combat.adjacentMonster();
        if (!m) return false;
        m.windup = null;
        m.nextAttackAt = this.nowSec();
        this.applyEvents(this.combat.tick(this.nowSec()));
        return true;
      },
      gameOverVisible: () => !!document.getElementById('gameover')?.classList.contains('show'),
      logLines: () => this.hud.logLines.slice(),
      layout: () => this.hud.layout,
      tryMoveForward: () => {
        const before = { x: this.player.x, y: this.player.y };
        const result = this.player.moveForward();
        this.handleMove(result);
        const dest = this.player.isMoving
          ? { x: this.player.moveToX, y: this.player.moveToY, dir: this.player.moveToDir }
          : { x: this.player.x, y: this.player.y, dir: this.player.dir };
        return { result, before, after: dest };
      },
      tryTurnLeft: () => {
        this.cancelSwap();
        this.hideTorchChoice();
        return this.player.turnLeft();
      },
      tryTurnRight: () => {
        this.cancelSwap();
        this.hideTorchChoice();
        return this.player.turnRight();
      },
      doorOpen: (x: number, y: number) => !!this.sceneBuilder.doors.get(x, y)?.tile.doorOpen,
      openDoor: (x: number, y: number) => {
        const visual = this.sceneBuilder.doors.get(x, y);
        if (!visual) return false;
        visual.tile.doorLocked = false;
        this.sceneBuilder.doors.startSlide(visual, true, performance.now());
        this.audioManager.playDoor('door_open', x, y);
        this.vertexLighting.relight();
        return true;
      },
      closeDoor: (x: number, y: number) => {
        const visual = this.sceneBuilder.doors.get(x, y);
        if (!visual) return false;
        this.sceneBuilder.doors.startSlide(visual, false, performance.now());
        this.audioManager.playDoor('door_close', x, y);
        this.vertexLighting.relight();
        return true;
      },
      snapDoor: (x: number, y: number, open: boolean) => {
        const visual = this.sceneBuilder.doors.get(x, y);
        if (!visual) return;
        this.sceneBuilder.doors.snapOpen(visual, open);
        this.vertexLighting.relight();
        this.renderer.render();
      }
    };
  }

  setupTapToStart() {
    const tapToStart = document.getElementById('tap-to-start')!;
    tapToStart.addEventListener('click', () => {
      this.beginPlay();
    });
    if (this.skipTitle) tapToStart.classList.remove('hidden');
  }

  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;
    const dtSec = Math.min(0.05, deltaTime / 1000);
    this.bubble?.update(now);
    if (this.phase !== 'play') {
      this.renderer.render();
      requestAnimationFrame(() => this.gameLoop());
      return;
    }

    const prevX = this.player.x;
    const prevY = this.player.y;
    this.player.update(deltaTime);

    if (this.combat) {
      this.combat.setPartyPos(this.player.x, this.player.y, this.player.dir);
    }

    if (this.player.x !== prevX || this.player.y !== prevY) {
      this.combat?.noteStep(this.nowSec());
      this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
      this.vertexLighting.updateAllMeshes(this.renderer.scene);
      this.audioManager.checkBones(this.player.x, this.player.y);
      this.updateDoorButton();
    }

    if (this.combat && !this.combat.gameOver) {
      this.applyEvents(this.combat.tick(this.nowSec()));
    }

    if (this.pendingUnlock && now >= this.doorUnlockTimer) {
      const { x, y } = this.pendingUnlock;
      this.pendingUnlock = null;
      const visual = this.sceneBuilder.doors.get(x, y);
      if (visual) {
        this.sceneBuilder.doors.startSlide(visual, true, now);
        this.audioManager.playDoor('door_open', x, y);
        this.vertexLighting.relight();
      }
    }

    this.sceneBuilder.doors.update(now);
    this.dressing.update(now, this.player.x, this.player.y, this.player.dir);
    this.water.update(now);
    this.atmosphere.update(dtSec, now, this.renderer.camera);
    this.audioManager.updateListener(this.player.x, this.player.y, this.player.dir);
    this.props.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale());
    this.audioManager.update(now, this.player.x * CELL_SIZE, this.player.y * CELL_SIZE);

    this.torches.update(now, this.player.x, this.player.y, this.player.dir);
    this.spriteManager.update(now, this.player.x, this.player.y, this.player.dir);
    this.darkFx.update(now, this.vertexLighting, this.spriteManager, this.audioManager, this.player.x, this.player.y);
    this.vertexLighting.setFlickerTime(now);
    this.hud?.draw(now);

    if (this.messageTimer && now >= this.messageTimer) {
      this.messageTimer = 0;
      document.getElementById('message-toast')?.classList.remove('show');
      this.hideNote();
    }

    this.renderer.render();

    this.fpsFrames++;
    if (now - this.fpsLastTime >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      if (this.fpsCounter) this.fpsCounter.textContent = `FPS: ${fps}`;
      this.lastFps = fps;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }

    requestAnimationFrame(() => this.gameLoop());
  }
}

const game = new Game();
game.init().catch((err) => {
  console.error('Failed to initialize game:', err);
  alert(game.story.uiText('status.load_failed'));
});
