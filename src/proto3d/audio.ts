import * as THREE from 'three';
import {
  CELL_SIZE,
  DARK_AMB_DUCK_DB,
  FACE_INTO_ROOM,
  SCONCE_FRONT_OFFSET_TILES,
  WATER_SURFACE_Y,
  isWaterTile
} from './constants';
import { QUALITY_PRESETS, QualityLevel } from './quality';
import { DressingMarks } from './dressing';
import { FloorData, Sconce } from './types';

const FAR_KEYS = ['far_draught', 'far_groan', 'far_pebbles', 'far_rumble'] as const;

interface PositionalVoice {
  audio: THREE.PositionalAudio;
  object: THREE.Object3D;
  loop: boolean;
  baseVolume: number;
  kind: 'torch' | 'drip' | 'far' | 'door' | 'chain' | 'banner' | 'wind' | 'bones' | 'leech' | 'water' | 'presence';
}

export class AudioManager {
  listener: THREE.AudioListener;
  quality: QualityLevel;
  private buffers = new Map<string, AudioBuffer>();
  private uiSound: THREE.Audio | null = null;
  private ambientSound: THREE.Audio | null = null;
  private musicSound: THREE.Audio | null = null;
  private voices: PositionalVoice[] = [];
  private dripPool: PositionalVoice[] = [];
  private farVoice: PositionalVoice | null = null;
  private lastFar: string | null = null;
  private nextFarAt = 0;
  private nextChainAt = 0;
  private nextBannerAt = 0;
  private chainMarks: DressingMarks['chains'] = [];
  private bannerMarks: DressingMarks['banners'] = [];
  private boneMarks: DressingMarks['bones'] = [];
  private heardBones = new Set<string>();
  private scratchDist: number[] = [];
  private loaded = false;
  private uiPool: THREE.Audio[] = [];
  private lanternSound: THREE.Audio | null = null;
  private lanternMode: 'oil' | 'ember' | 'off' = 'off';
  private scene: THREE.Scene | null = null;
  private trueDark = false;
  private namedLoops = new Map<string, PositionalVoice>();
  private nextLoopId = 1;
  private readonly ambVolume = 0.32;
  private readonly musicVolume = 0.3;

