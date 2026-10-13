import * as THREE from 'three';
import {
  CELL_SIZE,
  MONSTER_OFFSET_TOWARD_PARTY,
  SPRITE_SURFACE_LIFT,
  WATER_SURFACE_Y,
  cameraOffsetXZ,
  isWaterTile,
  tileBedY
} from './constants';
import type { HitKind } from '../core/types';
import { isSlimeKind, slimeFrostFramePath } from '../core/slime-frost';
import { loadSpriteTexture, textureFrameSize } from './atlas';
import { fetchJsonCached } from './asset-cache';
import { createLimiter, mapPool, SPRITE_LOAD_CONCURRENCY } from './load-pool';
import { FloorData, Tile } from './types';

/** Item billboards keep the old 80×60 texel ratio. Monster quads use each set's own ratio. */
const ITEM_ASPECT = 80 / 60;
/** Wall-fraction defaults when `size.worldHeight` is missing from monsters.json. */
const DEFAULT_WORLD_HEIGHT: Record<string, number> = {
  bog_leeches: 0.15,
  keep_rat: 0.25,
  rust_crab: 0.35,
  cellar_spider: 0.3,
  slime: 0.39,
  slime_small: 0.312,
  drowned_dwarf: 0.6,
  captain_dural: 0.68,
  tide_spawn: 0.85
};
const V2_FOLDER = 'art/dungeon/monsters_v2';
const V1_FOLDER = 'art/dungeon';
const LOD_NAMES = ['close', 'near', 'mid', 'far'] as const;
export type LodName = (typeof LOD_NAMES)[number];
type AnimName = 'idle' | 'attack' | 'hurt' | 'death' | 'windup';
const ITEM_HEIGHT: Record<string, number> = {
  potion_red: 0.22,
  potion_blue: 0.22,
  potion_green: 0.22,
  oil: 0.22,
  oil_flask: 0.22,
  key: 0.2,
  scroll: 0.3,
  journal_page: 0.25,
  chest: 0.5,
  iron_shield: 0.5,
  chain_mail: 0.5,
  ashmantle_hammer: 0.6
};

export function billboardSize(height: number, aspect = ITEM_ASPECT): { w: number; h: number } {
  return { w: height * aspect, h: height };
}

/** Quad size: visible height is `worldHeight` walls; width follows that set's pixel ratio. */
export function quadForWorldHeight(
  worldHeight: number,
  wallSize: number,
  imageW: number,
  imageH: number
): { w: number; h: number } {
  const h = worldHeight * wallSize;
  const aspect = imageH > 0 ? imageW / imageH : ITEM_ASPECT;
  return { w: h * aspect, h };
}

export function monsterLodName(dist: number, hasClose: boolean): LodName {
  if (dist <= 1) return hasClose ? 'close' : 'near';
  if (dist === 2) return 'near';
  if (dist === 3) return 'mid';
  return 'far';
}

function lodFromFile(file: string): LodName {
  if (file.includes('_close')) return 'close';
  if (file.includes('_far')) return 'far';
  if (file.includes('_mid')) return 'mid';
  return 'near';
}

function texSize(tex: THREE.Texture | undefined): { w: number; h: number } {
  return textureFrameSize(tex);
}

const ITEM_SPRITE: Record<string, { file: string; h: number; base?: string; prefix?: string }> = {
  key: { file: 'item_key_near.png', h: ITEM_HEIGHT.key, prefix: 'item_key' },
  potion_red: { file: 'item_potion_red_near.png', h: ITEM_HEIGHT.potion_red, prefix: 'item_potion_red' },
  potion_blue: { file: 'item_potion_blue_near.png', h: ITEM_HEIGHT.potion_blue, prefix: 'item_potion_blue' },
  potion_green: { file: 'item_potion_green_near.png', h: ITEM_HEIGHT.potion_green, prefix: 'item_potion_green' },
  chest: { file: 'item_chest_near.png', h: ITEM_HEIGHT.chest, prefix: 'item_chest' },
  chest_open: { file: 'item_chest_open_near.png', h: ITEM_HEIGHT.chest, prefix: 'item_chest_open' },
  scroll: { file: 'item_scroll_near.png', h: ITEM_HEIGHT.scroll, prefix: 'item_scroll' },
  journal_page: { file: 'item_journal_page_near.png', h: ITEM_HEIGHT.journal_page, prefix: 'item_journal_page' },
  iron_shield: { file: 'item_iron_shield_near.png', h: ITEM_HEIGHT.iron_shield, prefix: 'item_iron_shield' },
  chain_mail: { file: 'item_chain_mail_near.png', h: ITEM_HEIGHT.chain_mail, prefix: 'item_chain_mail' },
  ashmantle_hammer: { file: 'item_ashmantle_hammer_near.png', h: ITEM_HEIGHT.ashmantle_hammer, prefix: 'item_ashmantle_hammer' },
  captain_key: { file: 'item_captain_key_near.png', h: ITEM_HEIGHT.key, prefix: 'item_captain_key' },
  oil: { file: 'item_oil_near.png', h: ITEM_HEIGHT.oil, base: 'proto3d/tex3d/torch', prefix: 'item_oil' },
  oil_flask: { file: 'item_oil_near.png', h: ITEM_HEIGHT.oil_flask, base: 'proto3d/tex3d/torch', prefix: 'item_oil' }
};

const OWN_SQUARE_SCALE = 0.72;
/** Must be in the visible floor strip (near plane hits y=0 at ~1.0 in front of the camera). */
const OWN_SQUARE_FORWARD = 1.18;
/** Items on other squares sit in the front half (toward the camera). */
const ITEM_FRONT_HALF = CELL_SIZE * 0.25;
const ITEM_RENDER_ORDER = 9;
const SPRITE_RENDER_ORDER = 11;
const HITFX_RENDER_ORDER = 12;

/** Visual-only offset from a monster's grid centre toward the party's square centre. */
export function monsterVisualOffset(
  monsterX: number,
  monsterY: number,
  partyX: number,
  partyY: number,
  offsetTiles = MONSTER_OFFSET_TOWARD_PARTY,
  cellSize = CELL_SIZE
): { ox: number; oz: number } {
  const dx = partyX - monsterX;
  const dy = partyY - monsterY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return { ox: 0, oz: 0 };
  const dist = offsetTiles * cellSize;
  return { ox: (dx / len) * dist, oz: (dy / len) * dist };
}
const MONSTER_TEXEL_W = 80;
const MONSTER_TEXEL_H = 60;
const FROST_HOLD_FRAMES = 2;
const FROST_HOLD_FPS = 6;
/** Mix the sprite's own colours 60% toward this cold blue (lerp, not additive). */
const FROST_COLOR = 0x6fa8e8;
const FROST_LERP = 0.6;

