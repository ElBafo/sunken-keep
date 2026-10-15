import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
import { AudioManager } from './audio';
import {
  BRIGHT_MAX,
  BRIGHT_MIN,
  CAMERA_SPEC,
  CELL_SIZE,
  DOOR_UNLOCK_LEAD_MS,
  HERO_VOICES,
  OIL_MAX,
  OIL_START,
  OIL_TORCH_COST,
  parseAmbientFloor,
  STEP_VOLUME,
  SWAP_ARM_MS,
  TORCH_IGNITE_FLARE_MS
} from './constants';
import { CombatEngine, HERO_IDS, openGrid, parseRules, Rng, type CombatEvent } from '../core';
import { isSlimeKind, takeSlimeFrostBark } from '../core/slime-frost';
import { livingPairVisual, SLIME_SMALL_PAN } from '../core/slime-pair';
import { Dressing } from './dressing';
import {
  CaveInDirector,
  caveInCrashed,
  caveInFinished,
  dustBurstFrame,
  CAVE_IN_CRASH_AT,
  CAVE_IN_DUST_AT,
  CAVE_IN_DUST_SKIP_FRAME,
  CAVE_IN_SKIP_FADE_SEC,
  CAVE_IN_STATE,
  CAVE_IN_TURN_SEC
} from './cave-in';
import { floor1, floor1CaveIn, floor1Sconces } from './floor-data';
import { oilFlaskPlan, OIL_FLASK_FADE_SEC } from './oil-flask';
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
import { TitleScreen, type TitleAction } from './title';
import { beforePlayRelPaths } from './audio-groups';
import { prefetchRelPaths } from './floor1-prefetch';
import { IntroPlayer } from './intro';
import { enterPlayFromIntro, mountIntroSkip, type IntroSkipHandle } from './intro-skip';
import { interactPropAt, tileBlocksPath } from './wall-props';
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
import { PropBuilder } from './props';
import { resolveLocale, StoryText } from './i18n';
import { applyLetterboxStone, fitGameStage } from './game-stage';
import { loadLayout585 } from './layout585';
import { PartyHud, type GearId, type HandSlot } from './party-hud';
import type { HeroId } from '../constants';
import { PartyBag } from './bag';
import { InventoryUi } from './inventory-ui';
import {
  canEquip,
  equipSfx,
  isReadable,
  journalIntroKey,
  journalTriggerId,
  NOTE_SCROLL_SFX,
  pickupSfx,
  preferredHand
} from './items';
import { NoteReader } from './note-reader';
import { atlasFallbackPaths, coveredSingleFileLoads, ensureAtlases, recordedPngRelPaths } from './atlas';
import { fetchJsonCached } from './asset-cache';
import {
  asHeroId,
  BarkDirector,
  DEFAULT_BARK_RULES,
  type BarkLine,
  type BarkPartyMember,
  type BarkRules
} from './bark-picker';

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
  noteReader!: NoteReader;
  private pendingPotion: 'potion_red' | 'potion_blue' | 'potion_green' | null = null;
  private lootSnap: Array<{ x: number; y: number; item?: string; chest?: boolean; chestItems?: string[]; chestOpen?: boolean }> = [];
  lastMessage = '';
  private lastGuardedAt = 0;
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
  private barkDirector = new BarkDirector();
  private lastBarkFace: { speaker: string; face?: string; listener?: string; listenerFace?: string } | null = null;
  private playStartedAt = 0;
  private combatAudioReady = false;
  private playAccMs = 0;
  private escapeRunActive = false;
  private phase: 'title' | 'intro' | 'play' = 'play';
  private skipTitle = false;
  private pendingStartSnapshot = false;
  private title!: TitleScreen;
  private intro: IntroPlayer | null = null;
  private introSkip: IntroSkipHandle | null = null;
  private bubble: SpeechBubble | null = null;
  private loopStarted = false;
  private titleReady = false;
  private tapPromptReady = false;
  private playReady = false;
  private pendingTap = false;
  private skipIntroRequested = false;
  private caveIn = new CaveInDirector();
  private caveInBusy = false;
  private caveInStartedAt = 0;
  private caveInClockStarted = false;
  private caveInCrashed = false;
  private wantOpeningCaveIn = false;
  private oilDisplay = OIL_START;
  private oilGlugTimers: number[] = [];
  private worldBoot: Promise<void> = Promise.resolve();
  private stageFitWired = false;
  private newGameStarted = false;
  private monsterSync: Promise<void> = Promise.resolve();
  private lastBarkTrigger: string | null = null;
  private pendingNewGameReset = false;
  private enteringPlay = false;
  private floor1PrefetchStarted = false;
  private skipPlayAt = 0;
  private skipToPlayableMs: number | null = null;
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

    this.fitStage();
    void applyLetterboxStone();
    this.audioManager = new AudioManager(this.quality);
    this.setupTapToStart();

    const locale = resolveLocale(params, this.persist);
    document.documentElement.lang = locale;
    await this.story.load(locale);
    await this.loadBarkRules();
    this.setTapStatus('loading');
    if (this.skipTitle) {
      this.storyProgress.startNewGame();
      this.pendingStartSnapshot = true;
      this.wantOpeningCaveIn = true;
    }

    this.worldBoot = this.bootWorld(canvas, params);
    await this.bootTitleChrome();
    this.titleReady = true;
    if (!this.skipTitle) {
      this.phase = 'title';
      this.title.show('title');
      this.fitStage();
      this.tapPromptReady = true;
      this.setTapStatus('tap_to_start');
      this.beginTitleBackgroundLoads();
      if (this.pendingTap) this.consumeTitleTap();
    }
    this.applyStoryLabels();
    if (this.skipTitle) {
      await this.ensurePlayReady();
      this.setTapStatus('tap_to_start');
      if (this.pendingTap) this.consumePlayTap();
    }
    this.exposeDebugApi();
  }

  private setTapStatus(kind: 'loading' | 'tap_to_start') {
    const el = document.getElementById('tap-to-start-text');
    if (!el) return;
    el.textContent = this.story.uiText(kind === 'loading' ? 'status.loading' : 'tap_to_start');
  }

  private flashTapFeedback() {
    const el = document.getElementById('tap-to-start');
    if (!el) return;
    el.classList.add('feedback');
    window.setTimeout(() => el.classList.remove('feedback'), 180);
  }

  private hideTapOverlay() {
    document.getElementById('tap-to-start')?.classList.add('hidden');
  }

  private showTapOverlay(kind: 'loading' | 'tap_to_start') {
    this.setTapStatus(kind);
    document.getElementById('tap-to-start')?.classList.remove('hidden');
  }

  private async withLoading<T>(work: Promise<T>): Promise<T> {
    const el = document.getElementById('tap-to-start');
    const wasHidden = !el || el.classList.contains('hidden');
    this.showTapOverlay('loading');
    try {
      return await work;
    } finally {
      if (wasHidden) this.hideTapOverlay();
      else this.setTapStatus('tap_to_start');
    }
  }

  private consumeTitleTap() {
    this.pendingTap = false;
    this.hideTapOverlay();
    if (this.title && !this.title.visible) this.title.show('title');
    try {
      this.audioManager.playMenu();
    } catch {
      // Host audio can refuse playback after the overlay is already gone.
    }
  }

  private consumePlayTap() {
    this.pendingTap = false;
    this.hideTapOverlay();
    this.beginPlay();
  }

  private async bootTitleChrome() {
    const titleCanvas = document.getElementById('title-canvas') as HTMLCanvasElement | null;
    const introCanvas = document.getElementById('intro-canvas') as HTMLCanvasElement | null;
    const bubbleCanvas = document.getElementById('speech-bubble') as HTMLCanvasElement | null;
    if (bubbleCanvas) this.bubble = new SpeechBubble(bubbleCanvas);
    if (introCanvas) {
      this.intro = new IntroPlayer(introCanvas, this.story);
      this.intro.setTimeSource(() => this.audioManager.introCurrentTime());
      this.intro.setAudioState(() => this.audioManager.introAudioState());
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
      if (!this.skipTitle) {
        await this.title.loadEssential();
        this.title.refreshHint();
      }
    }
    if (!this.skipTitle) await this.audioManager.loadMenuSounds();
  }

  private handleTitleAction(action: TitleAction) {
    if (action.type === 'toast' || action.type === 'language') {
      this.audioManager?.playUi('ui_button_denied');
      if (action.type === 'toast') this.showTitleToast(action.text);
      else void this.setLocale(action.locale);
      return;
    }
    this.audioManager?.playUi('ui_button');
    if (action.type === 'open_load') {
      void this.openLoadSlots();
      return;
    }
    if (action.type === 'new_game') {
      this.leaveGameScreen();
      this.startNewGame();
      return;
    }
    if (action.type === 'continue' || action.type === 'load') {
      this.leaveGameScreen();
      this.title.hide();
      this.audioManager.markPlayStarted();
      void this.runContinue(action.payload);
      return;
    }
    if (action.type === 'save') this.commitSlot(action.slot);
  }

  private async openLoadSlots() {
    await this.withLoading(this.title.loadRest());
    this.title.setMode('load');
  }

  private async runContinue(payload: SavePayload) {
    await this.withLoading(this.ensurePlayReady());
    this.applySave(payload);
    this.beginPlay();
  }

  private async bootWorld(canvas: HTMLCanvasElement, params: URLSearchParams) {
    await this.storyProgress.load(import.meta.env.BASE_URL);
    const layout = await loadLayout585();
    this.renderer = new PixelRenderer(canvas, layout.view[2], layout.view[3]);
    this.fitStage();
    await this.renderer.loadPalette();
    if (params.get('palette') === '0') this.renderer.setPaletteEnabled(false);
    const fpsEl = document.getElementById('fps-counter');
    if (params.get('debug') === '1') {
      const el = fpsEl ?? document.createElement('div');
      el.id = 'fps-counter';
      el.textContent = 'FPS: --';
      el.style.display = 'block';
      if (!fpsEl) (document.getElementById('game-stage') ?? document.body).appendChild(el);
      this.fpsCounter = el;
    } else if (fpsEl) {
      fpsEl.remove();
    }

    this.atmosphere = new Atmosphere(this.quality);
    this.atmosphere.applyFog(this.renderer.scene, this.renderer.renderer);

    this.hud = new PartyHud(this.story, () => this.oilDisplay, layout, {
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
    this.inventory = new InventoryUi(this.story, this.bag, layout.inventoryScreen, {
      equipment: () => this.equipmentState(),
      onUse: (index) => this.useBagSlot(index),
      onEquip: (index, hero, slot) => this.equipBagSlot(index, hero, slot),
      onDrink: (index, hero) => this.drinkBagSlot(index, hero),
      onClose: () => this.closeBag(),
      playUi: (name) => this.audioManager?.playUi(name)
    });
    this.noteReader = new NoteReader(() => this.hideNote());
    const atlases = ensureAtlases();
    const hudReady = this.hud.load();
    void this.inventory.load();
    void this.noteReader.load();
    if (this.bubble) void this.bubble.load();

    this.sceneBuilder = new SceneBuilder();
    await Promise.all([atlases, this.sceneBuilder.loadTextures()]);
    this.sceneBuilder.buildScene(this.renderer.scene, floor1);
    void this.audioManager.loadBeforePlaySounds();

    this.player = new Player(this.renderer.camera, floor1);
    const startX = params.has('x') ? Number(params.get('x')) : floor1.startX;
    const startY = params.has('y') ? Number(params.get('y')) : floor1.startY;
    const startDir = params.has('dir') ? Number(params.get('dir')) : floor1.startDir;
    if (Number.isFinite(startX) && Number.isFinite(startY) && Number.isFinite(startDir)) {
      this.player.setPosition(startX, startY, startDir);
    }

    this.dressing = new Dressing();
    this.water = new WaterSystem();
    this.props = new PropBuilder();
    this.spriteManager = new SpriteManager(this.renderer.camera);
    this.torches = new TorchSystem(this.renderer.camera);
    await Promise.all([
      this.dressing.load().then(() => this.dressing.place(this.renderer.scene, floor1)),
      this.water.load(),
      this.props.load().then(() => this.props.place(this.renderer.scene, floor1)),
      this.spriteManager.loadSprites(this.renderer.scene, floor1, { monsters: false }),
      this.torches.load(this.renderer.scene, floor1Sconces),
      this.initCombat(params),
      hudReady
    ]);

    this.atmosphere.build(this.renderer.scene, floor1, this.dressing);
    this.water.build(this.renderer.scene, floor1, floor1Sconces, this.dressing.marks.sunbeams);

    this.vertexLighting = new VertexLightingManager(floor1, floor1Sconces, {
      floor: parseAmbientFloor(params.get('ambientFloor'), 1),
      bright: this.bright,
      sunbeams: this.dressing.marks.sunbeams,
      oil: () => this.oil
    });
    this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
    this.torches.setParty(this.player.x, this.player.y, this.player.dir);
    this.vertexLighting.registerScene(this.renderer.scene);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);

    this.darkFx = new DarkFx();
    void this.darkFx.load(this.renderer.scene, floor1, this.spriteManager);
    this.loadLampNote();
    this.updateOilHud();
    this.syncPartyHud();
    this.snapshotLoot();
    this.snapshotTiles();
    this.wireTorchChoice();
    this.wireGameOver();
    this.wireInventoryControls();
    this.wireVisibilityAutosave();
    this.renderer.resize();

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

    void this.title?.loadRest();
    void this.audioManager.loadBeforePlaySounds(this.renderer.scene, floor1Sconces);
    if (this.bubble) void this.bubble.load();
    this.updateDoorButton();
  }

  private fitStage() {
    fitGameStage();
    if (this.stageFitWired) return;
    this.stageFitWired = true;
    window.addEventListener('resize', () => fitGameStage());
  }

  private beginTitleBackgroundLoads() {
    this.intro?.preloadShot1();
    void this.title?.loadRest();
    this.beginFloor1BackgroundLoads();
  }

  /** After intro shot 1 is in flight: do not steal the radio from world textures. */
  private beginFloor1BackgroundLoads() {
    if (this.floor1PrefetchStarted) return;
    this.floor1PrefetchStarted = true;
    void this.worldBoot.then(() => {
      void prefetchRelPaths(beforePlayRelPaths(), 8);
      void this.audioManager.loadBeforePlaySounds();
    });
  }

  private async ensureIntroStartReady() {
    await Promise.all([this.intro ? this.intro.whenShot1() : Promise.resolve(), this.audioManager.whenIntroMusic()]);
  }

  private async ensurePlayReady() {
    await this.worldBoot;
    await this.audioManager.loadBeforePlaySounds(this.renderer.scene, floor1Sconces);
    if (this.combat.monsters.length === 0) this.spawnFloorMonsters();
    else this.rebindMonsters();
    this.playReady = true;
  }

  private beginMonsterStreaming() {
    if (!this.spriteManager || !this.renderer) return;
    void this.spriteManager.ensureMonsters(this.renderer.scene, floor1).then(() => this.rebindMonsters());
  }

  private rebindMonsters() {
    this.enqueueMonsterWork(async () => {
      await this.spriteManager.syncLiveMonsters(this.renderer.scene, this.combat.monsters);
      this.darkFx.syncEyes(this.renderer.scene, this.spriteManager, this.combat.monsters, this.audioManager);
      this.syncSlimelingPans();
    });
  }

  private enqueueMonsterWork(work: () => Promise<unknown>) {
    this.monsterSync = Promise.resolve(this.monsterSync)
      .catch(() => undefined)
      .then(work)
      .then(() => undefined);
    return this.monsterSync;
  }

  /** Monsters stay asleep until first-fight audio is in (or the 4s cap). */
  private isCombatAwake() {
    if (this.combatAudioReady) return true;
    if (this.audioManager.isFirstFightUnlocked()) {
      this.combatAudioReady = true;
      return true;
    }
    return false;
  }

  handleMove(result: MoveResult) {
    if (this.phase !== 'play') return;
    if (this.caveInBusy) {
      this.skipCaveIn();
      return;
    }
    this.cancelSwap();
    if (this.combat?.gameOver) return;
    if (result === 'ok') {
      this.playFootstep(this.player.moveToX, this.player.moveToY);
      this.maybeDunkTorch(this.player.moveToX, this.player.moveToY);
      this.fireTileBark(this.player.moveToX, this.player.moveToY);
      this.fireTileTrigger(this.player.moveToX, this.player.moveToY);
      return;
    }
    if (result === 'secret') {
      const { x, y } = this.player.facingPos(1);
      if (this.openSecretAt(x, y)) return;
    }
    if (result === 'busy') return;
    if (result === 'monster') {
      const { x, y } = this.player.facingPos(1);
      if (this.isCombatAwake()) this.applyEvents(this.combat.bump(x, y, this.nowSec()));
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
      this.speakBark('deep_water');
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

  private blockGuardedPickup(kind: string) {
    const text = this.storyLog('item_guarded', { monster: this.story.monsterName(kind) });
    const now = performance.now();
    if (text && this.lastMessage === text && now - this.lastGuardedAt < 1500) return;
    this.lastGuardedAt = now;
    this.showPrompt(text);
    this.audioManager.playUi('item_use_fail');
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
    const guard = this.combat?.monsterAt(x, y);
    if (guard && (tile.item || (tile.chest && !tile.chestOpen))) {
      this.blockGuardedPickup(guard.kind);
      return true;
    }
    if (tile.chest && !tile.chestOpen) return this.lootChest(x, y, tile);
    if (!tile.item) return false;
    const id = tile.item === 'oil' ? 'oil_flask' : tile.item;
    const meta = id === 'journal_page' ? { journalPage: tile.journalPage ?? 1 } : undefined;
    const added = this.bag.add(id, 1, undefined, meta);
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
    const key = id === 'oil_flask' ? 'oil_pickup' : id === 'journal_page' ? 'pickup_scroll' : `pickup_${id}`;
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
    void this.inventory.load().then(() => {
      if (this.phase === 'play') this.inventory.show();
    });
  }

  closeBag() {
    if (!this.inventory?.open) return;
    this.clearPotionPick();
    this.hideNote();
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
      if (slot && isReadable(slot.item)) {
        this.useBagSlot(this.inventory.selected);
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
    if (isReadable(slot.item)) {
      this.readBagSlot(index);
      return;
    }
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
    const plan = oilFlaskPlan(this.oil);
    if (plan.kind === 'full') {
      this.showPrompt(this.storyLog('oil_full'));
      this.inventory.wiggleSlot(index);
      return;
    }
    if (!this.bag.takeAt(index, 1)) return;
    this.clearOilGlugs();
    this.setOil(plan.to, true);
    this.oilDisplay = plan.from;
    this.audioManager.playOilFlask({ fadeAt: plan.fadeAt, fadeSec: OIL_FLASK_FADE_SEC });
    for (const at of plan.glugs) {
      const t = window.setTimeout(() => {
        this.oilDisplay = Math.min(plan.to, this.oilDisplay + 1);
        this.hud?.flashOil();
        this.hud?.draw(performance.now());
        this.updateOilHud();
      }, at * 1000);
      this.oilGlugTimers.push(t as unknown as number);
    }
    this.showMessage(this.storyLog('oil_use', { n: plan.to, max: OIL_MAX }));
    this.inventory.redraw();
  }

  private clearOilGlugs() {
    for (const t of this.oilGlugTimers) clearTimeout(t);
    this.oilGlugTimers = [];
    this.oilDisplay = this.oil;
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
    if (this.tapPromptReady && this.titleReady && !this.skipTitle) this.setTapStatus('tap_to_start');
    if (this.playReady && this.skipTitle) this.setTapStatus('tap_to_start');
    const tap = document.getElementById('tap-to-start-text');
    if (tap && !tap.textContent) tap.textContent = this.story.uiText('status.loading');
    const door = document.getElementById('btn-door');
    if (door) door.textContent = this.story.uiText('controls.door');
    const goTitle = document.getElementById('gameover-title');
    if (goTitle) goTitle.textContent = this.story.uiText('game_over.title');
    const goBody = document.getElementById('gameover-body');
    if (goBody) goBody.textContent = this.story.uiText('game_over.body');
    this.refreshGameOverButtons();
    this.introSkip?.refresh();
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
      fetchJsonCached(`${base}levels/actions.json`),
      fetchJsonCached(`${base}levels/monsters.json`)
    ]);
    const seedRaw = params.get('seed');
    const seed = seedRaw != null && seedRaw !== '' && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : Date.now() >>> 0;
    this.combat = new CombatEngine(parseRules(actions, monsters), new Rng(seed));
    const testMode = params.get('test') === '1';
    const combatOn = params.get('combat') === '1';
    this.combat.setChaseEnabled(!testMode || combatOn);
    this.refreshOccupancy();
    this.player.isOccupiedByMonster = (x, y) => !!this.combat.monsterAt(x, y);
    this.combat.setPartyPos(this.player.x, this.player.y, this.player.dir);
    this.syncEquipmentToCombat();
  }

  private spawnFloorMonsters() {
    this.combat.clearMonsters();
    for (let y = 0; y < floor1.height; y++) {
      for (let x = 0; x < floor1.width; x++) {
        const tile = floor1.tiles[y][x];
        if (!tile.monster) continue;
        const m = this.combat.spawnMonster(tile.monster, x, y, undefined, { split: !!tile.split });
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
          if (e.key === 'slime_frost_resist' && takeSlimeFrostBark(this.flags)) {
            this.speakBark('slime_frost_resist');
          }
          break;
        case 'sfx':
          if (e.name === 'hero_down') break;
          this.audioManager?.playCombat(e.name, e.volume ?? 1, e.x, e.y, e.id);
          if (e.id && e.name.endsWith('_death')) this.audioManager?.clearSlimelingPan(e.id);
          break;
        case 'sfx_stop':
          this.audioManager?.stopWindup(e.id);
          break;
        case 'hit_type':
          this.lastHitType = e.kind;
          this.hud.lastHitType = e.kind;
          this.spriteManager.playHitFx(e.id, e.kind, nowMs);
          if (e.kind === 'resist' && !isSlimeKind(e.monster)) this.hud.armFrostHint();
          break;
        case 'monster_anim':
          this.spriteManager.playAnimId(e.id, e.anim, nowMs);
          break;
        case 'monster_move':
          this.spriteManager.moveMonsterId(e.id, e.to.x, e.to.y);
          this.darkFx.moveEyeById(e.id, e.from.x, e.from.y, e.to.x, e.to.y, this.audioManager);
          break;
        case 'monster_dead':
          this.spriteManager.playAnimId(e.id, 'death', nowMs);
          this.darkFx.removeEyeById(e.id, this.audioManager);
          this.audioManager?.stopWindup(e.id);
          {
            const survivor = this.spriteManager.beginPairSlide(e.id, nowMs);
            if (survivor) this.audioManager?.setSlimelingPan(survivor, 0);
          }
          this.syncSlimeAudio();
          break;
        case 'slime_split':
          {
            const tile = e.kids[0];
            if (tile) {
              this.spriteManager.blockFloorSpawn(tile.x, tile.y);
              this.spriteManager.detachFloorMonsterAt(tile.x, tile.y, 'slime');
            }
            this.spriteManager.disposeMonsterId(e.from);
            this.darkFx.removeEyeById(e.from, this.audioManager);
            if (tile) this.darkFx.removeFloorEyes('slime', tile.x, tile.y, this.audioManager);
            this.enqueueMonsterWork(async () => {
              for (const kid of e.kids) {
                this.spriteManager.blockFloorSpawn(kid.x, kid.y);
                const sprite = await this.spriteManager.addLiveMonster(
                  this.renderer.scene,
                  kid.kind,
                  kid.x,
                  kid.y,
                  kid.id,
                  0,
                  {
                    pairSlot: kid.slot,
                    pairId: e.from
                  }
                );
                if (sprite) this.darkFx.addEyeForHost(this.renderer.scene, sprite);
                this.audioManager?.setSlimelingPan(kid.id, SLIME_SMALL_PAN[kid.slot]);
              }
              this.darkFx.syncEyes(
                this.renderer.scene,
                this.spriteManager,
                this.combat.monsters,
                this.audioManager
              );
              this.syncSlimelingPans();
            });
            this.syncSlimeAudio();
          }
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
          this.syncSlimeAudio();
          break;
        case 'fight_end':
          this.audioManager?.setFightDuck(false);
          this.audioManager?.stopSlimeBattleLoop();
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
            this.markFrostHintDismissed();
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
    this.oilDisplay = this.oil;
  }

  loadAutosave() {
    this.audioManager?.fadeGameOver(300);
    const save = newestAutosave();
    if (save) this.applySave(save);
    else this.restartFloor();
  }

  restartFloor() {
    this.audioManager?.fadeGameOver(300);
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
    this.hud.resetFrostHint();
    this.closeBag();
    this.oilDisplay = this.oil;
    this.resetRubble();
    this.refreshOccupancy();
    this.caveInBusy = false;
    this.caveInClockStarted = false;
    this.caveInCrashed = false;
    this.audioManager?.fadeGameOver(300);
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

  showNote(title?: string, text?: string) {
    const docTitle = title ?? this.lampNote.title;
    const docText = text ?? this.lampNote.text;
    this.lampNote = { title: docTitle, text: docText };
    this.lastMessage = docText;
    const titleEl = document.getElementById('note-title');
    const textEl = document.getElementById('note-text');
    if (titleEl) titleEl.textContent = docTitle;
    if (textEl) textEl.textContent = docText;
    this.noteReader?.show(docTitle, docText);
    document.getElementById('note-overlay')?.classList.add('show');
    document.getElementById('message-toast')?.classList.remove('show');
    this.noteOpen = true;
    this.audioManager?.playUi(NOTE_SCROLL_SFX);
    this.messageTimer = performance.now() + 6000;
  }

  hideNote() {
    this.noteReader?.hide();
    document.getElementById('note-overlay')?.classList.remove('show');
    this.noteOpen = false;
  }

  private readBagSlot(index: number) {
    const slot = this.bag.slots[index];
    if (!slot || !isReadable(slot.item)) return;
    const doc = this.story.readableItem(slot.item, slot.journalPage);
    if (!doc) return;
    if (doc.kind === 'journal') {
      const page = slot.journalPage && slot.journalPage > 0 ? slot.journalPage : 1;
      const introKey = journalIntroKey(page);
      if (this.storyProgress.fire(introKey)) this.showMessage(this.storyLog(introKey));
      this.storyProgress.fire(journalTriggerId(page));
      this.rememberStoryKey(journalTriggerId(page));
    }
    this.showNote(doc.title, doc.text);
  }

  readFacingDesk(): boolean {
    const hit = interactPropAt(
      this.player.floorData.tiles,
      this.player.floorData.width,
      this.player.floorData.height,
      this.player.x,
      this.player.y,
      this.player.dir
    );
    const tile = hit?.tile;
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
    const doc = this.story.lampkeeperNote();
    this.showNote(doc.title, doc.text);
    return true;
  }

  setOil(value: number, keepDisplay = false) {
    const next = Math.min(OIL_MAX, Math.max(0, Math.floor(value)));
    const prev = this.oil;
    this.oil = next;
    if (!keepDisplay) this.oilDisplay = this.oil;
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
      this.showMessage(this.storyLog('torch_capped'));
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
    if (this.caveInBusy) {
      this.skipCaveIn();
      return;
    }
    this.interactCount += 1;
    if (this.noteOpen) {
      this.hideNote();
      this.messageTimer = 0;
      return;
    }
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
    const hit = interactPropAt(
      this.player.floorData.tiles,
      this.player.floorData.width,
      this.player.floorData.height,
      this.player.x,
      this.player.y,
      this.player.dir
    );
    if (!hit) return false;
    const { tile } = hit;
    if (tile.readNote || tile.prop === 'desk') return this.readFacingDesk();
    if (tile.bark) {
      if (this.speakBark(tile.bark)) return true;
    }
    if (tile.prop === 'lamp_capped') {
      this.showMessage(this.storyLog('torch_capped'));
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
    this.audioManager?.fadeGameOver(300);
    this.barkDirector.clearQueue();
    this.bubble?.hide();
    this.audioManager?.clearPreStingSilence();
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
    this.oilDisplay = this.oil;
    this.clearOilGlugs();
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
    this.darkFx.resetEyes(this.audioManager);
    this.rebindMonsters();
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
    this.hud.setFrostHintDismissed(this.flags.has('frost_hint_dismissed'));
    this.clearFlankFlash();
    this.closeBag();
    this.rebuildAudioFromState();
    this.audioManager?.updateListener(this.player.x, this.player.y, this.player.dir);
    this.syncCaveInWorld();
  }

  private refreshOccupancy() {
    if (!this.combat) return;
    this.combat.setOccupancy(
      openGrid(
        (x, y) => tileBlocksPath(floor1.tiles[y]?.[x]),
        floor1.width,
        floor1.height,
        (x, y) => {
          const tile = floor1.tiles[y]?.[x];
          return !!(tile?.deepWater || tile?.shallowWater);
        }
      )
    );
  }

  private caveInDone() {
    return this.flags.has(CAVE_IN_STATE) || this.storyProgress.fired.has(CAVE_IN_STATE);
  }

  private leaveGameScreen() {
    this.caveIn.clearLeaveScreen();
    this.barkDirector.clearQueue();
    this.bubble?.hide();
    this.newGameStarted = false;
    this.enteringPlay = false;
    this.audioManager?.stopSlimeLoops();
    this.audioManager?.clearSlimelingPan();
    this.audioManager?.clearPreStingSilence();
    this.clearOilGlugs();
    if (this.caveInBusy) {
      this.caveInBusy = false;
      this.caveInClockStarted = false;
      this.audioManager?.fadeCaveIn(CAVE_IN_SKIP_FADE_SEC * 1000);
    }
  }

  private resetRubble() {
    const { x, y } = floor1CaveIn.rubble;
    const tile = floor1.tiles[y]?.[x];
    if (tile) tile.wall = false;
    this.sceneBuilder?.clearRubble();
    if (this.sceneBuilder && this.renderer) {
      this.sceneBuilder.setDustBurst(this.renderer.scene, x, y, null);
      this.vertexLighting?.registerScene(this.renderer.scene);
      this.vertexLighting?.relight();
    }
  }

  private applyRubble() {
    const { x, y } = floor1CaveIn.rubble;
    this.sceneBuilder.applyRubbleWall(this.renderer.scene, floor1, x, y);
    this.refreshOccupancy();
    this.vertexLighting.registerScene(this.renderer.scene);
    this.vertexLighting.relight();
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
  }

  private syncCaveInWorld() {
    if (this.caveInDone()) this.applyRubble();
    else {
      this.resetRubble();
      this.refreshOccupancy();
    }
  }

  private maybeStartCaveIn(instant = false) {
    if (this.caveInDone()) {
      this.applyRubble();
      return;
    }
    const spec = floor1CaveIn;
    this.player.setPosition(spec.at.x, spec.at.y, floor1.startDir);
    if (instant) {
      this.completeCaveIn(true);
      return;
    }
    this.caveIn.beginOpening(false);
    this.caveInBusy = true;
    this.caveInClockStarted = false;
    this.caveInCrashed = false;
    this.player.startMove(spec.stepTo.x, spec.stepTo.y, this.player.dir);
  }

  private skipCaveIn() {
    if (!this.caveInBusy) return;
    this.completeCaveIn(false);
  }

  private completeCaveIn(silent: boolean) {
    const spec = floor1CaveIn;
    const skipAt = CAVE_IN_CRASH_AT + CAVE_IN_DUST_AT[CAVE_IN_DUST_SKIP_FRAME - 1];
    this.caveInStartedAt = performance.now() - skipAt * 1000;
    this.player.setPosition(spec.stepTo.x, spec.stepTo.y, spec.endDir);
    this.applyRubble();
    this.sceneBuilder.setDustBurst(
      this.renderer.scene,
      spec.rubble.x,
      spec.rubble.y,
      CAVE_IN_DUST_SKIP_FRAME
    );
    this.audioManager.fadeCaveIn(CAVE_IN_SKIP_FADE_SEC * 1000);
    this.caveInBusy = false;
    this.caveInClockStarted = true;
    this.caveInCrashed = true;
    this.flags.add(CAVE_IN_STATE);
    this.storyProgress.fire(CAVE_IN_STATE);
    if (silent) {
      this.caveIn.clearLeaveScreen();
      return;
    }
    this.speakBark(spec.bark);
    this.caveIn.scheduleBark2(() => {
      this.speakBark('opening_cavein_2');
    });
  }

  private updateCaveIn(now: number) {
    const spec = floor1CaveIn;
    if (this.caveInBusy && !this.caveInClockStarted) {
      if (
        !this.player.isMoving &&
        this.player.x === spec.stepTo.x &&
        this.player.y === spec.stepTo.y
      ) {
        this.caveInClockStarted = true;
        this.caveInStartedAt = now;
        this.audioManager.playCaveIn();
      }
      return;
    }
    if (!this.caveInClockStarted) {
      if (this.caveInCrashed) {
        const t = (now - this.caveInStartedAt) / 1000 - CAVE_IN_CRASH_AT;
        this.sceneBuilder.setDustBurst(this.renderer.scene, spec.rubble.x, spec.rubble.y, dustBurstFrame(t));
      }
      return;
    }
    const elapsed = (now - this.caveInStartedAt) / 1000;
    if (this.caveInBusy && !this.caveInCrashed && caveInCrashed(elapsed)) {
      this.caveInCrashed = true;
      if (this.player.x !== spec.stepTo.x || this.player.y !== spec.stepTo.y || this.player.isMoving) {
        this.player.setPosition(spec.stepTo.x, spec.stepTo.y, this.player.dir);
      }
      this.applyRubble();
      this.sceneBuilder.setDustBurst(this.renderer.scene, spec.rubble.x, spec.rubble.y, dustBurstFrame(0));
      this.player.startMove(spec.stepTo.x, spec.stepTo.y, spec.endDir, CAVE_IN_TURN_SEC * 1000, 'out');
    }
    if (this.caveInCrashed) {
      this.sceneBuilder.setDustBurst(
        this.renderer.scene,
        spec.rubble.x,
        spec.rubble.y,
        dustBurstFrame(elapsed - CAVE_IN_CRASH_AT)
      );
    }
    if (this.caveInBusy && caveInFinished(elapsed)) this.finishCaveInControl();
  }

  private finishCaveInControl() {
    if (!this.caveInBusy) return;
    this.caveInBusy = false;
    this.flags.add(CAVE_IN_STATE);
    this.storyProgress.fire(CAVE_IN_STATE);
    this.speakBark(floor1CaveIn.bark);
    this.caveIn.scheduleBark2(() => this.speakBark('opening_cavein_2'));
  }

  private rebuildAudioFromState() {
    this.audioManager?.stopPresenceLoops();
    this.audioManager?.rebuildFloorLoops({
      oil: this.oil,
      sconces: floor1Sconces,
      leeches: this.combat.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, alive: m.alive })),
      carriedTorch: !!this.hud.carriedTorch()?.lit
    });
    this.syncSlimeAudio();
    this.syncSlimelingPans();
  }

  canAutosave(): boolean {
    if (this.phase !== 'play') return false;
    if (this.caveInBusy) return false;
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
    void this.openSaveSlots();
  }

  private async openSaveSlots() {
    await this.withLoading(this.title.loadRest());
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

  private async loadBarkRules() {
    try {
      const raw = await fetchJsonCached<Partial<BarkRules>>(`${import.meta.env.BASE_URL}bark_rules.json`);
      this.barkDirector.setRules({
        flavour_gap_s: raw.flavour_gap_s ?? DEFAULT_BARK_RULES.flavour_gap_s,
        flavour_min_interval_s: raw.flavour_min_interval_s ?? DEFAULT_BARK_RULES.flavour_min_interval_s,
        min_gap_s: raw.min_gap_s ?? DEFAULT_BARK_RULES.min_gap_s
      });
    } catch {
      this.barkDirector.setRules(DEFAULT_BARK_RULES);
    }
  }

  private partyForBarks(): BarkPartyMember[] {
    return HERO_IDS.map((id) => {
      const hud = this.hud?.heroes[id];
      const combat = this.combat?.heroes[id];
      const hp = combat?.hp ?? hud?.hp ?? 1;
      return { id, downed: !!(hud?.downed || hp <= 0), hp };
    });
  }

  private speakBark(trigger: string, forcedSpeaker?: HeroId) {
    const picked = this.barkDirector.pick(trigger, this.story.barksFor(trigger), {
      nowMs: performance.now(),
      party: this.partyForBarks(),
      flags: this.flags,
      act: 1,
      forcedSpeaker,
      skipRateLimits: !!forcedSpeaker
    });
    if (!picked) return false;
    this.lastBarkTrigger = trigger;
    return this.deliverBark(picked);
  }

  private fireSlimeReveal() {
    for (const s of this.spriteManager.sprites) {
      if (s.kind !== 'monster' || s.monsterKind !== 'slime') continue;
      if (s.hidden || s.disposed || !s.object.visible) continue;
      if (!this.storyProgress.fire('slime_reveal')) return;
      this.speakBark('slime_reveal');
      return;
    }
  }

  private flushBarks(nowMs: number) {
    const picked = this.barkDirector.flush(nowMs);
    if (picked) this.deliverBark(picked);
  }

  private deliverBark(picked: BarkLine) {
    const speaker = asHeroId(picked.speaker);
    const name = this.story.speakerName(picked.speaker);
    this.lastMessage = `${name}: ${picked.text}`;
    this.hud?.pushLog(`${name}: ${picked.text}`);
    void this.bubble?.load().then(() => this.bubble?.show(picked.text, speaker, name));
    this.lastBarkFace = {
      speaker: picked.speaker,
      face: picked.face,
      listener: picked.listener,
      listenerFace: picked.listenerFace
    };
    this.audioManager.playBarkVoice(picked.speaker);
    return true;
  }

  private syncSlimeAudio() {
    const slimes = this.combat.monsters
      .filter((m) => isSlimeKind(m.kind) && m.alive)
      .map((m) => ({ kind: m.kind, x: m.x, y: m.y }));
    this.audioManager?.syncSlimeLoops(slimes, !!this.combat.fight);
  }

  private syncSlimelingPans() {
    this.audioManager?.clearSlimelingPan();
    for (const m of this.combat.monsters) {
      if (m.kind !== 'slime_small' || !m.alive) continue;
      const visual = livingPairVisual(m, this.combat.monsters);
      this.audioManager?.setSlimelingPan(m.id, visual.pairSlot ? SLIME_SMALL_PAN[visual.pairSlot] : 0);
    }
  }

  private fireTileBark(x: number, y: number) {
    const tile = this.player.tileAt(x, y);
    if (!tile?.bark) return;
    const key = `bark:${tile.bark}`;
    if (this.flags.has(key) || !this.storyProgress.fire(tile.bark)) return;
    if (this.speakBark(tile.bark)) this.flags.add(key);
  }

  private fireTileTrigger(x: number, y: number) {
    const tile = this.player.tileAt(x, y);
    if (!tile?.trigger) return;
    const key = `trigger:${tile.trigger}`;
    if (tile.once && this.flags.has(key)) return;
    const fade = !!(tile.ambienceOut || tile.sting);
    const sting = !!tile.sting;
    if (fade || sting) {
      if (tile.once) this.flags.add(key);
      this.audioManager?.fadeToPreStingSilence(1000, sting ? () => this.audioManager?.playSting('sting_slime_lair') : undefined);
    }
  }

  openSecretAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile?.secret || tile.secretOpen) return false;
    tile.secretOpen = true;
    this.flags.add('secret_found');
    this.sceneBuilder.setSecretOpen(this.renderer.scene, x, y, true);
    this.spriteManager.resetItems(floor1);
    this.refreshOccupancy();
    this.vertexLighting.relight();
    if (this.storyProgress.fire('secret_found')) this.showMessage(this.storyLog('secret_found'));
    this.speakBark('secret_wall');
    return true;
  }

  private async setLocale(locale: Locale) {
    saveLocale(locale);
    await this.story.load(locale);
    document.documentElement.lang = locale;
    this.title.story = this.story;
    this.intro?.applyLocale();
    this.introSkip?.refresh();
    await this.title.ensureLogo();
    this.applyStoryLabels();
    this.title.refreshHint();
    this.title.layoutButtons();
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
    if (this.newGameStarted) return;
    this.newGameStarted = true;
    this.wantOpeningCaveIn = true;
    this.enteringPlay = false;
    this.title.hide();
    this.audioManager.markPlayStarted();
    this.skipIntroRequested = false;
    this.pendingNewGameReset = true;
    this.pendingStartSnapshot = true;
    void this.runNewGame();
  }

  private async applyNewGameReset() {
    await this.worldBoot;
    if (!this.pendingNewGameReset) return;
    this.pendingNewGameReset = false;
    this.restoreSconceDefaults();
    this.resetFloorState();
    this.flags.clear();
    this.playAccMs = 0;
    this.playStartedAt = performance.now();
    this.storyProgress.startNewGame();
    this.barkDirector.reset();
    this.lastBarkFace = null;
    this.lastBarkTrigger = null;
    this.journalPages.clear();
    this.dialogue.clear();
    this.floorStates = {};
    this.hud?.resetFrostHint();
    this.pendingStartSnapshot = true;
  }

  private async runNewGame() {
    this.phase = 'intro';
    this.beginTitleBackgroundLoads();
    await this.withLoading(this.ensureIntroStartReady());
    if (this.skipIntroRequested) {
      this.beginPlay();
      return;
    }
    const overlay = document.getElementById('intro-overlay');
    if (overlay && this.intro) {
      this.intro.setNeedShot((waiting) => {
        if (this.skipIntroRequested || this.phase !== 'intro') return;
        if (waiting) this.showTapOverlay('loading');
        else this.hideTapOverlay();
      });
      overlay.classList.add('show');
      this.introSkip?.refresh();
      this.introSkip?.show();
      this.audioManager.crossfadeToIntro();
      this.intro.start();
    } else {
      this.beginPlay();
    }
  }

  private skipIntro() {
    this.skipIntroRequested = true;
    if (!this.skipPlayAt) this.skipPlayAt = performance.now();
    this.intro?.skip();
    enterPlayFromIntro({
      hideSkip: () => this.introSkip?.hide(),
      introOverlay: document.getElementById('intro-overlay'),
      tapToStart: document.getElementById('tap-to-start'),
      alreadyPlaying: this.phase === 'play' || this.enteringPlay,
      beginPlay: () => this.beginPlay()
    });
  }

  private beginPlay() {
    void this.runBeginPlay();
  }

  private async runBeginPlay() {
    if (this.enteringPlay) return;
    this.enteringPlay = true;
    await this.withLoading(this.ensurePlayReady());
    await this.applyNewGameReset();
    if (this.skipPlayAt) this.skipToPlayableMs = Math.round(performance.now() - this.skipPlayAt);
    this.audioManager.armFirstFightCap();
    this.phase = 'play';
    if (!this.playStartedAt) this.playStartedAt = performance.now();
    this.audioManager.markPlayStarted();
    void this.audioManager.startPlayStreaming();
    this.beginMonsterStreaming();
    if (this.storyProgress.fire('enter_floor1')) this.showMessage(this.storyLog('enter_floor1'));
    this.storyProgress.fire('f1_start');
    if (this.pendingStartSnapshot) {
      this.takeFloorSnapshot();
      this.pendingStartSnapshot = false;
    }
    this.audioManager.crossfadeToAct1();
    if (this.wantOpeningCaveIn) {
      this.wantOpeningCaveIn = false;
      this.maybeStartCaveIn(this.skipTitle);
    } else {
      this.syncCaveInWorld();
    }
    this.startLoop();
  }

  private markFrostHintDismissed() {
    this.hud.dismissFrostHint();
    this.flags.add('frost_hint_dismissed');
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
      this.audioManager.attachWaterPools(this.renderer.scene, floor1);
      this.audioManager.attachDressing(this.renderer.scene, this.dressing.marks);
      this.audioManager.startNamedLoop('lamp_hooks', 11 * CELL_SIZE, 0.55, 9 * CELL_SIZE, 0.38, 'named');
      this.rebuildAudioFromState();
      void this.audioManager.startPlayStreaming();
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
      if (this.storyProgress.fire('door_unlocked')) this.showMessage(this.storyLog('door_unlocked'));
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
      boot: () => ({
        titleReady: this.titleReady,
        tapPromptReady: this.tapPromptReady,
        playReady: this.playReady,
        monsters: this.spriteManager?.hasMonsters() ?? false,
        introShot1: this.intro?.hasShot(0) ?? false,
        introMusic: this.audioManager.hasIntroMusic(),
        introStarted: this.intro?.hasStarted() ?? false,
        skipToPlayableMs: this.skipToPlayableMs,
        floor1Prefetch: this.floor1PrefetchStarted,
        pendingBeforePlaySounds: this.audioManager.pendingBeforePlayStems(),
        pendingFirstFightSounds: this.audioManager.pendingFirstFightStems(),
        firstFightUnlocked: this.audioManager.isFirstFightUnlocked(),
        playAgeMs: this.playStartedAt ? Math.round(performance.now() - this.playStartedAt) : null,
        atlasFallbacks: atlasFallbackPaths(),
        atlasLeaks: coveredSingleFileLoads(),
        imagePngs: recordedPngRelPaths()
      }),
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
        this.fireSlimeReveal();
        this.audioManager?.updateListener(this.player.x, this.player.y, this.player.dir);
        this.props?.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale(), this.player.dir);
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
          depthWrite: (s.material as THREE.Material).depthWrite,
          item: s.object.userData.item,
          frames: s.frames?.length ?? 0,
          currentFrame: s.currentFrame,
          lod: s.currentLod ?? null,
          lods: s.lodSets ? Object.keys(s.lodSets) : [],
          v2: !!s.v2,
          hidden: !!s.hidden,
          disposed: !!s.disposed,
          anim: s.anim,
          monsterId: s.monsterId,
          pairSlot: s.pairSlot ?? null
        })),
      spriteScreen: (kind: 'monster' | 'item', x: number, y: number) => {
        this.spriteManager.layoutBillboards(this.player.x, this.player.y, this.player.dir);
        const cam = this.renderer.camera;
        const vw = this.renderer.canvas.width;
        const vh = this.renderer.canvas.height;
        cam.aspect = vw / Math.max(1, vh);
        cam.updateProjectionMatrix();
        const s = this.spriteManager.sprites.find((sp) => sp.kind === kind && sp.x === x && sp.y === y && !sp.hidden);
        const rect = s
          ? {
              ...this.spriteManager.screenRect(s, vw, vh),
              gridX: s.x,
              gridY: s.y,
              player: { x: this.player.x, y: this.player.y, dir: this.player.dir },
              lods: s.lodSets ? Object.keys(s.lodSets) : [],
              view: [vw, vh] as [number, number],
              canvas: [vw, vh] as [number, number],
              renderTarget: [this.renderer.renderTarget.width, this.renderer.renderTarget.height] as [number, number]
            }
          : null;
        this.renderer.render();
        return rect;
      },
      cameraSpec: () => CAMERA_SPEC,
      canvasSize: () => ({
        canvas: [this.renderer.canvas.width, this.renderer.canvas.height] as [number, number],
        renderTarget: [this.renderer.renderTarget.width, this.renderer.renderTarget.height] as [number, number],
        css: [this.renderer.canvas.clientWidth, this.renderer.canvas.clientHeight] as [number, number]
      }),
      gameStage: () => {
        const stage = document.getElementById('game-stage');
        const oil = document.getElementById('oil-readout');
        const toast = document.getElementById('message-toast');
        const box = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom
          };
        };
        const fps = document.getElementById('fps-counter');
        const title = document.getElementById('title-overlay');
        const intro = document.getElementById('intro-overlay');
        const bubble = document.getElementById('speech-bubble');
        return {
          stage: box(stage),
          oil: box(oil),
          toast: box(toast),
          fps: box(fps),
          title: box(title),
          bubble: box(bubble),
          oilInside: !!oil && !!stage?.contains(oil),
          toastInside: !!toast && !!stage?.contains(toast),
          fpsInside: !fps || !!stage?.contains(fps),
          titleInside: !!title && !!stage?.contains(title),
          introInside: !!intro && !!stage?.contains(intro),
          bubbleInside: !!bubble && !!stage?.contains(bubble)
        };
      },
      adjacentMonster: () => {
        const m = this.combat.adjacentMonster();
        return m ? { id: m.id, kind: m.kind, x: m.x, y: m.y, alive: m.alive } : null;
      },
      facingMonster: () => {
        const m = this.combat.facingMonster();
        return m ? { id: m.id, kind: m.kind, x: m.x, y: m.y, alive: m.alive } : null;
      },
      killMonsterAt: (x: number, y: number) => {
        this.applyEvents(this.combat.debugKillAt(x, y, this.nowSec()));
        this.spriteManager.hideMonster(x, y);
        this.spriteManager.layoutBillboards(this.player.x, this.player.y, this.player.dir);
        this.renderer.render();
      },
      killMonsterId: (id: string) => {
        this.applyEvents(this.combat.debugKillId(id, this.nowSec()));
        return !this.combat.monsters.some((m) => m.id === id && m.alive);
      },
      showMonster: (x: number, y: number) => {
        for (const s of this.spriteManager.sprites) {
          if (s.kind === 'monster' && s.x === x && s.y === y) {
            s.hidden = false;
            s.forceLit = true;
            s.object.visible = true;
          }
        }
        this.darkFx.hideEye(x, y, this.audioManager);
        this.spriteManager.layoutBillboards(this.player.x, this.player.y, this.player.dir);
        this.renderer.render();
      },
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
      armFrostHint: () => this.hud.armFrostHint(),
      dismissFrostHint: () => this.markFrostHintDismissed(),
      playStarted: () => this.audioManager.playStarted,
      menuPlaying: () => this.audioManager.isMenuPlaying(),
      gameOverPlaying: () => this.audioManager.isGameOverPlaying(),
      playingLoopNames: () => this.audioManager.loopKit(true).names.slice(),
      handleDoor: (x: number, y: number) => this.handleDoor(x, y),
      floorSnapshotGoals: () => loadFloorSnapshot(FLOOR_NUMBER)?.goals ?? {},
      lastFlank: () => this.lastFlank,
      flashFlank: (side: 'left' | 'right' | 'behind') => this.flashFlank(side),
      partyState: () => this.combat.partyState(),
      lastNote: () => this.lampNote,
      noteOpen: () => this.noteOpen,
      noteScroll: () => this.noteReader?.scroll ?? 0,
      noteMaxScroll: () => this.noteReader?.maxScroll() ?? 0,
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
      giveItem: (id: string, n = 1, journalPage?: number) => {
        this.bag.add(id, n, undefined, journalPage != null ? { journalPage } : undefined);
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
        this.props.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale(), this.player.dir);
        this.renderer.render();
      },
      adjacentScale: () => this.spriteManager.integerAdjacentScale(),
      listenerPose: () => this.audioManager.listenerPose(),
      propTiles: () => {
        const out: Array<{ x: number; y: number; prop: string; placement?: string; wall?: string }> = [];
        for (let y = 0; y < floor1.height; y++) {
          for (let x = 0; x < floor1.width; x++) {
            const tile = floor1.tiles[y][x];
            if (tile.prop) {
              out.push({
                x,
                y,
                prop: tile.prop,
                placement: tile.propPlacement,
                wall: tile.propWall
              });
            }
          }
        }
        return out;
      },
      wallPropDraw: () => this.props.debugWallProps(),
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
      loadFromSlot: async (slot: number) => {
        const data = loadSlot(slot);
        if (!data || data === 'corrupt') return false;
        this.applySave(data);
        await this.monsterSync;
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
      lastBark: () => this.lastBarkFace,
      lastBarkTrigger: () => this.lastBarkTrigger,
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
      showTitle: () => {
        this.leaveGameScreen();
        this.title.show('title');
      },
      caveInBusy: () => this.caveInBusy,
      caveInDone: () => this.caveInDone(),
      skipCaveIn: () => this.skipCaveIn(),
      startCaveIn: () => this.maybeStartCaveIn(false),
      currentSlot: () => this.currentSlot,
      blockReason: (x: number, y: number) => this.player.blockReason(x, y),
      interactFacingProp: () => this.handleFacingProp(),
      swapArmed: () => this.isSwapArmed(),
      swapHighlightCount: () => document.querySelectorAll('.hand-btn.swap-armed').length,
      lastUi: () => this.audioManager.lastUi(),
      lanternLoop: () => this.audioManager.lanternLoop(),
      playLevelUp: (id: HeroId) => this.hud.playLevelUp(id),
      inCombat: () => !!this.combat?.fight,
      combatAwake: () => this.isCombatAwake(),
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
          windup: m.windup?.kind ?? null,
          pairSlot: m.pairSlot ?? null,
          nextAttackAt: m.nextAttackAt
        })),
      setMonsterHp: (id: string, hp: number) => {
        const m = this.combat.monsters.find((x) => x.id === id);
        if (!m) return false;
        m.hp = hp;
        this.applyEvents(this.combat.flushSplits(this.nowSec()));
        return true;
      },
      playMonsterAnim: (id: string, anim: 'idle' | 'attack' | 'hurt' | 'death' | 'windup') => {
        this.spriteManager.playAnimId(id, anim, performance.now());
        const s = this.spriteManager.spriteByMonsterId(id);
        return s ? { anim: s.anim, frame: s.currentFrame } : null;
      },
      whenMonstersSynced: () => this.monsterSync,
      slimelingPan: (id: string) => this.audioManager.slimelingPanOf(id),
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
        if (this.caveInBusy) {
          this.skipCaveIn();
          return 'ok' as const;
        }
        this.cancelSwap();
        this.hideTorchChoice();
        return this.player.turnLeft();
      },
      tryTurnRight: () => {
        if (this.caveInBusy) {
          this.skipCaveIn();
          return 'ok' as const;
        }
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
    tapToStart.classList.remove('hidden');
    const overlayActive = () => !tapToStart.classList.contains('hidden');
    const onTap = (_e: Event) => {
      this.audioManager.unlock();
      if (!overlayActive()) return;
      if (this.phase === 'intro') {
        this.flashTapFeedback();
        return;
      }
      if (this.skipTitle) {
        if (!this.playReady) {
          this.pendingTap = true;
          this.flashTapFeedback();
          return;
        }
        this.consumePlayTap();
        return;
      }
      if (!this.titleReady) {
        this.pendingTap = true;
        this.flashTapFeedback();
        return;
      }
      this.consumeTitleTap();
    };
    tapToStart.addEventListener('pointerdown', onTap);
    tapToStart.addEventListener('pointerup', onTap);
    tapToStart.addEventListener('click', onTap);
    tapToStart.addEventListener('touchstart', onTap, { passive: true });
    const onStageTap = (e: Event) => {
      if (!overlayActive()) return;
      onTap(e);
    };
    const stage = document.getElementById('game-stage');
    const titleCanvas = document.getElementById('title-canvas');
    stage?.addEventListener('pointerdown', onStageTap, true);
    stage?.addEventListener('touchstart', onStageTap, { capture: true, passive: true });
    titleCanvas?.addEventListener('pointerdown', onStageTap);
    titleCanvas?.addEventListener('touchstart', onStageTap, { passive: true });
  }

  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;
    const dtSec = Math.min(0.05, deltaTime / 1000);
    this.bubble?.update(now);
    this.flushBarks(now);
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

    if (this.combat && !this.combat.gameOver && this.isCombatAwake()) {
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
    this.props.layoutAdjacent(this.player.x, this.player.y, this.spriteManager.integerAdjacentScale(), this.player.dir);
    this.audioManager.update(now, this.player.x * CELL_SIZE, this.player.y * CELL_SIZE);

    this.torches.update(now, this.player.x, this.player.y, this.player.dir);
    this.spriteManager.update(now, this.player.x, this.player.y, this.player.dir);
    this.darkFx.update(now, this.vertexLighting, this.spriteManager, this.audioManager, this.player.x, this.player.y);
    this.fireSlimeReveal();
    this.vertexLighting.setFlickerTime(now);
    this.hud?.draw(now);
    this.updateCaveIn(now);

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
