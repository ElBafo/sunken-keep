import * as THREE from 'three';
import {
  CAMERA_EYE_HEIGHT,
  CELL_SIZE,
  DARK_AMB_DUCK_DB,
  FACE_INTO_ROOM,
  SCONCE_FRONT_OFFSET_TILES,
  STEP_VOLUME,
  WATER_SURFACE_Y,
  HERO_VOICES,
  HERO_HURT_VOICE_GAP,
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
  kind: 'torch' | 'drip' | 'far' | 'door' | 'chain' | 'banner' | 'wind' | 'bones' | 'leech' | 'water' | 'presence' | 'named';
  name?: string;
}

export class AudioManager {
  listener: THREE.AudioListener;
  listenerRig: THREE.Object3D;
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
  private torchVoices = new Map<string, PositionalVoice>();
  private lastStepVariant: Record<string, string> = {};
  private lastStepName: string | null = null;
  private lastUiNames: string[] = [];
  private lastCombatVariant: Record<string, string> = {};
  private lastHeroHurt: Record<string, string> = {};
  private nextHeroHurtAt = 0;
  lastHeroVoice: string | null = null;
  private windups = new Map<string, PositionalVoice>();
  private combatPool: PositionalVoice[] = [];
  private resumeWired = false;

  constructor(quality: QualityLevel) {
    this.listener = new THREE.AudioListener();
    this.listenerRig = new THREE.Object3D();
    this.listenerRig.name = 'audio-listener';
    this.listenerRig.add(this.listener);
    this.quality = quality;
    this.wireResume();
  }

  attach(scene: THREE.Scene) {
    scene.add(this.listenerRig);
  }

  /** Sit at the party's square centre, facing the party's direction — not the pulled-back camera. */
  updateListener(gridX: number, gridY: number, dir: number) {
    this.listenerRig.position.set(gridX * CELL_SIZE, CAMERA_EYE_HEIGHT, gridY * CELL_SIZE);
    this.listenerRig.rotation.order = 'YXZ';
    this.listenerRig.rotation.x = 0;
    this.listenerRig.rotation.y = (-dir * Math.PI) / 2;
    this.listenerRig.rotation.z = 0;
    this.listenerRig.updateMatrixWorld();
  }

  listenerPose() {
    return {
      x: this.listenerRig.position.x,
      y: this.listenerRig.position.y,
      z: this.listenerRig.position.z,
      rotationY: this.listenerRig.rotation.y
    };
  }

  async init() {
    return Promise.resolve();
  }

  unlock() {
    const ctx = this.listener.context;
    if (ctx && ctx.state !== 'running') {
      void ctx.resume();
    }
  }

