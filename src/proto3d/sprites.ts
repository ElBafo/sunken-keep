import * as THREE from 'three';
import {
  CELL_SIZE,
  SPRITE_SURFACE_LIFT,
  WATER_SURFACE_Y,
  cameraOffsetXZ,
  isWaterTile,
  tileBedY
} from './constants';
import { FloorData, Tile } from './types';

/** World height from ART_CONSISTENCY_AUDIT.md; width = height × 80/60 so texels stay square. */
const SPRITE_ASPECT = 80 / 60;
const MONSTER_HEIGHT: Record<string, number> = {
  keep_rat: 0.45,
  rust_crab: 0.55,
  bog_leeches: 0.35,
  slime: 0.9,
  cellar_spider: 0.8,
  drowned_dwarf: 1.15,
  captain_dural: 1.35,
  tide_spawn: 1.2
};
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

export function billboardSize(height: number): { w: number; h: number } {
  return { w: height * SPRITE_ASPECT, h: height };
}

const ITEM_SPRITE: Record<string, { file: string; h: number; base?: string; prefix?: string }> = {
  key: { file: 'item_key_near.png', h: ITEM_HEIGHT.key },
  potion_red: { file: 'item_potion_red_near.png', h: ITEM_HEIGHT.potion_red },
  potion_blue: { file: 'item_potion_blue_near.png', h: ITEM_HEIGHT.potion_blue },
  potion_green: { file: 'item_potion_green_near.png', h: ITEM_HEIGHT.potion_green },
  chest: { file: 'item_chest_near.png', h: ITEM_HEIGHT.chest },
  scroll: { file: 'item_scroll_near.png', h: ITEM_HEIGHT.scroll },
  oil: { file: 'item_oil_near.png', h: ITEM_HEIGHT.oil, base: 'proto3d/tex3d/torch', prefix: 'item_oil' },
  oil_flask: { file: 'item_oil_near.png', h: ITEM_HEIGHT.oil_flask, base: 'proto3d/tex3d/torch', prefix: 'item_oil' }
};

const OWN_SQUARE_SCALE = 0.72;
/** Must be in the visible floor strip (near plane hits y=0 at ~1.0 in front of the camera). */
const OWN_SQUARE_FORWARD = 1.18;
const SPRITE_RENDER_ORDER = 10;

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
  imageH: number;
  gapBelow: number;
  frames?: THREE.Texture[];
  sets?: Partial<Record<'idle' | 'attack' | 'hurt' | 'death' | 'windup', THREE.Texture[]>>;
  lod?: THREE.Texture[];
  currentFrame: number;
  animSpeed: number;
  lastFrameTime: number;
  anim: 'idle' | 'attack' | 'hurt' | 'death' | 'windup';
  animOnce: boolean;
  pickedUp?: boolean;
  hidden?: boolean;
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

