import * as THREE from 'three';
import { SPRITE_SURFACE_LIFT } from '../proto3d/constants';
import { DarkFx, monsterBodyVisible } from '../proto3d/dark-fx';
import { floor1 as classicFloor1 } from '../proto3d/floor-data';
import { SpriteManager } from '../proto3d/sprites';
import type { FloorData } from '../proto3d/types';
import type { AudioManager } from '../proto3d/audio';
import type { VertexLightingManager } from '../proto3d/vertex-lighting';
import { SLIME_SMALL_PAN } from '../core/slime-pair';
import type { CombatEvent } from '../core';

const LIT_RENDER_ORDER = 10;
const FROST_COLOR = 0x6fa8e8;

export type SquareLight = {
  isSquareLit: (x: number, y: number) => boolean;
  getAmbientFloor: () => number;
};

function patchFrostLerp(material: THREE.MeshPhysicalMaterial): void {
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
  material.customProgramCacheKey = () => 'voxel-frost-lerp-60';
}

function setFrostAmount(material: THREE.MeshPhysicalMaterial, amount: number): void {
  material.userData.frostAmount = amount;
  const uniforms = material.userData.frostUniforms as { frostAmount?: { value: number } } | undefined;
  if (uniforms?.frostAmount) uniforms.frostAmount.value = amount;
}

