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
import { hasSavedProgress, loadProgress, persistEnabled, saveProgress } from './progress';
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
    this.oil = loadProgress(floor1Sconces, this.persist);

    const locale = resolveLocale(params, this.persist);
    document.documentElement.lang = locale;
    await this.story.load(locale);
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
      onEquip: (index, hero) => this.equipBagSlot(index, hero),
      onClose: () => this.closeBag(),
      playUi: (name) => this.audioManager?.playUi(name)
    });
    await this.inventory.load();
    this.snapshotLoot();
    this.wireTorchChoice();
    this.wireGameOver();
    this.wireInventoryControls();
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

    this.setupTapToStart();
    this.exposeDebugApi();
    this.updateDoorButton();
  }

  handleMove(result: MoveResult) {
    this.cancelSwap();
    if (this.combat?.gameOver) return;
    if (result === 'ok') {
      this.playFootstep(this.player.moveToX, this.player.moveToY);
      this.maybeDunkTorch(this.player.moveToX, this.player.moveToY);
      return;
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
    } else if (tile.shallowWater) {
      this.audioManager.playStep('step_water_shallow');
      this.atmosphere.spawnStepSplash(x * CELL_SIZE, y * CELL_SIZE);
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
    return this.bag.has('key') || this.player.hasKey;
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
    if (stored) {
      this.audioManager.playUi('pickup');
      this.showMessage(this.storyLog('chest_loot_all', { n: stored }));
    }
    this.syncKeyFlag();
    this.inventory?.redraw();
    return true;
  }

  private syncKeyFlag() {
    this.player.hasKey = this.bag.has('key');
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
    }
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

  equipBagSlot(index: number, hero: HeroId) {
    const slot = this.bag.slots[index];
    if (!slot || !canEquip(slot.item, hero)) {
      this.audioManager.playUi('item_use_fail');
      return;
    }
    const taken = this.bag.takeAt(index, 1);
    if (!taken) return;
    const item = taken.item;
    if (item === 'chain_mail') {
      const prev = this.hud.heroes[hero].armour;
      if (prev) this.bag.add(prev);
      this.hud.setArmour(hero, item);
    } else {
      const hand = preferredHand(item);
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
      goSave.hidden = !hasSavedProgress();
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
    this.flankTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 420);
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
    }
    this.oil = OIL_START;
  }

  loadAutosave() {
    this.oil = loadProgress(floor1Sconces, true);
    this.resetFloorState();
  }

  restartFloor() {
    this.restoreSconceDefaults();
    this.resetFloorState();
  }

  private resetFloorState() {
    document.getElementById('gameover')?.classList.remove('show');
    this.perkHooks = [];
    this.perkScreenOpen = false;
    this.hud?.clearReadyArmed();
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
    this.audioManager?.stopPresenceLoops();
    this.audioManager?.clearLeechLoops();
    this.audioManager?.startFloorLoops(this.oil > 0);
    this.audioManager?.syncLeechLoops(floor1);
    for (const sconce of floor1Sconces) {
      if (sconce.lit) this.audioManager?.startTorchLoop(sconce);
      else this.audioManager?.stopTorchLoop(sconce);
    }
    this.lastHitType = null;
    this.hud.hideFrostHint();
    this.restoreLoot();
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
    this.interactCount += 1;
    if (this.inventory?.open) {
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
      const text = this.story.bark(tile.bark);
      if (text) {
        this.showMessage(text);
        return true;
      }
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
        this.showPrompt(this.storyLog('door_locked'));
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
    const start = async () => {
      tapToStart.classList.add('hidden');
      this.audioManager.unlock();
      this.lastTime = performance.now();
      this.fpsLastTime = this.lastTime;
      requestAnimationFrame(() => this.gameLoop());
      this.audioManager.startLanternLoop(this.oil > 0);
      try {
        await this.audioManager.loadSounds(this.renderer.scene, floor1Sconces);
        this.audioManager.startLanternLoop(this.oil > 0);
        this.audioManager.attachDressing(this.renderer.scene, this.dressing.marks);
        this.audioManager.attachLeeches(this.renderer.scene, floor1);
        this.audioManager.attachWaterPools(this.renderer.scene, floor1);
        this.audioManager.startNamedLoop(
          'lamp_hooks',
          11 * CELL_SIZE,
          0.55,
          9 * CELL_SIZE,
          0.38,
          'named'
        );
      } catch (err) {
        console.warn('Audio init failed', err);
        this.audioManager.startLanternLoop(this.oil > 0);
      }
    };
    tapToStart.addEventListener('click', start);
  }

  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;
    const dtSec = Math.min(0.05, deltaTime / 1000);

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
