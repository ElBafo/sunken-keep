import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
import { AudioManager } from './audio';
import {
  BRIGHT_MAX,
  BRIGHT_MIN,
  CELL_SIZE,
  DOOR_UNLOCK_LEAD_MS,
  OIL_FLASK,
  OIL_MAX,
  OIL_START,
  OIL_TORCH_COST,
  parseAmbientFloor,
  STEP_VOLUME,
  SWAP_ARM_MS,
  TORCH_IGNITE_FLARE_MS
} from './constants';
import { Dressing } from './dressing';
import { floor1, floor1Sconces } from './floor-data';
import { InputManager } from './input';
import { MoveResult, Player } from './player';
import { loadProgress, persistEnabled, saveProgress } from './progress';
import { qualityFromSearch, QualityLevel } from './quality';
import { PixelRenderer } from './renderer';
import { SceneBuilder } from './scene-builder';
import { SpriteManager } from './sprites';
import { TorchSystem, torchWorldPos } from './torches';
import { Sconce } from './types';
import { VertexLightingManager } from './vertex-lighting';
import { WaterSystem } from './water';
import { DarkFx } from './dark-fx';
import { PropBuilder } from './props';
import { StoryText } from './i18n';
import { loadLayout585 } from './layout585';
import { PartyHud, type GearId, type HandSlot } from './party-hud';
import type { HeroId } from '../constants';

