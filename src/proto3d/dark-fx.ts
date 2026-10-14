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
import { loadSpriteTexture } from './atlas';
import { FloorData, Tile } from './types';
import { SpriteManager } from './sprites';
import { VertexLightingManager } from './vertex-lighting';
import { AudioManager } from './audio';
import type { SlimePairSlot } from '../core/slime-pair';

const EYE_FRAMES = 10;
const GLINT_FRAMES = 6;
const FX_RENDER_ORDER = 14;
const EYE_LOW = new Set(['bog_leeches', 'keep_rat']);
/** Eyes sit this far up a non-low monster's authored world height (inside the body). */
export const EYE_LIFT_FRAC = 0.7;

export function eyeLiftFor(kind: string, worldHeight: number): number {
  if (EYE_LOW.has(kind) || kind.includes('leech') || kind.includes('rat')) return 0.15;
  return worldHeight * EYE_LIFT_FRAC;
}

/** Body only when the square is lit, the party is adjacent, or a test hook forced it. */
export function monsterBodyVisible(opts: {
  adjacent: boolean;
  squareLit: boolean;
  forceLit?: boolean;
}): boolean {
  return !!opts.forceLit || opts.adjacent || opts.squareLit;
}

export type DarkEyeHost = {
  x: number;
  y: number;
  monsterKind?: string;
  monsterId?: string;
  pairSlot?: SlimePairSlot;
  worldHeight?: number;
  baseW: number;
  baseH: number;
  floorY: number;
  tileFloorY?: number;
  liveAdded?: boolean;
  hidden?: boolean;
  disposed?: boolean;
  object: { position: { x: number; y: number; z: number } };
};

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
  monsterId?: string;
  pairSlot?: SlimePairSlot;
  liveAdded?: boolean;
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
  private tintFrames: Record<EyeTint, THREE.Texture[]> | null = null;

  async load(scene: THREE.Scene, floorData: FloorData, sprites: SpriteManager) {
    const loadTex = async (path: string) => {
      const tex = await loadSpriteTexture(path);
      configureFxTexture(tex);
      return tex;
    };

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
    this.tintFrames = tints;
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
          const lift = eyeLiftFor(tile.monster, host?.worldHeight ?? host?.baseH ?? 0.39);
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
    this.moveEyeAt(undefined, fromX, fromY, toX, toY, audio);
  }

  moveEyeById(id: string, fromX: number, fromY: number, toX: number, toY: number, audio?: AudioManager) {
    this.moveEyeAt(id, fromX, fromY, toX, toY, audio);
  }

  private moveEyeAt(
    id: string | undefined,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    audio?: AudioManager
  ) {
    const eye =
      (id ? this.eyes.find((e) => e.monsterId === id) : undefined) ??
      this.eyes.find((e) => e.x === fromX && e.y === fromY && !e.liveAdded);
    if (!eye) return;
    eye.x = toX;
    eye.y = toY;
    eye.sprite.position.x = toX * CELL_SIZE;
    eye.sprite.position.z = toY * CELL_SIZE;
    this.silenceEye(eye, audio);
  }

  hideEye(x: number, y: number, audio?: AudioManager) {
    for (const eye of this.eyes) {
      if (eye.x === x && eye.y === y) this.hideOne(eye, audio);
    }
  }

  removeEyeById(id: string, audio?: AudioManager) {
    const drop: EyeSlot[] = [];
    for (const eye of this.eyes) {
      if (eye.monsterId !== id) continue;
      this.hideOne(eye, audio);
      drop.push(eye);
    }
    this.dropEyes(drop);
  }

  /** Drop leftover floor eyes (split parent) so they do not linger unlinked. */
  removeFloorEyes(kind: string, x: number, y: number, audio?: AudioManager) {
    const drop: EyeSlot[] = [];
    for (const eye of this.eyes) {
      if (eye.monster !== kind || eye.x !== x || eye.y !== y) continue;
      if (eye.liveAdded) continue;
      this.hideOne(eye, audio);
      drop.push(eye);
    }
    this.dropEyes(drop);
  }

  addEyeForHost(scene: THREE.Scene, host: DarkEyeHost) {
    if (!host.monsterId || this.eyes.some((e) => e.monsterId === host.monsterId)) return;
    const kind = host.monsterKind ?? 'slime';
    const frames = this.tintFrames?.[eyeTint(kind)];
    if (!frames?.length) return;
    const w = (host.baseW || 1.4) * 0.7;
    const h = w * 0.5;
    const lift = eyeLiftFor(kind, host.worldHeight ?? host.baseH ?? 0.39);
    const feet = host.tileFloorY ?? host.floorY;
    const mat = fxMaterial(frames[0]);
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.5);
    sprite.position.set(host.object.position.x, feet + lift, host.object.position.z);
    sprite.scale.set(w, h, 1);
    sprite.frustumCulled = false;
    sprite.renderOrder = FX_RENDER_ORDER;
    sprite.visible = false;
    sprite.userData.isSprite = true;
    sprite.userData.skipVertexLighting = true;
    sprite.userData.kind = 'eye-glint';
    scene.add(sprite);
    this.eyes.push({
      x: host.x,
      y: host.y,
      spawnX: host.x,
      spawnY: host.y,
      monster: kind,
      monsterId: host.monsterId,
      pairSlot: host.pairSlot,
      liveAdded: true,
      tint: eyeTint(kind),
      sprite,
      material: mat,
      frames,
      frame: 0,
      nextAt: 0,
      resting: false,
      presenceId: null
    });
  }

  syncEyes(
    scene: THREE.Scene,
    sprites: SpriteManager,
    monsters: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      alive: boolean;
      pairSlot?: SlimePairSlot;
    }>,
    audio?: AudioManager
  ) {
    const living = monsters.filter((m) => m.alive);
    const drop: EyeSlot[] = [];
    for (const eye of this.eyes) {
      const hasHost = living.some(
        (m) =>
          (eye.monsterId && m.id === eye.monsterId) ||
          (!eye.monsterId && m.kind === eye.monster && m.x === eye.x && m.y === eye.y)
      );
      if (hasHost) continue;
      this.hideOne(eye, audio);
      drop.push(eye);
    }
    this.dropEyes(drop);
    for (const m of living) {
      if (this.eyes.some((e) => e.monsterId === m.id)) continue;
      const unbound = this.eyes.find(
        (e) => !e.monsterId && e.x === m.x && e.y === m.y && e.monster === m.kind
      );
      if (unbound) {
        unbound.monsterId = m.id;
        unbound.pairSlot = m.pairSlot;
        continue;
      }
      const host = sprites.spriteByMonsterId(m.id);
      if (host) this.addEyeForHost(scene, host);
    }
  }

  resetEyes(audio?: AudioManager) {
    const drop: EyeSlot[] = [];
    for (const eye of this.eyes) {
      this.silenceEye(eye, audio);
      if (eye.liveAdded) {
        eye.sprite.removeFromParent();
        drop.push(eye);
        continue;
      }
      eye.monsterId = undefined;
      eye.pairSlot = undefined;
      eye.x = eye.spawnX;
      eye.y = eye.spawnY;
      eye.sprite.position.x = eye.x * CELL_SIZE;
      eye.sprite.position.z = eye.y * CELL_SIZE;
      eye.sprite.visible = false;
    }
    this.dropEyes(drop);
  }

  private hideOne(eye: EyeSlot, audio?: AudioManager) {
    eye.sprite.visible = false;
    this.silenceEye(eye, audio);
  }

  private silenceEye(eye: EyeSlot, audio?: AudioManager) {
    if (!eye.presenceId) return;
    audio?.stopNamedLoop(eye.presenceId);
    eye.presenceId = null;
  }

  private dropEyes(drop: EyeSlot[]) {
    if (!drop.length) return;
    for (const eye of drop) {
      eye.sprite.removeFromParent();
      this.silenceEye(eye);
    }
    this.eyes = this.eyes.filter((e) => !drop.includes(e));
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

    for (const sprite of sprites.sprites) {
      if (sprite.kind !== 'monster') continue;
      if (sprite.hidden || sprite.disposed) {
        sprite.object.visible = false;
        continue;
      }
      const cheb = Math.max(Math.abs(sprite.x - partyX), Math.abs(sprite.y - partyY));
      sprite.object.visible = monsterBodyVisible({
        adjacent: cheb <= 1,
        squareLit: lighting.isSquareLit(sprite.x, sprite.y),
        forceLit: !!sprite.forceLit
      });
    }

    for (const eye of this.eyes) {
      const host = this.hostFor(eye, sprites);
      if (!host || host.hidden || host.disposed) {
        this.hideOne(eye, audio);
        continue;
      }
      if (!eye.monsterId && host.monsterId) eye.monsterId = host.monsterId;
      eye.x = host.x;
      eye.y = host.y;
      const lift = eyeLiftFor(host.monsterKind ?? eye.monster, host.worldHeight ?? host.baseH ?? 0.39);
      const feet = host.tileFloorY ?? host.floorY;
      const w = (host.baseW || 1.4) * 0.7;
      eye.sprite.position.set(host.object.position.x, feet + lift, host.object.position.z);
      eye.sprite.scale.set(w, w * 0.5, 1);
      const showBody = host.object.visible;
      eye.sprite.visible = !showBody;
      if (showBody) {
        this.silenceEye(eye, audio);
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

  private hostFor(eye: EyeSlot, sprites: SpriteManager) {
    if (eye.monsterId) {
      const byId = sprites.spriteByMonsterId(eye.monsterId);
      if (byId) return byId;
    }
    return sprites.sprites.find(
      (s) =>
        s.kind === 'monster' &&
        s.x === eye.x &&
        s.y === eye.y &&
        !s.hidden &&
        !s.disposed &&
        (!eye.monster || s.monsterKind === eye.monster) &&
        !this.eyes.some((other) => other !== eye && other.monsterId && other.monsterId === s.monsterId)
    );
  }

  snapshot() {
    return {
      eyes: this.eyes.map((e) => ({
        x: e.x,
        y: e.y,
        monster: e.monster,
        monsterId: e.monsterId ?? null,
        pairSlot: e.pairSlot ?? null,
        tint: e.tint,
        visible: e.sprite.visible,
        worldX: e.sprite.position.x,
        worldY: e.sprite.position.y,
        worldZ: e.sprite.position.z
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