interface HitFxSpec {
  frames: THREE.Texture[];
  fps: number;
  additive: boolean;
  imgW: number;
  imgH: number;
  pivotX: number;
  pivotYFromTop: number;
}

interface HitFxPlay {
  sprite: THREE.Sprite | null;
  material: THREE.SpriteMaterial | null;
  frames: THREE.Texture[];
  started: number;
  fps: number;
  hostId: string;
  imgW: number;
  imgH: number;
  pivotX: number;
  pivotYFromTop: number;
  holdFrames: number;
  holdFps: number;
  tintHost: boolean;
  frame: number;
  restoreHostMap?: THREE.Texture | null;
  bodySwap?: boolean;
}

interface BodyAnchor {
  u: number;
  vFromBottom: number;
}

function spriteFeetY(tile: Tile): number {
  if (isWaterTile(tile)) return WATER_SURFACE_Y + SPRITE_SURFACE_LIFT;
  return tileBedY(tile) + SPRITE_SURFACE_LIFT;
}

interface SpriteInfo {
  object: THREE.Object3D;
  material: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  x: number;
  y: number;
  kind: 'monster' | 'item' | 'sconce';
  monsterKind?: string;
  monsterId?: string;
  spawnX?: number;
  spawnY?: number;
  baseW: number;
  baseH: number;
  floorY: number;
  tileFloorY: number;
  imageH: number;
  gapBelow: number;
  frames?: THREE.Texture[];
  sets?: Partial<Record<AnimName, THREE.Texture[]>>;
  lodSets?: Partial<Record<LodName, Partial<Record<AnimName, THREE.Texture[]>>>>;
  lodSize?: Partial<Record<LodName, { w: number; h: number }>>;
  currentLod?: LodName;
  v2?: boolean;
  worldHeight?: number;
  lod?: THREE.Texture[];
  currentFrame: number;
  animSpeed: number;
  lastFrameTime: number;
  anim: 'idle' | 'attack' | 'hurt' | 'death' | 'windup';
  animOnce: boolean;
  pickedUp?: boolean;
  hidden?: boolean;
  /** Debug: stay drawn even when the square is unlit (eye-glint hide). */
  forceLit?: boolean;
  itemId?: string;
  frostAmount?: number;
  frostFlash?: boolean;
}

function configureSpriteTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

function makeSpriteMaterial(map: THREE.Texture, depthWrite = false) {
  const mat = new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.15,
    depthTest: true,
    depthWrite,
    sizeAttenuation: true,
    fog: false,
    toneMapped: false
  });
  patchFrostLerp(mat);
  return mat;
}

function patchFrostLerp(material: THREE.SpriteMaterial) {
  if (material.userData.frostPatched) return;
  material.userData.frostPatched = true;
  material.userData.frostAmount = 0;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.frostAmount = { value: material.userData.frostAmount ?? 0 };
    shader.uniforms.frostColor = { value: new THREE.Color(FROST_COLOR) };
    material.userData.frostUniforms = shader.uniforms;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float frostAmount;
uniform vec3 frostColor;`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, frostColor, frostAmount);`
      );
  };
  material.customProgramCacheKey = () => 'frost-lerp-60';
}

function setFrostAmount(material: THREE.SpriteMaterial, amount: number) {
  material.userData.frostAmount = amount;
  const uniforms = material.userData.frostUniforms as { frostAmount?: { value: number } } | undefined;
  if (uniforms?.frostAmount) uniforms.frostAmount.value = amount;
  material.needsUpdate = true;
}