export interface BagEntry {
  item: GearId;
  count: number;
  from?: { hero: HeroId; hand: HandSlot };
}

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
  private torchChoice: { sconce: Sconce } | null = null;
  private swapSconce: Sconce | null = null;
  private swapUntil = 0;
  private swapTimer: ReturnType<typeof setTimeout> | null = null;
  bag: BagEntry[] = [];
  lastMessage = '';
  lampNote = { title: '', text: '' };
  noteOpen = false;
  interactCount = 0;
  messageTimer = 0;

  lastTime = 0;
  fpsCounter = document.getElementById('fps-counter')!;
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

    await this.story.load('en');
    this.applyStoryLabels();

    const layout = await loadLayout585();
    this.renderer = new PixelRenderer(canvas, layout.view[2], layout.view[3]);
    await this.renderer.loadPalette();
    if (params.get('palette') === '0') this.renderer.setPaletteEnabled(false);
    if (params.get('debug') === '1') this.fpsCounter.style.display = 'block';

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
      }
    });
    this.loadLampNote();
    this.updateOilHud();
    await this.hud.load();
    this.wireTorchChoice();
    this.renderer.resize();

    this.audioManager = new AudioManager(this.renderer.camera, this.quality);
    await this.audioManager.init();
    this.atmosphere.setSplashHandler((x, y, z) => this.audioManager.playDrip(x, y, z));

    this.inputManager = new InputManager(this.player, {
      onMove: (result) => {
        this.cancelSwap();
        this.hideTorchChoice();
        this.handleMove(result);
      },
      onInteract: () => this.interact()
    });

    this.setupTapToStart();
    this.exposeDebugApi();
    this.updateDoorButton();
  }

  handleMove(result: MoveResult) {
    this.cancelSwap();
    if (result === 'ok') {
      this.playFootstep(this.player.moveToX, this.player.moveToY);
      this.maybeDunkTorch(this.player.moveToX, this.player.moveToY);
      return;
    }
    if (result === 'busy') return;
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

  showMessage(text: string) {
    if (!text) return;
    this.lastMessage = text;
    this.hud?.pushLog(text);
    const el = document.getElementById('message-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    this.messageTimer = performance.now() + 1200;
  }

  private storyLog(key: string, vars?: Record<string, string | number>): string {
    return this.story.log(key, vars);
  }

  pickupKeyAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile || tile.item !== 'key' || this.player.hasKey) return false;
    tile.item = undefined;
    this.player.hasKey = true;
    this.spriteManager.hideItemAt(x, y);
    this.darkFx.hideItemAt(x, y);
    this.audioManager.playUi('key', 0.8);
    this.showMessage(this.storyLog('pickup_key'));
    return true;
  }

  pickupOilAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile || (tile.item !== 'oil' && tile.item !== 'oil_flask')) return false;
    tile.item = undefined;
    this.spriteManager.hideItemAt(x, y);
    this.audioManager.playUi('oil_pickup');
    window.setTimeout(() => this.audioManager.playUi('lantern_refill'), 280);
    const wasEmpty = this.oil <= 0;
    this.oil = Math.min(OIL_MAX, this.oil + OIL_FLASK);
    if (wasEmpty) this.audioManager.startLanternLoop(true);
    this.updateOilHud();
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
    this.showMessage(wasEmpty ? this.storyLog('lantern_lit') : this.storyLog('oil_pickup'));
    return true;
  }

  private applyStoryLabels() {
    const tap = document.getElementById('tap-to-start-text');
    if (tap) tap.textContent = this.story.uiText('tap_to_start');
    const door = document.getElementById('btn-door');
    if (door) door.textContent = this.story.uiText('controls.door');
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
    if (prev > 0 && next <= 0) this.showMessage(this.storyLog('lantern_out'));
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
      this.showMessage(this.storyLog('no_oil'));
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

  interact() {
    this.interactCount += 1;
    if (this.cancelSwap()) return;
    if (this.torchChoice) {
      this.hideTorchChoice();
      return;
    }
    if (this.pickupKeyAt(this.player.x, this.player.y)) return;
    if (this.pickupOilAt(this.player.x, this.player.y)) return;
    const facing = this.player.facingPos(1);
    if (this.pickupKeyAt(facing.x, facing.y)) return;
    if (this.pickupOilAt(facing.x, facing.y)) return;
    if (this.handleFacingTorch()) return;
    if (this.readFacingDesk()) return;

    const ahead = this.doorAhead();
    if (ahead)     this.handleDoor(ahead.x, ahead.y);
    else this.hideNote();
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
    const i = this.bag.findIndex((slot) => slot.from?.hero === hero && slot.from?.hand === hand);
    if (i < 0) return null;
    const [slot] = this.bag.splice(i, 1);
    return slot.item;
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
      this.bag.push({ item: current, count: 1, from: { hero, hand } });
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
      this.showMessage(this.story.uiText('torch_choice.hands_full') || this.storyLog('hands_full'));
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
    return this.hud.useHand(hero, hand);
  }

  handleDoor(x: number, y: number) {
    const ahead = this.doorAhead();
    if (!ahead || ahead.x !== x || ahead.y !== y) return;
    const visual = this.sceneBuilder.doors.get(x, y);
    if (!visual || visual.busy || this.pendingUnlock) return;
    const tile = visual.tile;
    if (tile.doorLocked && !tile.doorOpen) {
      if (!this.player.hasKey) {
        this.audioManager.playDoor('door_locked', x, y);
        this.showMessage(this.storyLog('door_locked'));
        return;
      }
      this.player.hasKey = false;
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
        this.updateDoorButton();
        this.renderer.render();
      },
      getPosition: () => ({ x: this.player.x, y: this.player.y, dir: this.player.dir }),
      sprites: () =>
        this.spriteManager.sprites.map((s) => ({
          x: s.x,
          y: s.y,
          kind: s.kind,
          world: s.object.position.toArray(),
          scale: s.object.scale.toArray(),
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
      setHeroHp: (id: HeroId, hp: number) => this.hud.setHeroHp(id, hp),
      setHand: (id: HeroId, hand: HandSlot, item: string) => this.hud.setHand(id, hand, item as never),
      getHands: () => this.hud.getHands(),
      useHand: (id: HeroId, hand: HandSlot) => this.useHand(id, hand),
      lastHand: () => this.hud.lastHand,
      handTapCount: () => this.hud.handTapCount,
      carriedTorch: () => this.hud.carriedTorch(),
      hasCarriedTorchLight: () => this.vertexLighting.hasCarriedTorch(),
      getBag: () => this.bag.map((slot) => ({ ...slot, from: slot.from ? { ...slot.from } : undefined })),
      swapArmed: () => this.isSwapArmed(),
      swapHighlightCount: () => document.querySelectorAll('.hand-btn.swap-armed').length,
      lastUi: () => this.audioManager.lastUi(),
      lanternLoop: () => this.audioManager.lanternLoop(),
      playLevelUp: (id: HeroId) => this.hud.playLevelUp(id),
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
          0.38
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

    if (this.player.x !== prevX || this.player.y !== prevY) {
      this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
      this.vertexLighting.updateAllMeshes(this.renderer.scene);
      this.audioManager.checkBones(this.player.x, this.player.y);
      this.updateDoorButton();
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
    this.audioManager.update(now, this.renderer.camera.position.x, this.renderer.camera.position.z);

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
      this.fpsCounter.textContent = `FPS: ${fps}`;
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