function litMat(map: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
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
  patchFrostLerp(mat);
  return mat;
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
  readonly darkFx = new DarkFx();
  readonly group = new THREE.Group();
  readonly hidden = new THREE.Group();
  private lit = new Map<string, LitBillboard>();
  private camera: THREE.Camera;
  private lighting: SquareLight = { isSquareLit: () => false, getAmbientFloor: () => 1 };
  private audio: AudioManager | null = null;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.sprites = new SpriteManager(camera);
    this.group.name = 'floor1-monsters';
    this.hidden.name = 'classic-monster-sprites';
    this.hidden.visible = false;
    this.group.add(this.hidden);
  }

  bindLight(lighting: SquareLight, audio?: AudioManager): void {
    this.lighting = lighting;
    if (audio) this.audio = audio;
  }

  async load(floor: FloorData = classicFloor1): Promise<void> {
    const emptyItems: FloorData = {
      ...floor,
      tiles: floor.tiles.map((row) => row.map((tile) => ({ ...tile, item: undefined, chest: undefined })))
    };
    await this.sprites.loadSprites(this.asScene(this.group), emptyItems, { monsters: false });
    await this.sprites.ensureMonsters(this.asScene(this.hidden), floor);
    await this.darkFx.load(this.asScene(this.group), floor, this.sprites);
    this.group.traverse((obj) => {
      if (obj.userData.kind === 'stairs-glow') obj.visible = false;
    });
  }

  bindFromCombat(monsters: Array<{ id: string; x: number; y: number; kind: string; alive: boolean }>): void {
    for (const m of monsters) {
      if (!m.alive) continue;
      this.sprites.bindMonster(m.x, m.y, m.id, m.kind);
    }
    this.darkFx.syncEyes(this.asScene(this.group), this.sprites, monsters, this.audio ?? undefined);
  }

  async resetFromCombat(
    monsters: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      alive: boolean;
      pairSlot?: 'left' | 'right';
      pairId?: string;
    }>
  ): Promise<void> {
    this.sprites.resetMonsters(classicFloor1);
    this.darkFx.resetEyes(this.audio ?? undefined);
    for (const id of [...this.lit.keys()]) this.dropLit(id);
    await this.sprites.syncLiveMonsters(this.asScene(this.hidden), monsters);
    this.darkFx.syncEyes(this.asScene(this.group), this.sprites, monsters, this.audio ?? undefined);
  }

  move(id: string, from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.sprites.moveMonsterId(id, to.x, to.y);
    this.darkFx.moveEyeById(id, from.x, from.y, to.x, to.y, this.audio ?? undefined);
  }

  removeEye(id: string): void {
    this.darkFx.removeEyeById(id, this.audio ?? undefined);
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
    this.darkFx.removeEyeById(event.from, this.audio ?? undefined);
    for (const kid of event.kids) {
      this.sprites.blockFloorSpawn(kid.x, kid.y);
      const sprite = await this.sprites.addLiveMonster(this.asScene(this.hidden), kid.kind, kid.x, kid.y, kid.id, 0, {
        pairSlot: kid.slot,
        pairId: event.from
      });
      if (sprite) this.darkFx.addEyeForHost(this.asScene(this.group), sprite);
    }
  }

  slimelingPan(_id: string, slot?: 'left' | 'right'): number {
    return slot ? SLIME_SMALL_PAN[slot] : 0;
  }

  snapshot(): Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    visible: boolean;
    yWorld: number;
    squareLit: boolean;
    frost: number;
  }> {
    return this.sprites.sprites
      .filter((s) => s.kind === 'monster')
      .map((s) => {
        const lit = s.monsterId ? this.lit.get(s.monsterId) : undefined;
        return {
          id: s.monsterId ?? '',
          kind: s.monsterKind ?? '',
          x: s.x,
          y: s.y,
          visible: !!(lit?.mesh.visible ?? false),
          yWorld: lit?.mesh.position.y ?? s.object.position.y,
          squareLit: this.lighting.isSquareLit(s.x, s.y),
          frost: Number(lit?.mat.userData.frostAmount ?? 0)
        };
      });
  }

  private asScene(root: THREE.Object3D): THREE.Scene {
    return root as unknown as THREE.Scene;
  }

  update(now: number, partyX: number, partyY: number, dir: number, camera: THREE.Camera): void {
    this.camera = camera;
    this.sprites.update(now, partyX, partyY, dir);
    if (this.audio) {
      this.darkFx.update(
        now,
        this.lighting as unknown as VertexLightingManager,
        this.sprites,
        this.audio,
        partyX,
        partyY
      );
    } else {
      for (const sprite of this.sprites.sprites) {
        if (sprite.kind !== 'monster' || sprite.hidden || sprite.disposed) continue;
        const cheb = Math.max(Math.abs(sprite.x - partyX), Math.abs(sprite.y - partyY));
        sprite.object.visible = monsterBodyVisible({
          adjacent: cheb <= 1,
          squareLit: this.lighting.isSquareLit(sprite.x, sprite.y),
          forceLit: !!sprite.forceLit
        });
      }
    }
    this.syncLit(partyX, partyY);
  }

  private dropLit(id: string): void {
    const row = this.lit.get(id);
    if (!row) return;
    row.mesh.removeFromParent();
    row.geo.dispose();
    row.mat.dispose();
    this.lit.delete(id);
  }

  private syncLit(partyX: number, partyY: number): void {
    const live = new Set<string>();
    for (const sprite of this.sprites.sprites) {
      if (sprite.kind !== 'monster') continue;
      const showBody =
        !sprite.hidden &&
        !sprite.disposed &&
        monsterBodyVisible({
          adjacent: Math.max(Math.abs(sprite.x - partyX), Math.abs(sprite.y - partyY)) <= 1,
          squareLit: this.lighting.isSquareLit(sprite.x, sprite.y),
          forceLit: !!sprite.forceLit
        });
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
      const amount = Number(sprite.material.userData.frostAmount ?? 0);
      setFrostAmount(row.mat, amount);
      row.mat.color.setHex(0xffffff);
      row.mesh.position.copy(sprite.object.position);
      if (row.mesh.position.y < SPRITE_SURFACE_LIFT * 0.5) {
        row.mesh.position.y = SPRITE_SURFACE_LIFT;
      }
      row.mesh.scale.set(Math.sign(sprite.object.scale.x) || 1, 1, 1);
      row.mesh.lookAt(this.camera.position.x, row.mesh.position.y, this.camera.position.z);
      row.mesh.visible = showBody;
    }
    for (const id of [...this.lit.keys()]) {
      if (!live.has(id)) this.dropLit(id);
    }
  }
}
