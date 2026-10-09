import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  SCONCE_ANIM_FPS,
  SCONCE_HEIGHT_TILES,
  SCONCE_WALL_OFFSET_TILES,
  SCONCE_WIDTH_TILES,
  SPRITE_SURFACE_LIFT,
  WATER_SURFACE_Y,
  cameraOffsetXZ,
  isWaterTile,
  sconceNeedsMirror,
  tileBedY
} from './constants';
import { FloorData, Sconce, Tile } from './types';

/** World size of near idle billboards. Leeches sit low on the water. */
const MONSTER_SPRITE: Record<string, { w: number; h: number }> = {
  slime: { w: 1.85, h: 1.7 },
  bog_leeches: { w: 1.9, h: 0.7 },
  rust_crab: { w: 1.5, h: 1.1 },
  keep_rat: { w: 1.3, h: 1.2 }
};

const ITEM_SPRITE: Record<string, { file: string; w: number; h: number }> = {
  key: { file: 'item_key_near.png', w: 0.62, h: 0.32 },
  potion_red: { file: 'item_potion_red_near.png', w: 0.3, h: 0.44 },
  potion_blue: { file: 'item_potion_blue_near.png', w: 0.3, h: 0.44 },
  potion_green: { file: 'item_potion_green_near.png', w: 0.3, h: 0.44 },
  chest: { file: 'item_chest_near.png', w: 0.72, h: 0.5 },
  scroll: { file: 'item_scroll_near.png', w: 0.42, h: 0.32 }
};

const OWN_SQUARE_SCALE = 0.55;
const OWN_SQUARE_FORWARD = 0.82;
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

function placeOnWall(
  obj: THREE.Object3D,
  cellX: number,
  cellY: number,
  face: Sconce['face'],
  y: number,
  insetTiles: number
) {
  const { nx, nz, rotY } = FACE_INTO_ROOM[face];
  const dist = CELL_SIZE / 2 + insetTiles * CELL_SIZE;
  obj.position.set(cellX * CELL_SIZE + nx * dist, y, cellY * CELL_SIZE + nz * dist);
  obj.rotation.y = rotY;
}

function flipUVs(geo: THREE.PlaneGeometry) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, 1 - uv.getX(i));
  }
  uv.needsUpdate = true;
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

  async loadSprites(
    scene: THREE.Scene,
    floorData: FloorData,
    sconces: readonly Sconce[],
    cappedSconces: Set<string> = new Set()
  ) {
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

        if (tile.item && !(tile.secret && !tile.secretOpen)) {
          const def = ITEM_SPRITE[tile.item] ?? {
            file: `item_${tile.item}_near.png`,
            w: 0.4,
            h: 0.4
          };
          const tex = await loadTex(`art/dungeon/${def.file}`);
          const mat = makeSpriteMaterial(tex);
          const sprite = makeBillboard(mat, x * CELL_SIZE, feetY, y * CELL_SIZE, def.w, def.h);
          sprite.userData.item = tile.item;
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
            currentFrame: 0,
            animSpeed: 0,
            lastFrameTime: 0
          });
        }
      }
    }

    const [sconceDead, sconceLit1, sconceLit2, sconceLit3] = await Promise.all([
      loadTex('proto3d/tex3d/sconce_dead.png'),
      loadTex('proto3d/tex3d/sconce_lit_1.png'),
      loadTex('proto3d/tex3d/sconce_lit_2.png'),
      loadTex('proto3d/tex3d/sconce_lit_3.png')
    ]);
    const litFrames = [sconceLit1, sconceLit2, sconceLit3];
    const sconceW = SCONCE_WIDTH_TILES * CELL_SIZE;
    const sconceH = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const midHeight = CELL_SIZE / 2;
    const frameMs = 1000 / SCONCE_ANIM_FPS;

    for (const sconce of sconces) {
      if (!sconce.lit && cappedSconces.has(`${sconce.x},${sconce.y}`)) continue;
      const map = sconce.lit ? litFrames[0] : sconceDead;
      const geo = new THREE.PlaneGeometry(sconceW, sconceH);
      if (sconceNeedsMirror(sconce.face)) flipUVs(geo);

      const mat = new THREE.MeshBasicMaterial({
        map,
        color: 0xffffff,
        transparent: true,
        alphaTest: CUTOUT_ALPHA_TEST,
        depthTest: true,
        depthWrite: true,
        fog: false,
        toneMapped: false,
        side: THREE.FrontSide
      });

      const mesh = new THREE.Mesh(geo, mat);
      placeOnWall(mesh, sconce.x, sconce.y, sconce.face, midHeight, SCONCE_WALL_OFFSET_TILES);
      mesh.renderOrder = 1;
      mesh.userData.skipVertexLighting = true;
      mesh.userData.isSconce = true;
      scene.add(mesh);

      this.sprites.push({
        object: mesh,
        material: mat,
        x: sconce.x,
        y: sconce.y,
        kind: 'sconce',
        baseW: sconceW,
        baseH: sconceH,
        floorY: midHeight,
        frames: sconce.lit ? litFrames : undefined,
        currentFrame: 0,
        animSpeed: sconce.lit ? frameMs : 0,
        lastFrameTime: 0
      });
    }
  }

  sconceFrame(): number {
    const lit = this.sprites.find((s) => s.frames && s.frames.length === 3 && s.animSpeed > 0);
    return lit?.currentFrame ?? 0;
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
      } else {
        sprite.object.position.set(sprite.x * CELL_SIZE, sprite.floorY, sprite.y * CELL_SIZE);
        sprite.object.scale.set(sprite.baseW, sprite.baseH, 1);
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
