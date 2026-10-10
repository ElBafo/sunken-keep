import * as THREE from 'three';
import {
  CELL_SIZE,
  EYE_ANIM_FPS,
  GLINT_ANIM_FPS,
  GLINT_REST_MAX_MS,
  GLINT_REST_MIN_MS,
  SPRITE_SURFACE_LIFT,
  WATER_SURFACE_Y,
  isWaterTile,
  tileBedY
} from './constants';
import { FloorData, Tile } from './types';
import { SpriteManager } from './sprites';
import { VertexLightingManager } from './vertex-lighting';
import { AudioManager } from './audio';

const EYE_FRAMES = 10;
const GLINT_FRAMES = 6;
const FX_RENDER_ORDER = 14;
const EYE_LOW = new Set(['bog_leeches', 'keep_rat']);

export type EyeTint = 'green' | 'amber' | 'pale';

function eyeTint(monster: string): EyeTint {
  if (monster.includes('drowned') || monster.includes('tide')) return 'pale';
  if (EYE_LOW.has(monster) || monster.includes('leech') || monster.includes('rat')) return 'green';
  return 'amber';
}

function isGlintItem(name: string | undefined): boolean {
  return name === 'key' || name === 'lever';
}

function bedY(tile: Tile): number {
  if (isWaterTile(tile)) return WATER_SURFACE_Y + SPRITE_SURFACE_LIFT;
  return tileBedY(tile) + SPRITE_SURFACE_LIFT;
}

function configureFxTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
}

function fxMaterial(map: THREE.Texture) {
  return new THREE.SpriteMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
    toneMapped: false
  });
}

interface EyeSlot {
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  monster: string;
  tint: EyeTint;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  frames: THREE.Texture[];
  frame: number;
  nextAt: number;
  resting: boolean;
  presenceId: string | null;
}

interface GlintSlot {
  x: number;
  y: number;
  item: string;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  frames: THREE.Texture[];
  frame: number;
  nextAt: number;
  resting: boolean;
  heard: boolean;
}

export class DarkFx {
  private eyes: EyeSlot[] = [];
  private glints: GlintSlot[] = [];
  private stairs: THREE.Mesh[] = [];
  private glowMap: THREE.Texture | null = null;

