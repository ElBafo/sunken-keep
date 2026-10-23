import * as THREE from 'three';
import { SPRITE_SURFACE_LIFT } from '../proto3d/constants';
import { floor1 as classicFloor1 } from '../proto3d/floor-data';
import { SpriteManager } from '../proto3d/sprites';
import type { FloorData } from '../proto3d/types';
import { SLIME_SMALL_PAN } from '../core/slime-pair';
import type { CombatEvent } from '../core';

const LIT_RENDER_ORDER = 10;

function litMat(map: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    ior: 1.45,
    clearcoat: 0,
    clearcoatRoughness: 1,
    sheen: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
    fog: true,
    transparent: true,
    alphaTest: 0.15,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    emissive: 0x000000,
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

type LitBillboard = {
  mesh: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  geo: THREE.PlaneGeometry;
  w: number;
  h: number;
};

/**
 * Classic SpriteManager for art, LOD, anims, and feet placement.
 * Voxel-lit MeshPhysicalMaterial planes receive torch / lantern light so
 * unlit cells stay dark. Hidden sprites stay off the visible scene.
 */
export class Floor1Monsters {
  readonly sprites: SpriteManager;
  readonly group = new THREE.Group();
  readonly hidden = new THREE.Group();
  private lit = new Map<string, LitBillboard>();
  private camera: THREE.Camera;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.sprites = new SpriteManager(camera);
    this.group.name = 'floor1-monsters';
    this.hidden.name = 'classic-monster-sprites';
    this.hidden.visible = false;
    this.group.add(this.hidden);
  }

  async load(floor: FloorData = classicFloor1): Promise<void> {
    const emptyItems: FloorData = {
      ...floor,
      tiles: floor.tiles.map((row) => row.map((tile) => ({ ...tile, item: undefined, chest: undefined })))
    };
    await this.sprites.loadSprites(this.asScene(this.group), emptyItems, { monsters: false });
    await this.sprites.ensureMonsters(this.asScene(this.hidden), floor);
  }

  bindFromCombat(monsters: Array<{ id: string; x: number; y: number; kind: string; alive: boolean }>): void {
    for (const m of monsters) {
      if (!m.alive) continue;
      this.sprites.bindMonster(m.x, m.y, m.id, m.kind);
    }
  }

  move(id: string, x: number, y: number): void {
    this.sprites.moveMonsterId(id, x, y);
  }

  playAnim(id: string, anim: 'idle' | 'attack' | 'hurt' | 'death' | 'windup', now: number): void {
    this.sprites.playAnimId(id, anim, now);
  }

  playHitFx(id: string, kind: 'hit' | 'crit' | 'resist' | 'weak', now: number): void {
    this.sprites.playHitFx(id, kind, now);
  }

  beginPairSlide(id: string, now: number): string | null {
    return this.sprites.beginPairSlide(id, now);
  }

  async addSplitKids(event: Extract<CombatEvent, { type: 'slime_split' }>): Promise<void> {
    const tile = event.kids[0];
    if (tile) {
      this.sprites.blockFloorSpawn(tile.x, tile.y);
      this.sprites.detachFloorMonsterAt(tile.x, tile.y, 'slime');
    }
    this.sprites.disposeMonsterId(event.from);
    this.dropLit(event.from);
    for (const kid of event.kids) {
      this.sprites.blockFloorSpawn(kid.x, kid.y);
      await this.sprites.addLiveMonster(this.asScene(this.hidden), kid.kind, kid.x, kid.y, kid.id, 0, {
        pairSlot: kid.slot,
        pairId: event.from
      });
    }
  }

  slimelingPan(_id: string, slot?: 'left' | 'right'): number {
    return slot ? SLIME_SMALL_PAN[slot] : 0;
  }

  snapshot(): Array<{ id: string; kind: string; x: number; y: number; visible: boolean; yWorld: number }> {
    return this.sprites.sprites
      .filter((s) => s.kind === 'monster')
      .map((s) => {
        const lit = s.monsterId ? this.lit.get(s.monsterId) : undefined;
        return {
          id: s.monsterId ?? '',
          kind: s.monsterKind ?? '',
          x: s.x,
          y: s.y,
          visible: !!(lit?.mesh.visible ?? (!s.hidden && !s.disposed)),
          yWorld: lit?.mesh.position.y ?? s.object.position.y
        };
      });
  }

  private asScene(root: THREE.Object3D): THREE.Scene {
    return root as unknown as THREE.Scene;
  }

  update(now: number, partyX: number, partyY: number, dir: number, camera: THREE.Camera): void {
    this.camera = camera;
    this.sprites.update(now, partyX, partyY, dir);
    this.syncLit();
  }

  private dropLit(id: string): void {
    const row = this.lit.get(id);
    if (!row) return;
    row.mesh.removeFromParent();
    row.geo.dispose();
    row.mat.dispose();
    this.lit.delete(id);
  }

  private syncLit(): void {
    const live = new Set<string>();
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind !== 'monster') continue;
      sprite.object.visible = false;
      const id = sprite.monsterId;
      if (!id || sprite.disposed) continue;
      live.add(id);
      const w = Math.abs(sprite.object.scale.x) || sprite.baseW;
      const h = Math.abs(sprite.object.scale.y) || sprite.baseH;
      let row = this.lit.get(id);
      if (!row || row.w !== w || row.h !== h) {
        if (row) {
          row.mesh.removeFromParent();
          row.geo.dispose();
        }
        const geo = new THREE.PlaneGeometry(w, h);
        geo.translate(0, h * 0.5, 0);
        const mat = row?.mat ?? litMat(sprite.material.map);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `monster-${sprite.monsterKind}-${id}`;
        mesh.userData.kind = 'monster';
        mesh.userData.monsterId = id;
        mesh.userData.noShadow = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.renderOrder = LIT_RENDER_ORDER;
        this.group.add(mesh);
        row = { mesh, mat, geo, w, h };
        this.lit.set(id, row);
      }
      const map = sprite.material.map;
      if (row.mat.map !== map) {
        row.mat.map = map;
        row.mat.needsUpdate = true;
      }
      const frost = this.sprites.hostTint(id);
      row.mat.color.setHex(frost);
      row.mesh.position.copy(sprite.object.position);
      if (row.mesh.position.y < SPRITE_SURFACE_LIFT * 0.5) {
        row.mesh.position.y = SPRITE_SURFACE_LIFT;
      }
      row.mesh.scale.set(Math.sign(sprite.object.scale.x) || 1, 1, 1);
      row.mesh.lookAt(this.camera.position.x, row.mesh.position.y, this.camera.position.z);
      row.mesh.visible = !sprite.hidden && !sprite.disposed;
    }
    for (const id of [...this.lit.keys()]) {
      if (!live.has(id)) this.dropLit(id);
    }
  }
}