  constructor(camera: THREE.Camera, quality: QualityLevel) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.quality = quality;
  }

  async init() {
    return Promise.resolve();
  }

  unlock() {
    const ctx = this.listener.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  private async loadBuffer(loader: THREE.AudioLoader, path: string): Promise<AudioBuffer> {
    const baseUrl = import.meta.env.BASE_URL;
    return new Promise((resolve, reject) => {
      loader.load(`${baseUrl}${path}`, resolve, undefined, reject);
    });
  }

  async loadSounds(scene: THREE.Scene, sconces: readonly Sconce[]) {
    if (this.loaded) return;
    const loader = new THREE.AudioLoader();
    const files: Array<[string, string]> = [
      ['ambience', 'audio/amb_flooded_halls_loop.mp3'],
      ['torch', 'audio/sfx_torch_loop.mp3'],
      ['drip1', 'audio/sfx_drip_1.mp3'],
      ['drip2', 'audio/sfx_drip_2.mp3'],
      ['drip3', 'audio/sfx_drip_3.mp3'],
      ['drip4', 'audio/sfx_drip_4.mp3'],
      ['bump', 'audio/sfx_bump.mp3'],
      ['key', 'audio/sfx_key.mp3'],
      ['door_open', 'proto3d/sfx_door_open.mp3'],
      ['door_close', 'proto3d/sfx_door_close.mp3'],
      ['door_locked', 'proto3d/sfx_door_locked.mp3'],
      ['door_unlock', 'proto3d/sfx_door_unlock.mp3'],
      ['far_draught', 'proto3d/sfx_far_draught.mp3'],
      ['far_groan', 'proto3d/sfx_far_groan.mp3'],
      ['far_pebbles', 'proto3d/sfx_far_pebbles.mp3'],
      ['far_rumble', 'proto3d/sfx_far_rumble.mp3'],
      ['chain1', 'audio/sfx_chain_sway_1.mp3'],
      ['chain2', 'audio/sfx_chain_sway_2.mp3'],
      ['crack_wind', 'audio/sfx_crack_wind_loop.mp3'],
      ['banner', 'audio/sfx_banner_flutter.mp3'],
      ['bones', 'audio/sfx_bones_settle.mp3'],
      ['music_act1', 'audio/music_act1_loop.mp3'],
      ['leech_idle', 'audio/sfx_bog_leeches_idle_loop.mp3'],
      ['step', 'audio/sfx_step.mp3'],
      ['step_water_shallow', 'audio/sfx_step_water_shallow.mp3'],
      ['step_water_deep', 'audio/sfx_step_water_deep.mp3'],
      ['water_lap', 'audio/sfx_water_lap_loop.mp3'],
      ['torch_ignite', 'audio/sfx_torch_ignite.mp3'],
      ['oil_pickup', 'audio/sfx_oil_pickup.mp3'],
      ['oil_empty', 'audio/sfx_oil_empty.mp3'],
      ['lantern_refill', 'audio/sfx_lantern_refill.mp3'],
      ['lantern_loop', 'audio/sfx_lantern_loop.mp3'],
      ['lantern_ember_loop', 'audio/sfx_lantern_ember_loop.mp3'],
      ['dark_presence', 'audio/sfx_dark_presence_loop.mp3'],
      ['glint', 'audio/sfx_glint.mp3'],
      ['lamp_hooks', 'audio/sfx_lamp_hooks_loop.mp3']
    ];

    const results = await Promise.all(
      files.map(async ([name, path]) => {
        const buf = await this.loadBuffer(loader, path);
        return [name, buf] as const;
      })
    );
    for (const [name, buf] of results) this.buffers.set(name, buf);

    const amb = this.buffers.get('ambience');
    if (amb) {
      this.ambientSound = new THREE.Audio(this.listener);
      this.ambientSound.setBuffer(amb);
      this.ambientSound.setLoop(true);
      this.ambientSound.setVolume(0.32);
      this.ambientSound.play();
    }

    const music = this.buffers.get('music_act1');
    if (music) {
      this.musicSound = new THREE.Audio(this.listener);
      this.musicSound.setBuffer(music);
      this.musicSound.setLoop(true);
      this.musicSound.setVolume(0.3);
      this.musicSound.play();
    }

    this.uiSound = new THREE.Audio(this.listener);
    this.uiPool.push(this.uiSound);
    this.scene = scene;

    const torchBuf = this.buffers.get('torch');
    if (torchBuf) {
      for (const sconce of sconces) {
        if (!sconce.lit) continue;
        this.startTorchLoop(sconce);
      }
    }

    for (let i = 0; i < 5; i++) {
      const object = new THREE.Object3D();
      const audio = new THREE.PositionalAudio(this.listener);
      audio.setRefDistance(2.4);
      audio.setMaxDistance(9);
      audio.setRolloffFactor(1);
      object.add(audio);
      scene.add(object);
      const voice: PositionalVoice = { audio, object, loop: false, baseVolume: 0.45, kind: 'drip' };
      this.dripPool.push(voice);
      this.voices.push(voice);
    }

    const farObj = new THREE.Object3D();
    const farAudio = new THREE.PositionalAudio(this.listener);
    farAudio.setRefDistance(6);
    farAudio.setMaxDistance(22);
    farAudio.setRolloffFactor(0.8);
    farObj.add(farAudio);
    scene.add(farObj);
    this.farVoice = { audio: farAudio, object: farObj, loop: false, baseVolume: 0.35, kind: 'far' };
    this.voices.push(this.farVoice);
    this.nextFarAt = performance.now() + 8000 + Math.random() * 10000;
    this.nextChainAt = performance.now() + 8000 + Math.random() * 12000;
    this.nextBannerAt = performance.now() + 10000 + Math.random() * 15000;

    this.loaded = true;
  }

  attachLeeches(scene: THREE.Scene, floorData: FloorData) {
    const buf = this.buffers.get('leech_idle');
    if (!buf) return;
    const range = 2 * CELL_SIZE;
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (tile.monster !== 'bog_leeches') continue;
        const floorY = tile.deepWater || tile.shallowWater ? WATER_SURFACE_Y : 0;
        const object = new THREE.Object3D();
        object.position.set(x * CELL_SIZE, floorY + 0.2, y * CELL_SIZE);
        const audio = new THREE.PositionalAudio(this.listener);
        audio.setBuffer(buf);
        audio.setRefDistance(CELL_SIZE);
        audio.setMaxDistance(range);
        audio.setRolloffFactor(1);
        audio.setLoop(true);
        audio.setVolume(0.4);
        object.add(audio);
        scene.add(object);
        audio.play();
        this.voices.push({ audio, object, loop: true, baseVolume: 0.4, kind: 'leech' });
      }
    }
  }

  attachWaterPools(scene: THREE.Scene, floorData: FloorData) {
    const buf = this.buffers.get('water_lap');
    if (!buf) return;
    const { tiles, width, height } = floorData;
    const seen = new Set<string>();
    const dirs: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isWaterTile(tiles[y][x])) continue;
        const start = `${x},${y}`;
        if (seen.has(start)) continue;
        const cells: Array<[number, number]> = [];
        const stack: Array<[number, number]> = [[x, y]];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const k = `${cx},${cy}`;
          if (seen.has(k)) continue;
          const tile = tiles[cy]?.[cx];
          if (!tile || !isWaterTile(tile)) continue;
          seen.add(k);
          cells.push([cx, cy]);
          for (const [dx, dy] of dirs) stack.push([cx + dx, cy + dy]);
        }
        let sx = 0;
        let sy = 0;
        for (const [cx, cy] of cells) {
          sx += cx;
          sy += cy;
        }
        const object = new THREE.Object3D();
        object.position.set((sx / cells.length) * CELL_SIZE, WATER_SURFACE_Y, (sy / cells.length) * CELL_SIZE);
        const audio = new THREE.PositionalAudio(this.listener);
        audio.setBuffer(buf);
        audio.setRefDistance(2 * CELL_SIZE);
        audio.setMaxDistance(6 * CELL_SIZE);
        audio.setRolloffFactor(1);
        audio.setLoop(true);
        audio.setVolume(0.35);
        object.add(audio);
        scene.add(object);
        audio.play();
        this.voices.push({ audio, object, loop: true, baseVolume: 0.35, kind: 'water' });
      }
    }
  }

  attachDressing(scene: THREE.Scene, marks: DressingMarks) {
    this.chainMarks = marks.chains;
    this.bannerMarks = marks.banners;
    this.boneMarks = marks.bones;
    const windBuf = this.buffers.get('crack_wind');
    if (!windBuf) return;
    for (const beam of marks.sunbeams) {
      const object = new THREE.Object3D();
      object.position.set(beam.wx, beam.wy, beam.wz);
      const audio = new THREE.PositionalAudio(this.listener);
      audio.setBuffer(windBuf);
      audio.setRefDistance(2.8);
      audio.setMaxDistance(11);
      audio.setRolloffFactor(1);
      audio.setLoop(true);
      audio.setVolume(0.28);
      object.add(audio);
      scene.add(object);
      audio.play();
      this.voices.push({ audio, object, loop: true, baseVolume: 0.28, kind: 'wind' });
    }
  }

  playUi(name: string, volume = 0.7, rate = 1) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    let sound = this.uiPool.find((a) => !a.isPlaying);
    if (!sound) {
      sound = new THREE.Audio(this.listener);
      this.uiPool.push(sound);
    }
    sound.setBuffer(buf);
    sound.setPlaybackRate(rate);
    sound.setVolume(Math.min(1, Math.max(0, volume)));
    sound.play();
  }

  playStep(name: 'step' | 'step_water_shallow' | 'step_water_deep') {
    const rate = 0.96 + Math.random() * 0.08;
    const db = -2 + Math.random() * 4;
    const volume = 10 ** (db / 20);
    this.playUi(name, volume, rate);
  }

  setTrueDark(on: boolean) {
    if (this.trueDark === on) return;
    this.trueDark = on;
    const duck = 10 ** (-DARK_AMB_DUCK_DB / 20);
    if (this.ambientSound) this.ambientSound.setVolume(on ? this.ambVolume * duck : this.ambVolume);
    if (this.musicSound) this.musicSound.setVolume(on ? 0.15 : this.musicVolume);
  }

  startNamedLoop(name: string, x: number, y: number, z: number, volume: number): string {
    const id = `loop-${this.nextLoopId++}`;
    const buf = this.buffers.get(name);
    const scene = this.scene;
    if (!buf || !scene) return id;
    const object = new THREE.Object3D();
    object.position.set(x, y, z);
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buf);
    audio.setRefDistance(2.2);
    audio.setMaxDistance(10);
    audio.setRolloffFactor(1);
    audio.setLoop(true);
    audio.setVolume(volume);
    object.add(audio);
    scene.add(object);
    audio.play();
    const voice: PositionalVoice = { audio, object, loop: true, baseVolume: volume, kind: 'presence' };
    this.voices.push(voice);
    this.namedLoops.set(id, voice);
    return id;
  }

  stopNamedLoop(id: string) {
    const voice = this.namedLoops.get(id);
    if (!voice) return;
    voice.audio.stop();
    voice.object.parent?.remove(voice.object);
    this.namedLoops.delete(id);
    this.voices = this.voices.filter((v) => v !== voice);
  }

  startLanternLoop(hasOil: boolean) {
    const key = hasOil ? 'lantern_loop' : 'lantern_ember_loop';
    const mode = hasOil ? 'oil' : 'ember';
    if (this.lanternMode === mode && this.lanternSound?.isPlaying) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    if (!this.lanternSound) this.lanternSound = new THREE.Audio(this.listener);
    if (this.lanternSound.isPlaying) this.lanternSound.stop();
    this.lanternSound.setBuffer(buf);
    this.lanternSound.setLoop(true);
    this.lanternSound.setVolume(hasOil ? 0.35 : 0.3);
    this.lanternSound.play();
    this.lanternMode = mode;
  }

  startTorchLoop(sconce: Sconce) {
    const buf = this.buffers.get('torch');
    const scene = this.scene;
    if (!buf || !scene) return;
    const { nx, nz } = FACE_INTO_ROOM[sconce.face];
    const dist = CELL_SIZE / 2 + SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
    const object = new THREE.Object3D();
    object.position.set(
      sconce.x * CELL_SIZE + nx * dist,
      CELL_SIZE / 2 + 0.1 * CELL_SIZE,
      sconce.y * CELL_SIZE + nz * dist
    );
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buf);
    audio.setRefDistance(2.2);
    audio.setMaxDistance(10);
    audio.setRolloffFactor(1.1);
    audio.setLoop(true);
    audio.setVolume(0.42);
    audio.offset = Math.random() * Math.max(0.01, buf.duration * 0.8);
    object.add(audio);
    scene.add(object);
    audio.play();
    this.voices.push({ audio, object, loop: true, baseVolume: 0.42, kind: 'torch' });
  }

  playPositional(name: string, x: number, y: number, z: number, volume = 0.5) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    let voice = this.dripPool.find((v) => !v.audio.isPlaying);
    if (!voice) voice = this.dripPool[0];
    if (!voice) return;
    if (voice.audio.isPlaying) voice.audio.stop();
    voice.object.position.set(x, y, z);
    voice.audio.setBuffer(buf);
    voice.baseVolume = volume;
    voice.audio.setVolume(volume);
    voice.audio.play();
  }

  playDrip(x: number, y: number, z: number) {
    const names = ['drip1', 'drip2', 'drip3', 'drip4'];
    const name = names[(Math.random() * names.length) | 0];
    this.playPositional(name, x, y, z, 0.35 + Math.random() * 0.25);
  }

  playDoor(name: 'door_open' | 'door_close' | 'door_locked' | 'door_unlock', x: number, z: number) {
    this.playPositional(name, x * CELL_SIZE, 1.0, z * CELL_SIZE, name === 'door_locked' ? 0.55 : 0.7);
  }

  private playFar(camX: number, camZ: number, now: number) {
    if (!this.farVoice) return;
    const preset = QUALITY_PRESETS[this.quality];
    if (!preset.farAudio) return;
    let pick = FAR_KEYS[(Math.random() * FAR_KEYS.length) | 0];
    if (pick === this.lastFar) {
      pick = FAR_KEYS[(FAR_KEYS.indexOf(pick) + 1 + ((Math.random() * 2) | 0)) % FAR_KEYS.length];
    }
    this.lastFar = pick;
    const buf = this.buffers.get(pick);
    if (!buf) return;
    const ang = Math.random() * Math.PI * 2;
    const dist = (4 + Math.random() * 4) * CELL_SIZE;
    this.farVoice.object.position.set(camX + Math.cos(ang) * dist, 1.2, camZ + Math.sin(ang) * dist);
    if (this.farVoice.audio.isPlaying) this.farVoice.audio.stop();
    this.farVoice.audio.setBuffer(buf);
    const vol = 0.25 + Math.random() * 0.2;
    this.farVoice.baseVolume = vol;
    this.farVoice.audio.setVolume(vol);
    this.farVoice.audio.play();
    if (pick === 'far_draught') {
      this.nextChainAt = Math.min(this.nextChainAt, now + 3000 + Math.random() * 5000);
    }
  }

  private playAtMark(
    marks: DressingMarks['chains'],
    names: string[],
    volume: number
  ) {
    if (marks.length === 0) return;
    const mark = marks[(Math.random() * marks.length) | 0];
    const name = names[(Math.random() * names.length) | 0];
    this.playPositional(name, mark.wx, mark.wy, mark.wz, volume);
  }

  checkBones(partyX: number, partyY: number) {
    for (const bone of this.boneMarks) {
      const key = `${bone.x},${bone.y}`;
      if (this.heardBones.has(key)) continue;
      if (Math.abs(partyX - bone.x) + Math.abs(partyY - bone.y) <= 1) {
        this.heardBones.add(key);
        this.playPositional('bones', bone.wx, bone.wy, bone.wz, 0.55);
      }
    }
  }

  update(now: number, camX: number, camZ: number) {
    if (!this.loaded) return;
    const preset = QUALITY_PRESETS[this.quality];
    if (preset.farAudio && now >= this.nextFarAt) {
      this.playFar(camX, camZ, now);
      this.nextFarAt = now + 20000 + Math.random() * 25000;
    }
    if (now >= this.nextChainAt) {
      this.playAtMark(this.chainMarks, ['chain1', 'chain2'], 0.4);
      this.nextChainAt = now + 8000 + Math.random() * 12000;
    }
    if (now >= this.nextBannerAt) {
      this.playAtMark(this.bannerMarks, ['banner'], 0.32);
      this.nextBannerAt = now + 12000 + Math.random() * 18000;
    }

    const budget = preset.positionalBudget;
    if (!Number.isFinite(budget)) {
      for (const v of this.voices) {
        if (v.loop && v.audio.isPlaying) v.audio.setVolume(v.baseVolume);
      }
      return;
    }

    const n = this.voices.length;
    if (this.scratchDist.length < n) this.scratchDist.length = n;
    for (let i = 0; i < n; i++) {
      const v = this.voices[i];
      const dx = v.object.position.x - camX;
      const dz = v.object.position.z - camZ;
      this.scratchDist[i] = dx * dx + dz * dz;
    }
    // Partial select nearest `budget` without allocating a sorted copy of voices.
    for (let i = 0; i < n; i++) {
      let nearer = 0;
      const di = this.scratchDist[i];
      for (let j = 0; j < n; j++) {
        if (this.scratchDist[j] < di) nearer++;
      }
      const v = this.voices[i];
      const keep = nearer < budget && (v.audio.isPlaying || v.loop);
      if (v.loop) {
        v.audio.setVolume(keep ? v.baseVolume : 0);
      }
    }
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
  }

  stopAll() {
    this.ambientSound?.stop();
    this.musicSound?.stop();
    this.lanternSound?.stop();
    for (const sound of this.uiPool) sound.stop();
    for (const v of this.voices) v.audio.stop();
    this.namedLoops.clear();
  }
}
