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

/** World size of near idle billboards. Leeches sit low on the water. */
const MONSTER_SPRITE: Record<string, { w: number; h: number }> = {
  slime: { w: 1.85, h: 1.7 },
  bog_leeches: { w: 1.9, h: 0.7 },
  rust_crab: { w: 1.5, h: 1.1 },
  keep_rat: { w: 1.3, h: 1.2 }
};

const ITEM_SPRITE: Record<string, { file: string; w: number; h: number; base?: string; prefix?: string }> = {
  key: { file: 'item_key_near.png', w: 0.62, h: 0.32 },
  potion_red: { file: 'item_potion_red_near.png', w: 0.3, h: 0.44 },
  potion_blue: { file: 'item_potion_blue_near.png', w: 0.3, h: 0.44 },
  potion_green: { file: 'item_potion_green_near.png', w: 0.3, h: 0.44 },
  chest: { file: 'item_chest_near.png', w: 0.72, h: 0.5 },
  scroll: { file: 'item_scroll_near.png', w: 0.42, h: 0.32 },
  oil: { file: 'item_oil_near.png', w: 0.3, h: 0.44, base: 'proto3d/tex3d/torch', prefix: 'item_oil' },
  oil_flask: { file: 'item_oil_near.png', w: 0.3, h: 0.44, base: 'proto3d/tex3d/torch', prefix: 'item_oil' }
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
  baseW: number;
  baseH: number;
  floorY: number;
  frames?: THREE.Texture[];
  lod?: THREE.Texture[];
  currentFrame: number;
  animSpeed: number;
  lastFrameTime: number;
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

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  hideItemAt(x: number, y: number) {
    for (const sprite of this.sprites) {
      if (sprite.kind === 'item' && sprite.x === x && sprite.y === y) {
        sprite.object.visible = false;
      }
    }
  }

  async loadSprites(scene: THREE.Scene, floorData: FloorData) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;

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
          const frames = await Promise.all([
            loadTex(`art/dungeon/${kind}_idle_1_near.png`),
            loadTex(`art/dungeon/${kind}_idle_2_near.png`),
            loadTex(`art/dungeon/${kind}_idle_3_near.png`),
            loadTex(`art/dungeon/${kind}_idle_4_near.png`)
          ]);
          const size = MONSTER_SPRITE[kind] ?? { w: 1.6, h: 1.3 };
          const mat = makeSpriteMaterial(frames[0]);
          const sprite = makeBillboard(mat, x * CELL_SIZE, feetY, y * CELL_SIZE, size.w, size.h);
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
            kind: 'monster',
            baseW: size.w,
            baseH: size.h,
            floorY: feetY,
            frames,
            currentFrame: 0,
            animSpeed: 200,
            lastFrameTime: 0
          });
        }

        const itemName = tile.item || (tile.chest ? 'chest' : undefined);
        if (itemName && !(tile.secret && !tile.secretOpen)) {
          const def = ITEM_SPRITE[itemName] ?? {
            file: `item_${itemName}_near.png`,
            w: 0.4,
            h: 0.4
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
          const mat = makeSpriteMaterial(tex);
          const sprite = makeBillboard(mat, x * CELL_SIZE, feetY, y * CELL_SIZE, def.w, def.h);
          sprite.userData.item = itemName === 'oil_flask' ? 'oil' : itemName;
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
            kind: 'item',
            baseW: def.w,
            baseH: def.h,
            floorY: feetY,
            lod,
            currentFrame: 0,
            animSpeed: 0,
            lastFrameTime: 0
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
      if (sprite.frames && sprite.frames.length > 1 && sprite.animSpeed > 0) {
        if (time - sprite.lastFrameTime > sprite.animSpeed) {
          sprite.currentFrame = (sprite.currentFrame + 1) % sprite.frames.length;
          sprite.material.map = sprite.frames[sprite.currentFrame];
          sprite.material.needsUpdate = true;
          sprite.lastFrameTime = time;
        }
      }
    }
    if (playerX !== undefined && playerY !== undefined && dir !== undefined) {
      this.layoutItems(playerX, playerY, dir);
    }
  }
}