  private wireResume() {
    if (this.resumeWired || typeof document === 'undefined') return;
    this.resumeWired = true;
    const resume = () => this.unlock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resume();
    });
    window.addEventListener('pageshow', resume);
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('touchstart', resume, true);
    document.addEventListener('click', resume, true);
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
      ['door_open', 'audio/sfx_door_open.mp3'],
      ['door_close', 'audio/sfx_door_close.mp3'],
      ['door_locked', 'audio/sfx_door_locked.mp3'],
      ['door_unlock', 'audio/sfx_door_unlock.mp3'],
      ['far_draught', 'audio/sfx_far_draught.mp3'],
      ['far_groan', 'audio/sfx_far_groan.mp3'],
      ['far_pebbles', 'audio/sfx_far_pebbles.mp3'],
      ['far_rumble', 'audio/sfx_far_rumble.mp3'],
      ['chain1', 'audio/sfx_chain_sway_1.mp3'],
      ['chain2', 'audio/sfx_chain_sway_2.mp3'],
      ['crack_wind', 'audio/sfx_crack_wind_loop.mp3'],
      ['banner', 'audio/sfx_banner_flutter.mp3'],
      ['bones', 'audio/sfx_bones_settle.mp3'],
      ['music_act1', 'audio/music_act1_loop.mp3'],
      ['leech_idle', 'audio/sfx_bog_leeches_idle_loop.mp3'],
      ['step', 'audio/sfx_step.mp3'],
      ['step_1', 'audio/sfx_step_1.mp3'],
      ['step_2', 'audio/sfx_step_2.mp3'],
      ['step_3', 'audio/sfx_step_3.mp3'],
      ['step_4', 'audio/sfx_step_4.mp3'],
      ['step_water_shallow', 'audio/sfx_step_water_shallow.mp3'],
      ['step_water_shallow_1', 'audio/sfx_step_water_shallow_1.mp3'],
      ['step_water_shallow_2', 'audio/sfx_step_water_shallow_2.mp3'],
      ['step_water_shallow_3', 'audio/sfx_step_water_shallow_3.mp3'],
      ['step_water_shallow_4', 'audio/sfx_step_water_shallow_4.mp3'],
      ['step_water_deep', 'audio/sfx_step_water_deep.mp3'],
      ['step_water_deep_1', 'audio/sfx_step_water_deep_1.mp3'],
      ['step_water_deep_2', 'audio/sfx_step_water_deep_2.mp3'],
      ['step_water_deep_3', 'audio/sfx_step_water_deep_3.mp3'],
      ['step_water_deep_4', 'audio/sfx_step_water_deep_4.mp3'],
      ['torch_extinguish', 'audio/sfx_torch_extinguish.mp3'],
      ['water_lap', 'audio/sfx_water_lap_loop.mp3'],
      ['torch_ignite', 'audio/sfx_torch_ignite.mp3'],
      ['oil_pickup', 'audio/sfx_oil_pickup.mp3'],
      ['oil_empty', 'audio/sfx_oil_empty.mp3'],
      ['lantern_refill', 'audio/sfx_lantern_refill.mp3'],
      ['lantern_loop', 'audio/sfx_lantern_loop.mp3'],
      ['lantern_ember_loop', 'audio/sfx_lantern_ember_loop.mp3'],
      ['dark_presence', 'audio/sfx_dark_presence_loop.mp3'],
      ['glint', 'audio/sfx_glint.mp3'],
      ['lamp_hooks', 'audio/sfx_lamp_hooks_loop.mp3'],
      ['act_axe', 'audio/sfx_act_axe.mp3'],
      ['act_shield', 'audio/sfx_act_shield.mp3'],
      ['act_mace', 'audio/sfx_act_mace.mp3'],
      ['act_prayer', 'audio/sfx_act_prayer.mp3'],
      ['act_wand', 'audio/sfx_act_wand.mp3'],
      ['act_scroll', 'audio/sfx_act_scroll.mp3'],
      ['act_dagger', 'audio/sfx_act_dagger.mp3'],
      ['act_tricks', 'audio/sfx_act_tricks.mp3'],
      ['act_punch', 'audio/sfx_act_punch.mp3'],
      ['act_torch', 'audio/sfx_act_torch.mp3'],
      ['act_ready', 'audio/sfx_act_ready.mp3'],
      ['torch_take', 'audio/sfx_torch_take.mp3'],
      ['torch_place', 'audio/sfx_torch_place.mp3'],
      ['torch_dunk', 'audio/sfx_torch_dunk.mp3'],
      ['ui_log_line', 'audio/sfx_ui_log_line.mp3'],
      ['ui_button_denied', 'audio/sfx_ui_button_denied.mp3'],
      ['save', 'audio/sfx_save.mp3'],
      ['ui_button', 'audio/sfx_ui_button.mp3'],
      ['ui_inventory_move', 'audio/sfx_ui_inventory_move.mp3'],
      ['pickup', 'audio/sfx_pickup.mp3'],
      ['chest', 'audio/sfx_chest.mp3'],
      ['potion', 'audio/sfx_potion.mp3'],
      ['equip_metal', 'audio/sfx_equip_metal.mp3'],
      ['equip_leather', 'audio/sfx_equip_leather.mp3'],
      ['equip_wood', 'audio/sfx_equip_wood.mp3'],
      ['equip_cloth', 'audio/sfx_equip_cloth.mp3'],
      ['item_use_fail', 'audio/sfx_item_use_fail.mp3'],
      ['inventory_open', 'audio/sfx_inventory_open.mp3'],
      ['inventory_close', 'audio/sfx_inventory_close.mp3'],
      ['hit', 'audio/sfx_hit.mp3'],
      ['hit_2', 'audio/sfx_hit_2.mp3'],
      ['hit_3', 'audio/sfx_hit_3.mp3'],
      ['act_miss', 'audio/sfx_act_miss.mp3'],
      ['act_miss_2', 'audio/sfx_act_miss_2.mp3'],
      ['act_miss_3', 'audio/sfx_act_miss_3.mp3'],
      ['hurt', 'audio/sfx_hurt.mp3'],
      ['hurt_2', 'audio/sfx_hurt_2.mp3'],
      ['hurt_3', 'audio/sfx_hurt_3.mp3'],
      ['hit_crit', 'audio/sfx_hit_crit.mp3'],
      ['hit_crit_2', 'audio/sfx_hit_crit_2.mp3'],
      ['hit_crit_3', 'audio/sfx_hit_crit_3.mp3'],
      ['hit_resist', 'audio/sfx_hit_resist_1.mp3'],
      ['hit_resist_2', 'audio/sfx_hit_resist_2.mp3'],
      ['hit_weak', 'audio/sfx_hit_weak_1.mp3'],
      ['hit_weak_2', 'audio/sfx_hit_weak_2.mp3'],
      ['hero_down', 'audio/sfx_hero_down.mp3'],
      ['hero_revive', 'audio/sfx_hero_revive.mp3'],
      ['game_over', 'audio/sfx_game_over.mp3'],
      ['level_up', 'audio/sfx_level_up.mp3'],
      ['potion', 'audio/sfx_potion.mp3'],
      ['mana_empty', 'audio/sfx_mana_empty.mp3'],
      ['keep_rat_alert', 'audio/sfx_keep_rat_alert.mp3'],
      ['keep_rat_attack', 'audio/sfx_keep_rat_attack.mp3'],
      ['keep_rat_hurt', 'audio/sfx_keep_rat_hurt.mp3'],
      ['keep_rat_death', 'audio/sfx_keep_rat_death.mp3'],
      ['rust_crab_alert', 'audio/sfx_rust_crab_alert.mp3'],
      ['rust_crab_attack', 'audio/sfx_rust_crab_attack.mp3'],
      ['rust_crab_hurt', 'audio/sfx_rust_crab_hurt.mp3'],
      ['rust_crab_death', 'audio/sfx_rust_crab_death.mp3'],
      ['rust_crab_windup', 'audio/sfx_rust_crab_windup.mp3'],
      ['slime_alert', 'audio/sfx_slime_alert.mp3'],
      ['slime_attack', 'audio/sfx_slime_attack.mp3'],
      ['slime_hurt', 'audio/sfx_slime_hurt.mp3'],
      ['slime_death', 'audio/sfx_slime_death.mp3'],
      ['bog_leeches_alert', 'audio/sfx_bog_leeches_alert.mp3'],
      ['bog_leeches_attack', 'audio/sfx_bog_leeches_attack.mp3'],
      ['bog_leeches_hurt', 'audio/sfx_bog_leeches_hurt.mp3'],
      ['bog_leeches_death', 'audio/sfx_bog_leeches_death.mp3'],
      ['drowned_dwarf_alert', 'audio/sfx_drowned_dwarf_alert.mp3'],
      ['drowned_dwarf_hurt', 'audio/sfx_drowned_dwarf_hurt.mp3'],
      ['drowned_dwarf_death', 'audio/sfx_drowned_dwarf_death.mp3'],
      ['drowned_dwarf_windup', 'audio/sfx_drowned_dwarf_windup.mp3'],
      ['drowned_dwarf_attack', 'audio/sfx_drowned_dwarf_attack.mp3'],
      ['tide_spawn_alert', 'audio/sfx_tide_spawn_alert.mp3'],
      ['tide_spawn_attack', 'audio/sfx_tide_spawn_attack.mp3'],
      ['tide_spawn_hurt', 'audio/sfx_tide_spawn_hurt.mp3'],
      ['tide_spawn_death', 'audio/sfx_tide_spawn_death.mp3'],
      ['captain_dural_alert', 'audio/sfx_drowned_dwarf_alert.mp3'],
      ['captain_dural_hurt', 'audio/sfx_drowned_dwarf_hurt.mp3'],
      ['captain_dural_death', 'audio/sfx_drowned_dwarf_death.mp3'],
      ['dural_windup', 'audio/sfx_dural_windup.mp3'],
      ['vox_brannoc_hurt_1', 'audio/vox_brannoc_hurt_1.mp3'],
      ['vox_brannoc_hurt_2', 'audio/vox_brannoc_hurt_2.mp3'],
      ['vox_brannoc_down', 'audio/vox_brannoc_down.mp3'],
      ['vox_wren_hurt_1', 'audio/vox_wren_hurt_1.mp3'],
      ['vox_wren_hurt_2', 'audio/vox_wren_hurt_2.mp3'],
      ['vox_wren_down', 'audio/vox_wren_down.mp3'],
      ['vox_ilsevar_hurt_1', 'audio/vox_ilsevar_hurt_1.mp3'],
      ['vox_ilsevar_hurt_2', 'audio/vox_ilsevar_hurt_2.mp3'],
      ['vox_ilsevar_down', 'audio/vox_ilsevar_down.mp3'],
      ['vox_mags_hurt_1', 'audio/vox_mags_hurt_1.mp3'],
      ['vox_mags_hurt_2', 'audio/vox_mags_hurt_2.mp3'],
      ['vox_mags_down', 'audio/vox_mags_down.mp3']
    ];

    const results = await Promise.all(
      files.map(async ([name, path]) => {
        try {
          const buf = await this.loadBuffer(loader, path);
          return [name, buf] as const;
        } catch (err) {
          console.warn('Failed to load', path, err);
          return null;
        }
      })
    );
    for (const pair of results) {
      if (pair) this.buffers.set(pair[0], pair[1]);
    }

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

    for (let i = 0; i < 8; i++) {
      const object = new THREE.Object3D();
      const audio = new THREE.PositionalAudio(this.listener);
      audio.setRefDistance(2.4);
      audio.setMaxDistance(12);
      audio.setRolloffFactor(1);
      object.add(audio);
      scene.add(object);
      this.combatPool.push({ audio, object, loop: false, baseVolume: 1, kind: 'presence' });
    }

    this.loaded = true;
  }

  attachLeeches(scene: THREE.Scene, floorData: FloorData) {
    this.scene = scene;
    this.syncLeechLoops(floorData);
  }

  /** Drop every leech idle, including a stray copy left over from a previous start. */
  clearLeechLoops() {
    const leechBuf = this.buffers.get('leech_idle');
    const extra = this.voices.filter(
      (v) => v.kind === 'leech' || v.name === 'leech_idle' || (!!leechBuf && v.audio.buffer === leechBuf)
    );
    for (const voice of extra) {
      if (voice.audio.isPlaying) voice.audio.stop();
      voice.object.parent?.remove(voice.object);
      this.voices = this.voices.filter((v) => v !== voice);
      for (const [id, named] of this.namedLoops) {
        if (named === voice) this.namedLoops.delete(id);
      }
    }
  }

  /** Rebind leech idle loops to the squares that currently hold bog_leeches. */
  syncLeechLoops(floorData: FloorData) {
    this.clearLeechLoops();
    const buf = this.buffers.get('leech_idle');
    const scene = this.scene;
    if (!buf || !scene) return;
    const spots: Array<{ x: number; y: number; floorY: number }> = [];
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].monster !== 'bog_leeches') continue;
        const tile = tiles[y][x];
        spots.push({
          x,
          y,
          floorY: tile.deepWater || tile.shallowWater ? WATER_SURFACE_Y : 0
        });
      }
    }
    const range = 2 * CELL_SIZE;
    for (const spot of spots) {
      const object = new THREE.Object3D();
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
      this.voices.push({
        audio,
        object,
        loop: true,
        baseVolume: 0.4,
        kind: 'leech',
        name: 'leech_idle'
      });
      object.position.set(spot.x * CELL_SIZE, spot.floorY + 0.2, spot.y * CELL_SIZE);
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
        this.voices.push({ audio, object, loop: true, baseVolume: 0.35, kind: 'water', name: 'water_lap' });
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
      this.voices.push({ audio, object, loop: true, baseVolume: 0.28, kind: 'wind', name: 'crack_wind' });
    }
  }

  lastUi(): string[] {
    return this.lastUiNames.slice();
  }

  lanternLoop(): { mode: 'oil' | 'ember' | 'off'; playing: boolean } {
    return { mode: this.lanternMode, playing: !!this.lanternSound?.isPlaying };
  }

  private combatFamilies: Record<string, string[]> = {
    hit: ['hit', 'hit_2', 'hit_3'],
    act_miss: ['act_miss', 'act_miss_2', 'act_miss_3'],
    hurt: ['hurt', 'hurt_2', 'hurt_3'],
    hit_crit: ['hit_crit', 'hit_crit_2', 'hit_crit_3'],
    hit_resist: ['hit_resist', 'hit_resist_2'],
    hit_weak: ['hit_weak', 'hit_weak_2']
  };

  playCombat(name: string, volume = 1, x?: number, y?: number, id?: string) {
    const family = this.combatFamilies[name];
    const pick = family ? this.pickVariant(name, family) : name;
    const rate = 0.95 + Math.random() * 0.1;
    if (name.endsWith('_windup')) {
      const key = id ?? name;
      this.stopWindup(key);
      const buf = this.buffers.get(pick);
      const scene = this.scene;
      if (!buf || !scene) return;
      const object = new THREE.Object3D();
      const wx = x != null ? x * CELL_SIZE : 0;
      const wz = y != null ? y * CELL_SIZE : 0;
      object.position.set(wx, 0.8, wz);
      const audio = new THREE.PositionalAudio(this.listener);
      audio.setBuffer(buf);
      audio.setRefDistance(2.4);
      audio.setMaxDistance(14);
      audio.setRolloffFactor(1);
      audio.setVolume(1);
      object.add(audio);
      scene.add(object);
      audio.play();
      this.windups.set(key, { audio, object, loop: false, baseVolume: 1, kind: 'presence' });
      return;
    }
    if (x != null && y != null) {
      this.playCombatAt(pick, x, y, volume, rate);
      return;
    }
    this.playUi(pick, volume, rate);
  }

  stopWindup(id?: string) {
    if (id) {
      const voice = this.windups.get(id);
      if (!voice) return;
      if (voice.audio.isPlaying) voice.audio.stop();
      voice.object.parent?.remove(voice.object);
      this.windups.delete(id);
      return;
    }
    for (const key of [...this.windups.keys()]) this.stopWindup(key);
  }

  private playCombatAt(name: string, x: number, y: number, volume: number, rate = 1) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    let voice = this.combatPool.find((v) => !v.audio.isPlaying);
    if (!voice) voice = this.combatPool[0];
    if (!voice) {
      this.playUi(name, volume, rate);
      return;
    }
    if (voice.audio.isPlaying) voice.audio.stop();
    voice.object.position.set(x * CELL_SIZE, 0.8, y * CELL_SIZE);
    voice.audio.setBuffer(buf);
    voice.audio.setPlaybackRate(rate);
    voice.baseVolume = volume;
    voice.audio.setVolume(Math.min(1, Math.max(0, volume)));
    voice.audio.play();
  }

  /** Stop music and looping ambience without cutting one-shot voices (downed, UI). */
  stopFloorLoops() {
    this.ambientSound?.stop();
    this.musicSound?.stop();
    this.lanternSound?.stop();
    this.lanternMode = 'off';
    for (const v of this.voices) {
      if (v.loop && v.audio.isPlaying) v.audio.stop();
    }
  }

  startFloorLoops(hasOil: boolean) {
    if (this.ambientSound && !this.ambientSound.isPlaying) {
      this.ambientSound.setVolume(this.trueDark ? this.ambVolume * 10 ** (-DARK_AMB_DUCK_DB / 20) : this.ambVolume);
      this.ambientSound.play();
    }
    if (this.musicSound && !this.musicSound.isPlaying) {
      this.musicSound.setVolume(this.musicVolume);
      this.musicSound.play();
    }
    this.startLanternLoop(hasOil);
    for (const v of this.voices) {
      if (v.loop && v.kind !== 'presence' && !v.audio.isPlaying) {
        v.audio.setVolume(v.baseVolume);
        v.audio.play();
      }
    }
  }

  stopPresenceLoops() {
    for (const [id, voice] of [...this.namedLoops.entries()]) {
      if (voice.kind !== 'presence') continue;
      if (voice.audio.isPlaying) voice.audio.stop();
      voice.object.parent?.remove(voice.object);
      this.namedLoops.delete(id);
      this.voices = this.voices.filter((v) => v !== voice);
    }
  }

  playingLoops(): { count: number; kinds: string[] } {
    return this.loopKit(true);
  }

  /** Floor-kit loops. Pass `playingOnly` to count voices that are actually audible. */
  loopKit(playingOnly = false): { count: number; kinds: string[]; names: string[] } {
    const kinds: string[] = [];
    const names: string[] = [];
    const keep = (exists: boolean, playing: boolean | undefined, kind: string, name: string) => {
      if (exists && (!playingOnly || playing)) {
        kinds.push(kind);
        names.push(name);
      }
    };
    keep(!!this.ambientSound, this.ambientSound?.isPlaying, 'ambient', 'ambience');
    keep(!!this.musicSound, this.musicSound?.isPlaying, 'music', 'music_act1');
    keep(!!this.lanternSound, this.lanternSound?.isPlaying, `lantern:${this.lanternMode}`, `lantern:${this.lanternMode}`);
    for (const v of this.voices) {
      if (!v.loop || v.kind === 'presence') continue;
      if (playingOnly && !v.audio.isPlaying) continue;
      kinds.push(v.kind);
      names.push(v.name ?? v.kind);
    }
    return { count: kinds.length, kinds, names };
  }

  private pickVariant(family: string, names: string[]): string {
    const available = names.filter((n) => this.buffers.has(n));
    const pool = available.length ? available : names;
    const last = this.lastCombatVariant[family];
    const choices = pool.length > 1 ? pool.filter((n) => n !== last) : pool;
    const pick = choices[(Math.random() * choices.length) | 0];
    this.lastCombatVariant[family] = pick;
    return pick;
  }

  playHeroHurt(hero: string, nowSec: number) {
    if (!HERO_VOICES) return;
    if (nowSec < this.nextHeroHurtAt) return;
    this.nextHeroHurtAt = nowSec + HERO_HURT_VOICE_GAP;
    const names = [`vox_${hero}_hurt_1`, `vox_${hero}_hurt_2`];
    const last = this.lastHeroHurt[hero];
    const choices = names.filter((n) => n !== last && this.buffers.has(n));
    const pool = choices.length ? choices : names.filter((n) => this.buffers.has(n));
    if (!pool.length) return;
    const pick = pool[(Math.random() * pool.length) | 0];
    this.lastHeroHurt[hero] = pick;
    this.lastHeroVoice = pick;
    this.playUi(pick, 1);
  }

  playHeroDown(hero: string) {
    if (!HERO_VOICES) return;
    const name = `vox_${hero}_down`;
    this.lastHeroVoice = name;
    this.playUi(name, 1);
  }

  setFightDuck(on: boolean) {
    if (this.musicSound) this.musicSound.setVolume(on ? 0.12 : this.musicVolume);
  }

  playUi(name: string, volume = 1, rate = 1) {
    this.lastUiNames.push(name);
    if (this.lastUiNames.length > 24) this.lastUiNames.splice(0, this.lastUiNames.length - 24);
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

  private pickStepVariant(kind: 'step' | 'step_water_shallow' | 'step_water_deep'): string {
    const names = [`${kind}_1`, `${kind}_2`, `${kind}_3`, `${kind}_4`];
    const available = names.filter((n) => this.buffers.has(n));
    const pool = available.length > 0 ? available : [kind];
    const last = this.lastStepVariant[kind];
    const choices = pool.length > 1 ? pool.filter((n) => n !== last) : pool;
    const pick = choices[(Math.random() * choices.length) | 0];
    this.lastStepVariant[kind] = pick;
    this.lastStepName = pick;
    return pick;
  }

  playStep(kind: 'step' | 'step_water_shallow' | 'step_water_deep') {
    const name = this.pickStepVariant(kind);
    const rate = 0.95 + Math.random() * 0.1;
    this.playUi(name, STEP_VOLUME, rate);
  }

  lastStep(): string | null {
    return this.lastStepName;
  }

  setTrueDark(on: boolean) {
    if (this.trueDark === on) return;
    this.trueDark = on;
    const duck = 10 ** (-DARK_AMB_DUCK_DB / 20);
    if (this.ambientSound) this.ambientSound.setVolume(on ? this.ambVolume * duck : this.ambVolume);
    if (this.musicSound) this.musicSound.setVolume(on ? 0.15 : this.musicVolume);
  }

  startNamedLoop(
    name: string,
    x: number,
    y: number,
    z: number,
    volume: number,
    kind: PositionalVoice['kind'] = 'presence'
  ): string {
    const id = `loop-${this.nextLoopId++}`;
    const buf = this.buffers.get(name);
    const scene = this.scene;
    if (!buf || !scene) return '';
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
    const voice: PositionalVoice = { audio, object, loop: true, baseVolume: volume, kind, name };
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
    this.lanternMode = mode;
    if (this.lanternSound?.isPlaying && this.buffers.get(key)) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    if (!this.lanternSound) this.lanternSound = new THREE.Audio(this.listener);
    if (this.lanternSound.isPlaying) this.lanternSound.stop();
    this.lanternSound.setBuffer(buf);
    this.lanternSound.setLoop(true);
    this.lanternSound.setVolume(hasOil ? 0.35 : 0.3);
    try {
      this.lanternSound.play();
    } catch {
      // Host audio can refuse playback; the loop is still intended to run.
    }
  }

  private sconceKey(sconce: Sconce): string {
    return `${sconce.x},${sconce.y},${sconce.face}`;
  }

  startTorchLoop(sconce: Sconce) {
    if (!sconce.lit) return;
    const key = this.sconceKey(sconce);
    const existing = this.torchVoices.get(key);
    if (existing) {
      if (!existing.audio.isPlaying) existing.audio.play();
      existing.audio.setVolume(existing.baseVolume);
      return;
    }
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
    const voice: PositionalVoice = { audio, object, loop: true, baseVolume: 0.42, kind: 'torch', name: 'torch' };
    this.voices.push(voice);
    this.torchVoices.set(key, voice);
  }

  stopTorchLoop(sconce: Sconce) {
    const voice = this.torchVoices.get(this.sconceKey(sconce));
    if (!voice) return;
    if (voice.audio.isPlaying) voice.audio.stop();
    voice.audio.setVolume(0);
  }

  playPositional(name: string, x: number, y: number, z: number, volume = 1) {
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
    this.playPositional(name, x, y, z, 1);
  }

  playDoor(name: 'door_open' | 'door_close' | 'door_locked' | 'door_unlock', x: number, z: number) {
    this.playPositional(name, x * CELL_SIZE, 1.0, z * CELL_SIZE, 1);
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
    const vol = 1;
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
        this.playPositional('bones', bone.wx, bone.wy, bone.wz, 1);
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
      this.playAtMark(this.chainMarks, ['chain1', 'chain2'], 1);
      this.nextChainAt = now + 8000 + Math.random() * 12000;
    }
    if (now >= this.nextBannerAt) {
      this.playAtMark(this.bannerMarks, ['banner'], 1);
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
    this.stopWindup();
    this.stopFloorLoops();
    for (const sound of this.uiPool) sound.stop();
    for (const v of this.voices) v.audio.stop();
    for (const v of this.combatPool) v.audio.stop();
    this.namedLoops.clear();
  }
}