function makeBillboard(
  material: THREE.SpriteMaterial,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number
): THREE.Sprite {
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.position.set(x, y, z);
  sprite.scale.set(width, height, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = SPRITE_RENDER_ORDER;
  sprite.userData.isSprite = true;
  sprite.matrixAutoUpdate = true;
  return sprite;
}

export class SpriteManager {
  sprites: SpriteInfo[] = [];
  camera: THREE.Camera;
  private anchors = new Map<string, { gapBelow: number; imageH: number; imageW: number; topRow: number; footRow: number }>();
  private v2Px = new Map<string, Partial<Record<LodName, [number, number]>>>();
  private heights = new Map<string, number>();
  private hitFx = new Map<string, HitFxSpec>();
  private slimeFrostTex = new Map<string, THREE.Texture>();
  private bodyAnchors = new Map<string, BodyAnchor>();
  private playingFx: HitFxPlay[] = [];
  lastHitType: HitKind | null = null;
  private scene: THREE.Scene | null = null;
  private chestOpenLod: THREE.Texture[] | null = null;
  private chestClosedLod = new Map<string, THREE.Texture[]>();
  private limitTex = createLimiter(SPRITE_LOAD_CONCURRENCY);
  private animCache = new Map<string, Promise<THREE.Texture[]>>();
  private monstersReady = false;
  private monsterLoad: Promise<void> | null = null;
  adjacentScale = 1;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  hideItemAt(x: number, y: number) {
    for (const sprite of this.sprites) {
      if (sprite.kind === 'item' && sprite.x === x && sprite.y === y && sprite.itemId !== 'chest' && sprite.itemId !== 'chest_open') {
        sprite.pickedUp = true;
        sprite.object.visible = false;
      }
    }
  }

  openChestAt(x: number, y: number) {
    for (const sprite of this.sprites) {
      if (sprite.kind !== 'item' || sprite.x !== x || sprite.y !== y) continue;
      if (sprite.itemId !== 'chest' && sprite.itemId !== 'chest_open') continue;
      if (sprite.lod) this.chestClosedLod.set(`${x},${y}`, sprite.lod);
      if (this.chestOpenLod) {
        sprite.lod = this.chestOpenLod;
        sprite.material.map = this.chestOpenLod[0];
        sprite.material.needsUpdate = true;
      }
      sprite.itemId = 'chest_open';
      sprite.object.userData.item = 'chest';
      sprite.pickedUp = false;
      sprite.object.visible = true;
    }
  }

  resetItems(floor: FloorData) {
    for (const sprite of this.sprites) {
      if (sprite.kind !== 'item') continue;
      const tile = floor.tiles[sprite.y]?.[sprite.x];
      const key = `${sprite.x},${sprite.y}`;
      const closed = this.chestClosedLod.get(key);
      if (tile?.chest) {
        sprite.itemId = tile.chestOpen ? 'chest_open' : 'chest';
        sprite.pickedUp = false;
        sprite.hidden = false;
        if (!tile.chestOpen && closed) {
          sprite.lod = closed;
          sprite.material.map = closed[0];
          sprite.material.needsUpdate = true;
        }
        sprite.object.visible = !(tile.secret && !tile.secretOpen);
        continue;
      }
      const present = !!tile?.item && !(tile.secret && !tile.secretOpen);
      sprite.pickedUp = !present;
      sprite.hidden = !present;
      sprite.object.visible = present;
    }
  }

  hitItem(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    playerX: number,
    playerY: number,
    dir: number
  ): { x: number; y: number; item: string } | null {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cam = this.camera;
    const v = new THREE.Vector3();
    let best: { x: number; y: number; item: string; d: number } | null = null;
    const [fdx, fdy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ][dir & 3];
    for (const sprite of this.sprites) {
      if (sprite.kind !== 'item' || sprite.pickedUp || !sprite.object.visible) continue;
      const own = sprite.x === playerX && sprite.y === playerY;
      const facing = sprite.x === playerX + fdx && sprite.y === playerY + fdy;
      if (!own && !facing) continue;
      const pos = sprite.object.position;
      v.set(pos.x, pos.y + sprite.object.scale.y * 0.5, pos.z).project(cam);
      const sx = ((v.x + 1) / 2) * rect.width;
      const sy = ((-v.y + 1) / 2) * rect.height;
      const hw = Math.max(22, (sprite.object.scale.x / 2) * (rect.width / 4));
      const hh = Math.max(22, (sprite.object.scale.y / 2) * (rect.height / 3));
      if (px < sx - hw || px > sx + hw || py < sy - hh || py > sy + hh) continue;
      const d = (px - sx) ** 2 + (py - sy) ** 2;
      const item = sprite.itemId ?? (sprite.object.userData.item as string) ?? '';
      if (!best || d < best.d) best = { x: sprite.x, y: sprite.y, item, d };
    }
    return best ? { x: best.x, y: best.y, item: best.item } : null;
  }

  isItemPresent(x: number, y: number): boolean {
    return this.sprites.some((s) => s.kind === 'item' && s.x === x && s.y === y && !s.pickedUp);
  }

  setLitVisible(x: number, y: number, kind: 'monster' | 'item' | 'sconce', lit: boolean) {
    for (const sprite of this.sprites) {
      if (sprite.kind === kind && sprite.x === x && sprite.y === y) {
        if (sprite.pickedUp) {
          sprite.object.visible = false;
          continue;
        }
        sprite.object.visible = sprite.forceLit || lit;
      }
    }
  }

  private loadTex(path: string): Promise<THREE.Texture> {
    return this.limitTex(async () => {
      const tex = await loadSpriteTexture(path);
      configureSpriteTexture(tex);
      return tex;
    });
  }

  /** Shared art + floor items. Monster frames stay deferred until `ensureMonsters`. */
  async loadSprites(scene: THREE.Scene, floorData: FloorData, opts: { monsters?: boolean } = {}) {
    const baseUrl = import.meta.env.BASE_URL;
    await this.loadAnchors(baseUrl);
    this.scene = scene;
    await this.loadHeights(baseUrl);
    await this.loadHitFx(baseUrl);
    try {
      this.chestOpenLod = await Promise.all([
        this.loadTex('art/dungeon/item_chest_open_near.png'),
        this.loadTex('art/dungeon/item_chest_open_mid.png'),
        this.loadTex('art/dungeon/item_chest_open_far.png')
      ]);
    } catch {
      this.chestOpenLod = null;
    }
    await this.loadItems(scene, floorData);
    if (opts.monsters !== false) await this.ensureMonsters(scene, floorData);
  }

  hasMonsters(): boolean {
    return this.monstersReady;
  }

  /** Load this floor's monster frames (parallel, concurrency-capped) when the floor starts. */
  ensureMonsters(scene: THREE.Scene, floorData: FloorData): Promise<void> {
    if (this.monstersReady) return Promise.resolve();
    if (!this.monsterLoad) this.monsterLoad = this.loadMonsters(scene, floorData);
    return this.monsterLoad;
  }

  private async loadItems(scene: THREE.Scene, floorData: FloorData) {
    const jobs: Array<{ x: number; y: number; tile: Tile; itemName: string; feetY: number }> = [];
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        const itemName = tile.item || (tile.chest ? 'chest' : undefined);
        if (!itemName) continue;
        jobs.push({ x, y, tile, itemName, feetY: spriteFeetY(tile) });
      }
    }
    const created = await mapPool(jobs, SPRITE_LOAD_CONCURRENCY, async (job) => {
      const { x, y, tile, itemName, feetY } = job;
      const def = ITEM_SPRITE[itemName] ?? {
        file: `item_${itemName}_near.png`,
        h: ITEM_HEIGHT[itemName] ?? 0.3
      };
      const folder = def.base ?? 'art/dungeon';
      const prefix = def.prefix ?? itemName;
      const tex = await this.loadTex(`${folder}/${prefix}_near.png`);
      const lod = await Promise.all([
        tex,
        this.loadTex(`${folder}/${prefix}_mid.png`).catch(() => tex),
        this.loadTex(`${folder}/${prefix}_far.png`).catch(() => tex)
      ]);
      const size = billboardSize(def.h);
      const mat = makeSpriteMaterial(tex);
      const sprite = makeBillboard(mat, x * CELL_SIZE, feetY, y * CELL_SIZE, size.w, size.h);
      sprite.renderOrder = ITEM_RENDER_ORDER;
      sprite.userData.item = itemName === 'oil_flask' ? 'oil' : itemName;
      scene.add(sprite);
      const info: SpriteInfo = {
        object: sprite,
        material: mat,
        x,
        y,
        kind: 'item',
        itemId: itemName,
        baseW: size.w,
        baseH: size.h,
        floorY: feetY,
        tileFloorY: feetY,
        imageH: 60,
        gapBelow: 0,
        lod,
        currentFrame: 0,
        animSpeed: 0,
        lastFrameTime: 0,
        anim: 'idle',
        animOnce: false
      };
      if (tile.secret && !tile.secretOpen) {
        sprite.visible = false;
        info.hidden = true;
      }
      return info;
    });
    this.sprites.push(...created);
  }

  private async loadMonsters(scene: THREE.Scene, floorData: FloorData) {
    const jobs: Array<{ x: number; y: number; tile: Tile; kind: string; feetY: number }> = [];
    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        if (!tile.monster) continue;
        jobs.push({ x, y, tile, kind: tile.monster, feetY: spriteFeetY(tile) });
      }
    }
    const created = await mapPool(jobs, SPRITE_LOAD_CONCURRENCY, async (job) => {
      const { x, y, kind, feetY } = job;
      const v2 = this.v2Px.has(kind);
      const folder = v2 ? V2_FOLDER : V1_FOLDER;
      const lodSets: NonNullable<SpriteInfo['lodSets']> = {};
      const lodSize: NonNullable<SpriteInfo['lodSize']> = {};
      const worldHeight = this.wallHeightOf(kind);
      const lods = v2 ? LOD_NAMES : (['near', 'mid', 'far'] as const);
      await Promise.all(
        lods.map(async (lod) => {
          const [idle, attack, hurt, death] = await Promise.all([
            this.loadSet(folder, kind, 'idle', 4, lod),
            this.loadSet(folder, kind, 'attack', 3, lod),
            this.loadSet(folder, kind, 'hurt', 1, lod),
            this.loadSet(folder, kind, 'death', 4, lod)
          ]);
          if (!idle.length) return;
          lodSets[lod] = { idle, attack, hurt, death, windup: attack.length ? [attack[0]] : idle };
          lodSize[lod] = this.quadForLod(kind, lod, worldHeight, idle[0]);
        })
      );
      const startLod: LodName = lodSets.near ? 'near' : ((Object.keys(lodSets)[0] as LodName | undefined) ?? 'near');
      const startSets = lodSets[startLod] ?? {};
      const frames = startSets.idle ?? [];
      if (!frames.length) return null;
      const size = lodSize[startLod] ?? quadForWorldHeight(worldHeight, CELL_SIZE, 80, 60);
      const feet = this.feetFor(`${kind}_idle_1_${startLod}.png`, size.h, feetY);
      const mat = makeSpriteMaterial(frames[0], true);
      const sprite = makeBillboard(mat, x * CELL_SIZE, feet, y * CELL_SIZE, size.w, size.h);
      sprite.renderOrder = SPRITE_RENDER_ORDER;
      scene.add(sprite);
      const info: SpriteInfo = {
        object: sprite,
        material: mat,
        x,
        y,
        kind: 'monster',
        monsterKind: kind,
        spawnX: x,
        spawnY: y,
        v2,
        worldHeight,
        baseW: size.w,
        baseH: size.h,
        floorY: feet,
        tileFloorY: feetY,
        imageH: this.anchors.get(`${kind}_idle_1_${startLod}.png`)?.imageH ?? texSize(frames[0]).h,
        gapBelow: this.anchors.get(`${kind}_idle_1_${startLod}.png`)?.gapBelow ?? 0,
        frames,
        sets: startSets,
        lodSets,
        lodSize,
        currentLod: startLod,
        currentFrame: 0,
        animSpeed: 200,
        lastFrameTime: 0,
        anim: 'idle',
        animOnce: false
      };
      return info;
    });
    for (const info of created) {
      if (info) this.sprites.push(info);
    }
    this.monstersReady = true;
  }

  setAdjacentScale(_n: number) {
    this.adjacentScale = 1;
  }

  integerAdjacentScale(): number {
    return 1;
  }

  layoutItems(playerX: number, playerY: number, dir: number) {
    this.layoutBillboards(playerX, playerY, dir);
  }

  layoutBillboards(playerX: number, playerY: number, dir: number) {
    const rotY = (-dir * Math.PI) / 2;
    const [ox, oz] = cameraOffsetXZ(rotY);
    const fx = -Math.sin(rotY);
    const fz = -Math.cos(rotY);
    const camX = playerX * CELL_SIZE + ox;
    const camZ = playerY * CELL_SIZE + oz;

    for (const sprite of this.sprites) {
      if (sprite.hidden || sprite.pickedUp) continue;
      if (sprite.kind === 'monster') {
        this.placeMonster(sprite, playerX, playerY);
        continue;
      }
      if (sprite.kind === 'item') this.placeItem(sprite, playerX, playerY, camX, camZ, fx, fz);
    }
  }

  private placeMonster(sprite: SpriteInfo, playerX: number, playerY: number) {
    const dist = Math.max(Math.abs(sprite.x - playerX), Math.abs(sprite.y - playerY));
    this.applyMonsterLod(sprite, dist);
    const size = sprite.lodSize?.[sprite.currentLod ?? 'near'] ?? { w: sprite.baseW, h: sprite.baseH };
    sprite.baseW = size.w;
    sprite.baseH = size.h;
    const file = this.frameFile(sprite);
    const floor = sprite.tileFloorY ?? sprite.floorY;
    const feet = file ? this.feetFor(file, size.h, floor) : floor;
    const { ox, oz } = monsterVisualOffset(sprite.x, sprite.y, playerX, playerY);
    sprite.object.position.set(sprite.x * CELL_SIZE + ox, feet, sprite.y * CELL_SIZE + oz);
    sprite.object.scale.set(size.w, size.h, 1);
    sprite.object.renderOrder = SPRITE_RENDER_ORDER;
  }

  private livingMonsterOn(x: number, y: number): boolean {
    return this.sprites.some((s) => s.kind === 'monster' && s.x === x && s.y === y && !s.hidden);
  }

  private placeItem(
    sprite: SpriteInfo,
    playerX: number,
    playerY: number,
    camX: number,
    camZ: number,
    fx: number,
    fz: number
  ) {
    sprite.object.renderOrder = ITEM_RENDER_ORDER;
    if (this.livingMonsterOn(sprite.x, sprite.y)) {
      sprite.object.position.set(sprite.x * CELL_SIZE, sprite.floorY, sprite.y * CELL_SIZE);
      sprite.object.scale.set(sprite.baseW, sprite.baseH, 1);
      if (sprite.lod) {
        const dist = Math.max(Math.abs(sprite.x - playerX), Math.abs(sprite.y - playerY));
        const lodIndex = dist <= 1 ? 0 : dist === 2 ? 1 : 2;
        sprite.material.map = sprite.lod[lodIndex];
        sprite.material.needsUpdate = true;
      }
      return;
    }
    const onOwn = sprite.x === playerX && sprite.y === playerY;
    if (onOwn) {
      sprite.object.position.set(
        camX + fx * OWN_SQUARE_FORWARD,
        sprite.floorY,
        camZ + fz * OWN_SQUARE_FORWARD
      );
      sprite.object.scale.set(sprite.baseW * OWN_SQUARE_SCALE, sprite.baseH * OWN_SQUARE_SCALE, 1);
      if (sprite.lod) {
        sprite.material.map = sprite.lod[0];
        sprite.material.needsUpdate = true;
      }
      return;
    }
    sprite.object.position.set(
      sprite.x * CELL_SIZE - fx * ITEM_FRONT_HALF,
      sprite.floorY,
      sprite.y * CELL_SIZE - fz * ITEM_FRONT_HALF
    );
    sprite.object.scale.set(sprite.baseW, sprite.baseH, 1);
    if (sprite.lod) {
      const dist = Math.max(Math.abs(sprite.x - playerX), Math.abs(sprite.y - playerY));
      const lodIndex = dist <= 1 ? 0 : dist === 2 ? 1 : 2;
      sprite.material.map = sprite.lod[lodIndex];
      sprite.material.needsUpdate = true;
    }
  }

  private applyMonsterLod(sprite: SpriteInfo, dist: number) {
    const hasClose = !!sprite.lodSets?.close;
    const lod = monsterLodName(dist, hasClose);
    if (sprite.currentLod === lod && sprite.sets === sprite.lodSets?.[lod]) return;
    const sets = sprite.lodSets?.[lod] ?? sprite.lodSets?.near;
    if (!sets) return;
    sprite.currentLod = lod;
    sprite.sets = sets;
    const frames = sets[sprite.anim] ?? sets.idle;
    if (!frames?.length) return;
    sprite.frames = frames;
    sprite.currentFrame = Math.min(sprite.currentFrame, frames.length - 1);
    if (sprite.frostFlash) return;
    sprite.material.map = frames[sprite.currentFrame];
    sprite.material.needsUpdate = true;
  }

  private frameFile(sprite: SpriteInfo): string {
    if (sprite.kind !== 'monster' || !sprite.monsterKind) return '';
    const anim = sprite.anim === 'windup' ? 'attack' : sprite.anim;
    const lod = sprite.currentLod ?? 'near';
    return `${sprite.monsterKind}_${anim}_${sprite.currentFrame + 1}_${lod}.png`;
  }

  screenRect(sprite: SpriteInfo, viewW: number, viewH: number) {
    const obj = sprite.object;
    obj.updateMatrixWorld();
    const cam = this.camera;
    const toScreen = (lx: number, ly: number) => {
      const v = new THREE.Vector3(lx, ly, 0).applyMatrix4(obj.matrixWorld).project(cam);
      return { x: ((v.x + 1) / 2) * viewW, y: ((-v.y + 1) / 2) * viewH };
    };
    const feet = toScreen(0, 0);
    const top = toScreen(0, 1);
    const left = toScreen(-0.5, 0.5);
    const right = toScreen(0.5, 0.5);
    const height = feet.y - top.y;
    const file = this.frameFile(sprite);
    const a = file ? this.anchors.get(file) : undefined;
    const imageH = a?.imageH || sprite.imageH || 1;
    const bodyRows = a ? Math.max(1, a.footRow - a.topRow + 1) : imageH;
    return {
      feetY: feet.y,
      topY: top.y,
      height,
      idleBodyHeight: height * (bodyRows / imageH),
      width: Math.abs(right.x - left.x),
      worldX: obj.position.x,
      worldY: obj.position.y,
      worldZ: obj.position.z,
      scaleX: obj.scale.x,
      scaleY: obj.scale.y,
      lod: sprite.currentLod ?? null,
      v2: !!sprite.v2
    };
  }

  update(time: number, playerX?: number, playerY?: number, dir?: number) {
    for (const sprite of this.sprites) {
      if (sprite.hidden) {
        sprite.object.visible = false;
        continue;
      }
      if (sprite.frames && sprite.frames.length > 1 && sprite.animSpeed > 0) {
        if (time - sprite.lastFrameTime > sprite.animSpeed) {
          if (sprite.animOnce && sprite.currentFrame >= sprite.frames.length - 1) {
            if (sprite.anim === 'death') {
              sprite.object.visible = false;
              sprite.hidden = true;
            } else if (sprite.anim !== 'windup') {
              this.playAnimAt(sprite, 'idle', time);
            }
          } else {
            sprite.currentFrame = sprite.animOnce
              ? Math.min(sprite.frames.length - 1, sprite.currentFrame + 1)
              : (sprite.currentFrame + 1) % sprite.frames.length;
            if (!sprite.frostFlash) {
              sprite.material.map = sprite.frames[sprite.currentFrame];
              sprite.material.needsUpdate = true;
            }
          }
          sprite.lastFrameTime = time;
        }
      }
    }
    this.updateHitFx(time);
    if (playerX !== undefined && playerY !== undefined && dir !== undefined) {
      this.layoutBillboards(playerX, playerY, dir);
    }
  }

  private async loadAnchors(baseUrl: string) {
    try {
      const json = (await fetchJsonCached(`${baseUrl}art/dungeon/monster_anchor.json`)) as {
        files?: Record<string, { gapBelow?: number; topRow?: number; footRow?: number; imageW?: number; imageH?: number }>;
        canvas?: Partial<Record<LodName, [number, number]>>;
        distanceFrames?: {
          monsters?: Record<string, Partial<Record<LodName, { px?: [number, number] }>>>;
          files?: Record<string, { gapBelow?: number; topRow?: number; footRow?: number; imageW?: number; imageH?: number }>;
        };
      };
      const canvas: Record<LodName, [number, number]> = {
        close: json.canvas?.close ?? json.canvas?.near ?? [80, 60],
        near: json.canvas?.near ?? [80, 60],
        mid: json.canvas?.mid ?? [50, 40],
        far: json.canvas?.far ?? [30, 25]
      };
      const addFile = (
        file: string,
        info: { gapBelow?: number; topRow?: number; footRow?: number; imageW?: number; imageH?: number }
      ) => {
        const lod = lodFromFile(file);
        const [cw, ch] = canvas[lod];
        const imageW = info.imageW ?? cw;
        const imageH = info.imageH ?? ch;
        this.anchors.set(file, {
          gapBelow: info.gapBelow ?? 0,
          imageW,
          imageH,
          topRow: info.topRow ?? 0,
          footRow: info.footRow ?? imageH - 1
        });
      };
      for (const [file, info] of Object.entries(json.files ?? {})) addFile(file, info);
      for (const [file, info] of Object.entries(json.distanceFrames?.files ?? {})) addFile(file, info);
      for (const [kind, sets] of Object.entries(json.distanceFrames?.monsters ?? {})) {
        const px: Partial<Record<LodName, [number, number]>> = {};
        for (const lod of LOD_NAMES) {
          const pair = sets[lod]?.px;
          if (pair && pair.length >= 2) px[lod] = [pair[0], pair[1]];
        }
        if (Object.keys(px).length) this.v2Px.set(kind, px);
      }
    } catch {
      // keep gap 0
    }
  }

  private async loadHeights(baseUrl: string) {
    try {
      const json = (await fetchJsonCached(`${baseUrl}levels/monsters.json`)) as Record<
        string,
        { size?: { worldHeight?: number } }
      >;
      for (const [id, raw] of Object.entries(json)) {
        if (id.startsWith('_') || !raw || typeof raw !== 'object') continue;
        const h = raw.size?.worldHeight;
        if (typeof h === 'number' && h > 0) this.heights.set(id, h);
      }
    } catch {
      // defaults
    }
  }

  private wallHeightOf(kind: string): number {
    return this.heights.get(kind) ?? DEFAULT_WORLD_HEIGHT[kind] ?? 0.55;
  }

  private quadForLod(kind: string, lod: LodName, worldHeight: number, tex?: THREE.Texture): { w: number; h: number } {
    const v2 = this.v2Px.get(kind)?.[lod];
    if (v2) return quadForWorldHeight(worldHeight, CELL_SIZE, v2[0], v2[1]);
    const file = `${kind}_idle_1_${lod}.png`;
    const a = this.anchors.get(file);
    const fallback = texSize(tex);
    const imageW = a?.imageW ?? fallback.w;
    const imageH = a?.imageH ?? fallback.h;
    return quadForWorldHeight(worldHeight, CELL_SIZE, imageW, imageH);
  }

  private feetFor(file: string, quadH: number, floorY: number): number {
    const a = this.anchors.get(file);
    if (!a || !a.imageH) return floorY;
    return floorY - a.gapBelow * (quadH / a.imageH);
  }

  private loadSet(
    folder: string,
    kind: string,
    anim: string,
    count: number,
    lod: LodName
  ): Promise<THREE.Texture[]> {
    const key = `${folder}|${kind}|${anim}|${lod}|${count}`;
    const cached = this.animCache.get(key);
    if (cached) return cached;
    const pending = this.loadSetUncached(folder, kind, anim, count, lod);
    this.animCache.set(key, pending);
    return pending;
  }

  private async loadSetUncached(
    folder: string,
    kind: string,
    anim: string,
    count: number,
    lod: LodName
  ): Promise<THREE.Texture[]> {
    const frames = await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const name = `${kind}_${anim}_${i + 1}_${lod}.png`;
        return this.loadTex(`${folder}/${name}`).catch(() => null);
      })
    );
    const out: THREE.Texture[] = [];
    for (const tex of frames) {
      if (!tex) break;
      out.push(tex);
    }
    return out;
  }

  monsterAt(x: number, y: number): SpriteInfo | undefined {
    return this.sprites.find((s) => s.kind === 'monster' && s.x === x && s.y === y && !s.hidden);
  }

  spriteByMonsterId(id: string): SpriteInfo | undefined {
    return this.sprites.find((s) => s.kind === 'monster' && s.monsterId === id);
  }

  bindMonster(x: number, y: number, id: string) {
    const s = this.sprites.find((s) => s.kind === 'monster' && s.x === x && s.y === y);
    if (s) s.monsterId = id;
  }

  moveMonster(fromX: number, fromY: number, toX: number, toY: number) {
    const s = this.monsterAt(fromX, fromY);
    if (!s) return;
    s.x = toX;
    s.y = toY;
    s.object.position.x = toX * CELL_SIZE;
    s.object.position.z = toY * CELL_SIZE;
  }

  moveMonsterId(id: string, toX: number, toY: number) {
    const s = this.spriteByMonsterId(id);
    if (!s) return;
    s.x = toX;
    s.y = toY;
    s.object.position.x = toX * CELL_SIZE;
    s.object.position.z = toY * CELL_SIZE;
  }

  playAnim(x: number, y: number, anim: SpriteInfo['anim'], now = 0) {
    const s = this.monsterAt(x, y);
    if (s) this.playAnimAt(s, anim, now);
  }

  playAnimId(id: string, anim: SpriteInfo['anim'], now = 0) {
    const s = this.spriteByMonsterId(id);
    if (s) this.playAnimAt(s, anim, now);
  }

  private playAnimAt(s: SpriteInfo, anim: SpriteInfo['anim'], now: number) {
    const lodSets = s.lodSets?.[s.currentLod ?? 'near'] ?? s.sets;
    const frames = lodSets?.[anim] ?? lodSets?.idle ?? s.sets?.[anim] ?? s.frames;
    if (!frames?.length) return;
    s.anim = anim;
    s.frames = frames;
    s.currentFrame = 0;
    s.lastFrameTime = now;
    s.animOnce = anim === 'attack' || anim === 'hurt' || anim === 'death';
    s.animSpeed = anim === 'death' ? 140 : anim === 'hurt' ? 180 : anim === 'windup' ? 280 : 200;
    s.material.map = frames[0];
    s.material.needsUpdate = true;
    if (anim === 'death') s.hidden = false;
  }

  hideMonster(x: number, y: number) {
    for (const s of this.sprites) {
      if (s.kind === 'monster' && s.x === x && s.y === y) {
        s.hidden = true;
        s.object.visible = false;
      }
    }
  }

  applyMonsterAlive() {
    for (const s of this.sprites) {
      if (s.kind !== 'monster') continue;
      if (s.hidden) {
        s.object.visible = false;
      }
    }
  }

  hideDeadMonsterId(id: string) {
    const s = this.spriteByMonsterId(id);
    if (!s) return;
    s.hidden = true;
    s.object.visible = false;
  }

  async addLiveMonster(scene: THREE.Scene, kind: string, x: number, y: number, id: string, feetY = 0) {
    const v2 = this.v2Px.has(kind);
    const folder = v2 ? V2_FOLDER : V1_FOLDER;
    const lodSets: NonNullable<SpriteInfo['lodSets']> = {};
    const lodSize: NonNullable<SpriteInfo['lodSize']> = {};
    const worldHeight = this.wallHeightOf(kind);
    const lods = v2 ? LOD_NAMES : (['near', 'mid', 'far'] as const);
    await Promise.all(
      lods.map(async (lod) => {
        const [idle, attack, hurt, death] = await Promise.all([
          this.loadSet(folder, kind, 'idle', 4, lod),
          this.loadSet(folder, kind, 'attack', 3, lod),
          this.loadSet(folder, kind, 'hurt', 1, lod),
          this.loadSet(folder, kind, 'death', 4, lod)
        ]);
        if (!idle.length) return;
        lodSets[lod] = { idle, attack, hurt, death, windup: attack.length ? [attack[0]] : idle };
        lodSize[lod] = this.quadForLod(kind, lod, worldHeight, idle[0]);
      })
    );
    const startLod: LodName = lodSets.near ? 'near' : ((Object.keys(lodSets)[0] as LodName | undefined) ?? 'near');
    const startSets = lodSets[startLod] ?? {};
    const frames = startSets.idle ?? [];
    if (!frames.length) return null;
    const size = lodSize[startLod] ?? quadForWorldHeight(worldHeight, CELL_SIZE, 80, 60);
    const feet = this.feetFor(`${kind}_idle_1_${startLod}.png`, size.h, feetY);
    const mat = makeSpriteMaterial(frames[0], true);
    const sprite = makeBillboard(mat, x * CELL_SIZE, feet, y * CELL_SIZE, size.w, size.h);
    sprite.renderOrder = SPRITE_RENDER_ORDER;
    scene.add(sprite);
    const info: SpriteInfo = {
      object: sprite,
      material: mat,
      x,
      y,
      kind: 'monster',
      monsterKind: kind,
      monsterId: id,
      spawnX: x,
      spawnY: y,
      v2,
      worldHeight,
      baseW: size.w,
      baseH: size.h,
      floorY: feet,
      tileFloorY: feetY,
      imageH: this.anchors.get(`${kind}_idle_1_${startLod}.png`)?.imageH ?? texSize(frames[0]).h,
      gapBelow: this.anchors.get(`${kind}_idle_1_${startLod}.png`)?.gapBelow ?? 0,
      frames,
      sets: startSets,
      lodSets,
      lodSize,
      currentLod: startLod,
      currentFrame: 0,
      animSpeed: 200,
      lastFrameTime: 0,
      anim: 'idle',
      animOnce: false
    };
    this.sprites.push(info);
    return info;
  }

  resetMonsters(floor: FloorData) {
    for (const s of this.sprites) {
      if (s.kind !== 'monster') continue;
      s.hidden = false;
      s.object.visible = true;
      if (s.spawnX != null && s.spawnY != null) {
        s.x = s.spawnX;
        s.y = s.spawnY;
        s.object.position.x = s.x * CELL_SIZE;
        s.object.position.z = s.y * CELL_SIZE;
      }
      s.monsterId = undefined;
      this.playAnimAt(s, 'idle', 0);
    }
    this.clearHitFx();
    void floor;
  }

  playHitFx(id: string, kind: HitKind, now: number) {
    this.lastHitType = kind;
    const host = this.spriteByMonsterId(id);
    if (host && isSlimeKind(host.monsterKind) && kind === 'resist') {
      this.playSlimeFrostFlash(host, now);
      return;
    }
    const specName = kind === 'resist' ? 'resist' : kind === 'weak' ? 'weak' : null;
    if (!specName) return;
    const spec = this.hitFx.get(specName);
    const scene = this.scene;
    if (!spec || !host || !scene || !spec.frames.length) return;

    const existing = this.playingFx.find((fx) => fx.hostId === id);
    if (existing) this.removeHitFx(existing);

    const mat = new THREE.SpriteMaterial({
      map: spec.frames[0],
      color: 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
      toneMapped: false,
      blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      alphaTest: spec.additive ? 0 : 0.01
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(spec.pivotX, 1 - spec.pivotYFromTop);
    sprite.frustumCulled = false;
    sprite.renderOrder = HITFX_RENDER_ORDER;
    sprite.userData.isSprite = true;
    sprite.userData.skipVertexLighting = true;
    sprite.userData.kind = 'hitfx';
    const w = host.baseW * (spec.imgW / MONSTER_TEXEL_W);
    const h = host.baseH * (spec.imgH / MONSTER_TEXEL_H);
    sprite.scale.set(w, h, 1);
    scene.add(sprite);
    const play: HitFxPlay = {
      sprite,
      material: mat,
      frames: spec.frames,
      started: now,
      fps: spec.fps,
      hostId: id,
      imgW: spec.imgW,
      imgH: spec.imgH,
      pivotX: spec.pivotX,
      pivotYFromTop: spec.pivotYFromTop,
      holdFrames: specName === 'weak' ? FROST_HOLD_FRAMES : 0,
      holdFps: specName === 'weak' ? FROST_HOLD_FPS : spec.fps,
      tintHost: specName === 'weak',
      frame: 0
    };
    this.playingFx.push(play);
    this.placeHitFx(play, host);
    this.applyHostTint(play, host);
  }

  private playSlimeFrostFlash(host: SpriteInfo, now: number) {
    const existing = this.playingFx.find((fx) => fx.hostId === host.monsterId);
    if (existing) this.removeHitFx(existing);
    const lod = host.currentLod ?? 'near';
    const kind = host.monsterKind ?? 'slime';
    const tex = this.slimeFrostTex.get(`${kind}:${lod}`) ?? this.slimeFrostTex.get(`${kind}:near`);
    const restore = host.material instanceof THREE.SpriteMaterial ? host.material.map : null;
    host.frostFlash = true;
    if (tex && host.material instanceof THREE.SpriteMaterial) {
      host.material.map = tex;
      host.material.needsUpdate = true;
    }
    const play: HitFxPlay = {
      sprite: null,
      material: null,
      frames: tex ? [tex] : [],
      started: now,
      fps: FROST_HOLD_FPS,
      hostId: host.monsterId ?? '',
      imgW: 0,
      imgH: 0,
      pivotX: 0.5,
      pivotYFromTop: 0.5,
      holdFrames: FROST_HOLD_FRAMES,
      holdFps: FROST_HOLD_FPS,
      tintHost: true,
      frame: 0,
      restoreHostMap: restore,
      bodySwap: true
    };
    this.playingFx.push(play);
    this.applyHostTint(play, host);
  }

  private async loadSlimeFrostFrames() {
    for (const kind of ['slime', 'slime_small'] as const) {
      await Promise.all(
        LOD_NAMES.map(async (lod) => {
          try {
            const tex = await this.loadTex(slimeFrostFramePath(kind, lod));
            this.slimeFrostTex.set(`${kind}:${lod}`, tex);
          } catch {
            // missing LOD still tints; each kind uses its own <idle>_frost name
          }
        })
      );
    }
  }

  private hitFxFrame(fx: HitFxPlay, elapsedSec: number): number {
    if (fx.holdFrames <= 0) return Math.floor(elapsedSec * fx.fps);
    const holdDur = fx.holdFrames / fx.holdFps;
    if (elapsedSec < holdDur) return Math.floor(elapsedSec * fx.holdFps);
    return fx.holdFrames + Math.floor((elapsedSec - holdDur) * fx.fps);
  }

  private applyHostTint(fx: HitFxPlay, host: SpriteInfo) {
    if (!fx.tintHost) return;
    const hold = fx.frame >= 0 && fx.frame < fx.holdFrames;
    const amount = hold ? FROST_LERP : 0;
    host.frostAmount = amount;
    if (host.material instanceof THREE.SpriteMaterial) setFrostAmount(host.material, amount);
  }

  private async loadHitFx(baseUrl: string) {
    try {
      const json = (await fetchJsonCached(`${baseUrl}art/fx/hits/hits.json`)) as {
        effects?: Record<
          string,
          {
            frames?: number;
            fps?: number;
            blend?: string;
            sizes?: { near?: [number, number] };
            pivotInImage?: { x?: number; yFromTop?: number };
          }
        >;
        map?: { resist?: string; weak?: string };
        bodyAnchors?: Record<string, { near?: { u?: number; vFromBottom?: number } }>;
      };
      for (const [kind, near] of Object.entries(json.bodyAnchors ?? {})) {
        this.bodyAnchors.set(kind, {
          u: near.near?.u ?? 0.5,
          vFromBottom: near.near?.vFromBottom ?? 0.4
        });
      }
      const loadEffect = async (key: 'resist' | 'weak', effectName: string) => {
        const fx = json.effects?.[effectName];
        if (!fx) return;
        const n = fx.frames ?? 4;
        const loaded = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            this.loadTex(`art/fx/hits/${effectName}_${i + 1}_near.png`).catch(() => null)
          )
        );
        const frames: THREE.Texture[] = [];
        for (const tex of loaded) {
          if (!tex) break;
          frames.push(tex);
        }
        const size = fx.sizes?.near ?? [40, 30];
        this.hitFx.set(key, {
          frames,
          fps: fx.fps ?? 12,
          additive: /additive/i.test(fx.blend ?? ''),
          imgW: size[0],
          imgH: size[1],
          pivotX: fx.pivotInImage?.x ?? 0.5,
          pivotYFromTop: fx.pivotInImage?.yFromTop ?? 0.5
        });
      };
      await loadEffect('resist', json.map?.resist ?? 'resist_goo');
      await loadEffect('weak', json.map?.weak ?? 'weak_frost');
    } catch {
      // optional art
    }
    await this.loadSlimeFrostFrames();
  }

  private placeHitFx(fx: HitFxPlay, host: SpriteInfo) {
    if (fx.bodySwap || !fx.sprite) return;
    const anchor = this.bodyAnchors.get(host.monsterKind ?? '') ?? { u: 0.5, vFromBottom: 0.4 };
    const wx = host.object.position.x + (anchor.u - 0.5) * host.baseW;
    const wy = host.floorY + anchor.vFromBottom * host.baseH;
    const wz = host.object.position.z;
    const cam = this.camera.position;
    const dx = cam.x - wx;
    const dz = cam.z - wz;
    const len = Math.hypot(dx, dz) || 1;
    fx.sprite.position.set(wx + (dx / len) * 0.01, wy, wz + (dz / len) * 0.01);
    const w = host.baseW * (fx.imgW / MONSTER_TEXEL_W);
    const h = host.baseH * (fx.imgH / MONSTER_TEXEL_H);
    fx.sprite.scale.set(w, h, 1);
    fx.sprite.visible = host.object.visible && !host.hidden;
  }

  private updateHitFx(time: number) {
    const live: HitFxPlay[] = [];
    for (const fx of this.playingFx) {
      const host = this.spriteByMonsterId(fx.hostId);
      if (!host) {
        this.removeHitFx(fx);
        continue;
      }
      this.placeHitFx(fx, host);
      if (fx.bodySwap) {
        const elapsed = (time - fx.started) / 1000;
        const holdDur = fx.holdFrames / fx.holdFps;
        fx.frame = Math.min(Math.max(fx.holdFrames - 1, 0), Math.floor(elapsed * fx.holdFps));
        if (elapsed >= holdDur) {
          this.removeHitFx(fx);
          continue;
        }
        this.applyHostTint(fx, host);
        live.push(fx);
        continue;
      }
      const frame = this.hitFxFrame(fx, (time - fx.started) / 1000);
      if (frame >= fx.frames.length) {
        this.removeHitFx(fx);
        continue;
      }
      fx.frame = frame;
      this.applyHostTint(fx, host);
      const tex = fx.frames[Math.max(0, frame)];
      if (fx.material && fx.material.map !== tex) {
        fx.material.map = tex;
        fx.material.needsUpdate = true;
      }
      live.push(fx);
    }
    this.playingFx = live;
  }

  private removeHitFx(fx: HitFxPlay) {
    const host = this.spriteByMonsterId(fx.hostId);
    if (host && fx.tintHost) {
      host.frostAmount = 0;
      if (host.material instanceof THREE.SpriteMaterial) setFrostAmount(host.material, 0);
    }
    if (host && fx.bodySwap) {
      host.frostFlash = false;
      if (fx.restoreHostMap && host.material instanceof THREE.SpriteMaterial) {
        host.material.map = fx.restoreHostMap;
        host.material.needsUpdate = true;
      }
    }
    if (fx.sprite) {
      fx.sprite.visible = false;
      fx.sprite.parent?.remove(fx.sprite);
    }
    fx.material?.dispose();
  }

  private clearHitFx() {
    for (const fx of this.playingFx) this.removeHitFx(fx);
    this.playingFx = [];
    this.lastHitType = null;
  }

  hitFxPlaying(): Array<{ hostId: string; frames: number; frame: number; tint: number }> {
    return this.playingFx.map((fx) => {
      const host = this.spriteByMonsterId(fx.hostId);
      return {
        hostId: fx.hostId,
        frames: fx.frames.length,
        frame: fx.frame,
        tint: host?.material.color.getHex() ?? 0xffffff
      };
    });
  }

  hostTint(id: string): number {
    const frost = this.playingFx.some(
      (fx) => fx.hostId === id && fx.tintHost && fx.frame >= 0 && fx.frame < fx.holdFrames
    );
    return frost ? FROST_COLOR : 0xffffff;
  }
}