function makeSpriteMaterial(map: THREE.Texture) {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.15,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false,
    toneMapped: false
  });
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
  private anchors = new Map<string, { gapBelow: number; imageH: number }>();

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  hideItemAt(x: number, y: number) {
    for (const sprite of this.sprites) {
      if (sprite.kind === 'item' && sprite.x === x && sprite.y === y) {
        sprite.pickedUp = true;
        sprite.object.visible = false;
      }
    }
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
        sprite.object.visible = lit;
      }
    }
  }

  async loadSprites(scene: THREE.Scene, floorData: FloorData) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    await this.loadAnchors(baseUrl);

    const loadTex = (path: string): Promise<THREE.Texture> => {
      return new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureSpriteTexture(tex);
            resolve(tex);
          },
          undefined,
          (err) => reject(new Error(`Failed to load sprite texture ${path}: ${String(err)}`))
        );
      });
    };

    const { tiles, width, height } = floorData;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        const feetY = spriteFeetY(tile);

        if (tile.monster) {
          const kind = tile.monster;
          const idle = await this.loadSet(loadTex, kind, 'idle', 4);
          const attack = await this.loadSet(loadTex, kind, 'attack', 3);
          const hurt = await this.loadSet(loadTex, kind, 'hurt', 1);
          const death = await this.loadSet(loadTex, kind, 'death', 4);
          const frames = idle.length ? idle : [await loadTex(`art/dungeon/${kind}_near.png`)];
          const size = billboardSize(MONSTER_HEIGHT[kind] ?? 0.9);
          const feet = this.feetFor(`${kind}_idle_1_near.png`, size.h, feetY);
          const mat = makeSpriteMaterial(frames[0]);
          const sprite = makeBillboard(mat, x * CELL_SIZE, feet, y * CELL_SIZE, size.w, size.h);
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
            kind: 'monster',
            monsterKind: kind,
            spawnX: x,
            spawnY: y,
            baseW: size.w,
            baseH: size.h,
            floorY: feet,
            imageH: 60,
            gapBelow: this.anchors.get(`${kind}_idle_1_near.png`)?.gapBelow ?? 0,
            frames,
            sets: { idle: frames, attack, hurt, death, windup: attack.length ? [attack[0]] : frames },
            currentFrame: 0,
            animSpeed: 200,
            lastFrameTime: 0,
            anim: 'idle',
            animOnce: false
          });
        }

        const itemName = tile.item || (tile.chest ? 'chest' : undefined);
        if (itemName && !(tile.secret && !tile.secretOpen)) {
          const def = ITEM_SPRITE[itemName] ?? {
            file: `item_${itemName}_near.png`,
            h: ITEM_HEIGHT[itemName] ?? 0.3
          };
          const folder = def.base ?? 'art/dungeon';
          const nearPath = def.prefix ? `${folder}/${def.prefix}_near.png` : `${folder}/${def.file}`;
          const tex = await loadTex(nearPath);
          let lod: THREE.Texture[] | undefined;
          if (def.prefix) {
            lod = await Promise.all([
              tex,
              loadTex(`${folder}/${def.prefix}_mid.png`),
              loadTex(`${folder}/${def.prefix}_far.png`)
            ]);
          }
          const size = billboardSize(def.h);
          const mat = makeSpriteMaterial(tex);
          const sprite = makeBillboard(mat, x * CELL_SIZE, feetY, y * CELL_SIZE, size.w, size.h);
          sprite.userData.item = itemName === 'oil_flask' ? 'oil' : itemName;
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
            kind: 'item',
            baseW: size.w,
            baseH: size.h,
            floorY: feetY,
            imageH: 60,
            gapBelow: 0,
            lod,
            currentFrame: 0,
            animSpeed: 0,
            lastFrameTime: 0,
            anim: 'idle',
            animOnce: false
          });
        }
      }
    }
  }

  layoutItems(playerX: number, playerY: number, dir: number) {
    const rotY = (-dir * Math.PI) / 2;
    const [ox, oz] = cameraOffsetXZ(rotY);
    const fx = -Math.sin(rotY);
    const fz = -Math.cos(rotY);
    const camX = playerX * CELL_SIZE + ox;
    const camZ = playerY * CELL_SIZE + oz;

    for (const sprite of this.sprites) {
      if (sprite.kind !== 'item' || !sprite.object.visible) continue;
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
      } else {
        sprite.object.position.set(sprite.x * CELL_SIZE, sprite.floorY, sprite.y * CELL_SIZE);
        sprite.object.scale.set(sprite.baseW, sprite.baseH, 1);
        if (sprite.lod) {
          const dist = Math.max(Math.abs(sprite.x - playerX), Math.abs(sprite.y - playerY));
          const lodIndex = dist <= 1 ? 0 : dist === 2 ? 1 : 2;
          sprite.material.map = sprite.lod[lodIndex];
          sprite.material.needsUpdate = true;
        }
      }
    }
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
            sprite.material.map = sprite.frames[sprite.currentFrame];
            sprite.material.needsUpdate = true;
          }
          sprite.lastFrameTime = time;
        }
      }
    }
    if (playerX !== undefined && playerY !== undefined && dir !== undefined) {
      this.layoutItems(playerX, playerY, dir);
    }
  }

  private async loadAnchors(baseUrl: string) {
    try {
      const res = await fetch(`${baseUrl}art/dungeon/monster_anchor.json`);
      if (!res.ok) return;
      const json = (await res.json()) as { files?: Record<string, { gapBelow?: number }>; canvas?: { near?: [number, number] } };
      const imageH = json.canvas?.near?.[1] ?? 60;
      for (const [file, info] of Object.entries(json.files ?? {})) {
        this.anchors.set(file, { gapBelow: info.gapBelow ?? 0, imageH });
      }
    } catch {
      // keep gap 0
    }
  }

  private feetFor(file: string, quadH: number, floorY: number): number {
    const a = this.anchors.get(file);
    if (!a) return floorY;
    return floorY - a.gapBelow * (quadH / a.imageH);
  }

  private async loadSet(
    loadTex: (path: string) => Promise<THREE.Texture>,
    kind: string,
    anim: string,
    count: number
  ): Promise<THREE.Texture[]> {
    const out: THREE.Texture[] = [];
    for (let i = 1; i <= count; i++) {
      try {
        out.push(await loadTex(`art/dungeon/${kind}_${anim}_${i}_near.png`));
      } catch {
        break;
      }
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
    const frames = s.sets?.[anim] ?? s.sets?.idle ?? s.frames;
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
    void floor;
  }
}
