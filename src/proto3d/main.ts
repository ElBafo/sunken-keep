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
  oilPickupText = 'Oil flask. Wren\'s lantern drinks it.';
  private logLines = new Map<string, string>();
  lastMessage = '';
  lampNote = { title: "Lamp-keeper's note", text: '' };
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

    this.renderer = new PixelRenderer(canvas);
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
    this.updateOilHud();
    await Promise.all([this.loadLogText(), this.loadLampNote()]);

    this.audioManager = new AudioManager(this.renderer.camera, this.quality);
    await this.audioManager.init();
    this.atmosphere.setSplashHandler((x, y, z) => this.audioManager.playDrip(x, y, z));

    this.inputManager = new InputManager(this.player, {
      onMove: (result) => this.handleMove(result),
      onInteract: () => this.interact()
    });

    this.setupTapToStart();
    this.exposeDebugApi();
    this.updateDoorButton();
  }

  handleMove(result: MoveResult) {
    if (result === 'ok') {
      this.playFootstep(this.player.moveToX, this.player.moveToY);
      return;
    }
    if (result === 'busy') return;
    this.audioManager.playUi('bump', 0.65);
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
    this.lastMessage = text;
    const el = document.getElementById('message-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    this.messageTimer = performance.now() + 1200;
  }

  pickupKeyAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile || tile.item !== 'key' || this.player.hasKey) return false;
    tile.item = undefined;
    this.player.hasKey = true;
    this.spriteManager.hideItemAt(x, y);
    this.darkFx.hideItemAt(x, y);
    this.audioManager.playUi('key', 0.8);
    this.showMessage('Key.');
    return true;
  }

  pickupOilAt(x: number, y: number): boolean {
    const tile = this.player.tileAt(x, y);
    if (!tile || (tile.item !== 'oil' && tile.item !== 'oil_flask')) return false;
    tile.item = undefined;
    this.spriteManager.hideItemAt(x, y);
    this.audioManager.playUi('oil_pickup', 0.85);
    window.setTimeout(() => this.audioManager.playUi('lantern_refill', 0.8), 280);
    const wasEmpty = this.oil <= 0;
    this.oil = Math.min(OIL_MAX, this.oil + OIL_FLASK);
    if (wasEmpty) this.audioManager.startLanternLoop(true);
    this.updateOilHud();
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
    this.showMessage(this.oilPickupText);
    return true;
  }

  updateOilHud() {
    const el = document.getElementById('oil-readout');
    if (!el) return;
    el.textContent = `Oil ${this.oil}/${OIL_MAX}`;
  }

  async loadLogText() {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}log.json`);
      const lines = (await res.json()) as Array<{ key: string; text: string }>;
      for (const line of lines) this.logLines.set(line.key, line.text);
      const oil = this.logLines.get('oil_pickup');
      if (oil) this.oilPickupText = oil;
    } catch {
      // keep fallback
    }
  }

  private logLine(key: string, replacements?: Record<string, string>): string {
    let text = this.logLines.get(key) ?? '';
    if (!text && key === 'torch_snuffed') text = '{hero} snuffs the torch. It hisses.';
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }

  async loadLampNote() {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}story/note_lampkeeper.json`);
      const note = (await res.json()) as { title?: string; text?: string };
      if (note.title) this.lampNote.title = note.title;
      if (note.text) this.lampNote.text = note.text;
    } catch {
      this.lampNote.text =
        "They took the lamps first. Then the oil. Thane's orders. I kept one. Don't tell him. - Pell, lamp-keeper";
    }
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
      this.audioManager.playUi('oil_empty', 0.85);
      this.audioManager.startLanternLoop(false);
    } else if (prev <= 0 && next > 0) {
      this.audioManager.startLanternLoop(true);
    }
    this.updateOilHud();
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
  }

  handleFacingTorch(): boolean {
    const sconce = this.torches.facingTorch(this.player.x, this.player.y, this.player.dir);
    if (!sconce) return false;
    if (sconce.capped) {
      this.audioManager.playDoor('door_locked', sconce.x, sconce.y);
      this.showMessage('Sealed.');
      return true;
    }
    if (this.torches.isTapLocked(sconce)) return true;
    if (sconce.lit) {
      this.snuffTorch(sconce);
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
    this.audioManager.playPositional('torch_extinguish', pos.x, pos.y, pos.z, 0.7);
    this.audioManager.stopTorchLoop(sconce);
    saveProgress(floor1Sconces, this.oil, this.persist);
    this.showMessage(this.logLine('torch_snuffed', { hero: 'Wren' }));
  }

  private relightTorch(sconce: Sconce) {
    if (sconce.lit) return;
    if (this.oil < OIL_TORCH_COST) {
      this.showMessage('No oil to spare.');
      return;
    }
    const now = performance.now();
    this.torches.ignite(sconce, now);
    this.vertexLighting.relight();
    const pos = torchWorldPos(sconce);
    this.audioManager.playPositional('torch_ignite', pos.x, pos.y, pos.z, 0.8);
    window.setTimeout(() => this.audioManager.startTorchLoop(sconce), TORCH_IGNITE_FLARE_MS);
    this.setOil(this.oil - OIL_TORCH_COST);
    this.water.addSconceGlint(sconce);
  }

  interact() {
    this.interactCount += 1;
    if (this.pickupKeyAt(this.player.x, this.player.y)) return;
    if (this.pickupOilAt(this.player.x, this.player.y)) return;
    const facing = this.player.facingPos(1);
    if (this.pickupKeyAt(facing.x, facing.y)) return;
    if (this.pickupOilAt(facing.x, facing.y)) return;
    if (this.handleFacingTorch()) return;
    if (this.readFacingDesk()) return;

    const ahead = this.doorAhead();
    if (ahead) this.handleDoor(ahead.x, ahead.y);
    else this.hideNote();
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
        this.showMessage('Locked.');
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
        this.player.setPosition(x, y, dir);
        this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
        this.vertexLighting.updateAllMeshes(this.renderer.scene);
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
      snuffFacing: () => this.handleFacingTorch(),
      tryMoveForward: () => {
        const before = { x: this.player.x, y: this.player.y };
        const result = this.player.moveForward();
        this.handleMove(result);
        const dest = this.player.isMoving
          ? { x: this.player.moveToX, y: this.player.moveToY, dir: this.player.moveToDir }
          : { x: this.player.x, y: this.player.y, dir: this.player.dir };
        return { result, before, after: dest };
      },
      tryTurnLeft: () => this.player.turnLeft(),
      tryTurnRight: () => this.player.turnRight(),
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
  alert('Failed to load game. Check console for details.');
});