  async load(scene: THREE.Scene, floorData: FloorData, sprites: SpriteManager) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const loadTex = (path: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureFxTexture(tex);
            resolve(tex);
          },
          undefined,
          (err) => reject(new Error(`Failed to load ${path}: ${String(err)}`))
        );
      });

    const green = await Promise.all(
      Array.from({ length: EYE_FRAMES }, (_, i) => loadTex(`proto3d/fx/dark/eyes_green_${i + 1}.png`))
    );
    const amber = await Promise.all(
      Array.from({ length: EYE_FRAMES }, (_, i) => loadTex(`proto3d/fx/dark/eyes_amber_${i + 1}.png`))
    );
    const pale = await Promise.all(
      Array.from({ length: EYE_FRAMES }, (_, i) => loadTex(`proto3d/fx/dark/eyes_pale_${i + 1}.png`))
    );
    const glintFrames = await Promise.all(
      Array.from({ length: GLINT_FRAMES }, (_, i) => loadTex(`proto3d/fx/dark/glint_${i + 1}.png`))
    );
    this.glowMap = await loadTex('proto3d/fx/dark/stairs_glow.png');

    const tints: Record<EyeTint, THREE.Texture[]> = { green, amber, pale };
    const { tiles, width, height } = floorData;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y][x];
        const feet = bedY(tile);
        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;

        if (tile.monster) {
          const tint = eyeTint(tile.monster);
          const frames = tints[tint];
          const host = sprites.sprites.find((s) => s.kind === 'monster' && s.x === x && s.y === y);
          const w = (host?.baseW ?? 1.4) * 0.7;
          const h = w * 0.5;
          const lift = EYE_LOW.has(tile.monster) ? 0.15 : 0.55;
          const mat = fxMaterial(frames[0]);
          const sprite = new THREE.Sprite(mat);
          sprite.center.set(0.5, 0.5);
          sprite.position.set(wx, feet + lift, wz);
          sprite.scale.set(w, h, 1);
          sprite.frustumCulled = false;
          sprite.renderOrder = FX_RENDER_ORDER;
          sprite.visible = false;
          sprite.userData.isSprite = true;
          sprite.userData.skipVertexLighting = true;
          sprite.userData.kind = 'eye-glint';
          scene.add(sprite);
          this.eyes.push({
            x,
            y,
            spawnX: x,
            spawnY: y,
            monster: tile.monster,
            tint,
            sprite,
            material: mat,
            frames,
            frame: 0,
            nextAt: 0,
            resting: false,
            presenceId: null
          });
        }

        const item = tile.item || (tile.lever ? 'lever' : undefined);
        if (isGlintItem(item) && !(tile.secret && !tile.secretOpen)) {
          const mat = fxMaterial(glintFrames[0]);
          const sprite = new THREE.Sprite(mat);
          sprite.center.set(0.5, 0.5);
          sprite.position.set(wx, feet + 0.22, wz);
          sprite.scale.set(0.28, 0.28, 1);
          sprite.frustumCulled = false;
          sprite.renderOrder = FX_RENDER_ORDER;
          sprite.visible = false;
          sprite.userData.isSprite = true;
          sprite.userData.skipVertexLighting = true;
          sprite.userData.kind = 'item-glint';
          scene.add(sprite);
          this.glints.push({
            x,
            y,
            item: item!,
            sprite,
            material: mat,
            frames: glintFrames,
            frame: 0,
            nextAt: 0,
            resting: false,
            heard: false
          });
        }

        if (tile.stairs === 'down') {
          const mat = new THREE.MeshBasicMaterial({
            map: this.glowMap,
            color: 0xc8ffd4,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            fog: false,
            toneMapped: false,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE * 0.95, CELL_SIZE * 0.42), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(wx, feet + 0.01, wz);
          mesh.renderOrder = FX_RENDER_ORDER - 1;
          mesh.userData.skipVertexLighting = true;
          mesh.userData.kind = 'stairs-glow';
          scene.add(mesh);
          this.stairs.push(mesh);
        }
      }
    }

  }

  hideItemAt(x: number, y: number) {
    for (const g of this.glints) {
      if (g.x === x && g.y === y) g.sprite.visible = false;
    }
  }

  moveEye(fromX: number, fromY: number, toX: number, toY: number, audio?: AudioManager) {
    const eye = this.eyes.find((e) => e.x === fromX && e.y === fromY);
    if (!eye) return;
    eye.x = toX;
    eye.y = toY;
    eye.sprite.position.x = toX * CELL_SIZE;
    eye.sprite.position.z = toY * CELL_SIZE;
    if (eye.presenceId) {
      audio?.stopNamedLoop(eye.presenceId);
      eye.presenceId = null;
    }
  }

  hideEye(x: number, y: number, audio?: AudioManager) {
    for (const eye of this.eyes) {
      if (eye.x === x && eye.y === y) {
        eye.sprite.visible = false;
        if (eye.presenceId) {
          audio?.stopNamedLoop(eye.presenceId);
          eye.presenceId = null;
        }
      }
    }
  }

  resetEyes(audio?: AudioManager) {
    for (const eye of this.eyes) {
      if (eye.presenceId) {
        audio?.stopNamedLoop(eye.presenceId);
        eye.presenceId = null;
      }
      eye.x = eye.spawnX;
      eye.y = eye.spawnY;
      eye.sprite.position.x = eye.x * CELL_SIZE;
      eye.sprite.position.z = eye.y * CELL_SIZE;
      eye.sprite.visible = false;
    }
  }

  update(
    now: number,
    lighting: VertexLightingManager,
    sprites: SpriteManager,
    audio: AudioManager,
    partyX: number,
    partyY: number
  ) {
    audio.setTrueDark(lighting.getAmbientFloor() >= 3);
    const frameMs = 1000 / EYE_ANIM_FPS;
    const glintMs = 1000 / GLINT_ANIM_FPS;

    for (const eye of this.eyes) {
      const host = sprites.sprites.find(
        (s) => s.kind === 'monster' && s.x === eye.x && s.y === eye.y && !s.hidden
      );
      if (!host) {
        eye.sprite.visible = false;
        if (eye.presenceId) {
          audio.stopNamedLoop(eye.presenceId);
          eye.presenceId = null;
        }
        continue;
      }
      const adjacent = Math.abs(eye.x - partyX) + Math.abs(eye.y - partyY) <= 1;
      const lit = adjacent || lighting.isSquareLit(eye.x, eye.y);
      sprites.setLitVisible(eye.x, eye.y, 'monster', lit);
      eye.sprite.visible = !lit;
      if (lit) {
        if (eye.presenceId) {
          audio.stopNamedLoop(eye.presenceId);
          eye.presenceId = null;
        }
        continue;
      }
      if (!eye.presenceId && lighting.getAmbientFloor() >= 3) {
        const id = audio.startNamedLoop(
          'dark_presence',
          eye.x * CELL_SIZE,
          eye.sprite.position.y,
          eye.y * CELL_SIZE,
          0.3
        );
        if (id) eye.presenceId = id;
      }
      if (now >= eye.nextAt) {
        if (eye.resting) {
          eye.resting = false;
          eye.frame = 0;
        } else {
          eye.frame += 1;
          if (eye.frame >= eye.frames.length) {
            eye.frame = 0;
            eye.resting = true;
            eye.nextAt = now + Math.random() * 3000;
            eye.material.map = eye.frames[0];
            eye.material.needsUpdate = true;
            continue;
          }
        }
        eye.material.map = eye.frames[eye.frame];
        eye.material.needsUpdate = true;
        eye.nextAt = now + frameMs;
      }
    }

    for (const g of this.glints) {
      const lit = lighting.isSquareLit(g.x, g.y);
      sprites.setLitVisible(g.x, g.y, 'item', lit);
      const show = !lit && sprites.isItemPresent(g.x, g.y);
      g.sprite.visible = show;
      if (!show) continue;
      const dist = Math.max(Math.abs(g.x - partyX), Math.abs(g.y - partyY));
      if (!g.heard && dist <= 4) {
        g.heard = true;
        audio.playUi('glint');
      }
      if (now >= g.nextAt) {
        if (g.resting) {
          g.resting = false;
          g.frame = 0;
        } else {
          g.frame += 1;
          if (g.frame >= g.frames.length) {
            g.frame = 0;
            g.resting = true;
            g.nextAt = now + GLINT_REST_MIN_MS + Math.random() * (GLINT_REST_MAX_MS - GLINT_REST_MIN_MS);
            g.material.map = g.frames[0];
            g.material.needsUpdate = true;
            continue;
          }
        }
        g.material.map = g.frames[g.frame];
        g.material.needsUpdate = true;
        g.nextAt = now + glintMs;
      }
    }
  }

  snapshot() {
    return {
      eyes: this.eyes.map((e) => ({
        x: e.x,
        y: e.y,
        monster: e.monster,
        tint: e.tint,
        visible: e.sprite.visible
      })),
      glints: this.glints.map((g) => ({
        x: g.x,
        y: g.y,
        item: g.item,
        visible: g.sprite.visible
      })),
      stairs: this.stairs.length
    };
  }
}
