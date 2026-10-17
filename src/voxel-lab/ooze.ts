import * as THREE from 'three';
import {
  applySlimeSeeThrough,
  faceSlimeToCamera,
  makeContactShadow,
  prepShadowPatchTexture,
  SLIME_ALPHA_TEST_SHADOW,
  SLIME_ALPHA_TEST_SOLID,
  SLIME_RENDER_ORDER_SOLID
} from './actors';
import {
  CAMERA_BACK_OFFSET_TILES,
  CAMERA_PITCH,
  CELL,
  DEBRIS_POOL,
  EYE_HEIGHT,
  MONSTER_OFFSET_TOWARD_PARTY,
  MONSTER_SIZES_FILE,
  OOZE_DEFAULT_RES,
  OOZE_DEF_FILE,
  OOZE_SPRITE_FALLBACK,
  OOZE_SPRITE_FOLDER,
  OOZE_SPRITE_PREFIX,
  SHADOW_PATCH_FILE,
  SPRITE_SURFACE_LIFT
} from './constants';
import { LOD_NAMES, monsterLodName, quadForWorldHeight, squaresFromWorldDist, type LodName } from './lod';
import {
  buildMonsterVolume,
  meshMonster,
  parseMonsterDef,
  type BuiltVolume,
  type MeshedMonster,
  type MonsterDef,
  type PaletteGroup
} from './monster-builder';

export type OozeRes = 16 | 32 | 48;
export type OozeMat = 'opaque' | 'shell';
export type OozeAnim = 'idle' | 'move' | 'lunge' | 'hit' | 'death';
export type OozeView = 'game' | 'orbit' | 'free';

export type OozeDeform = {
  pulse: { value: number };
  leanX: { value: number };
  leanZ: { value: number };
  sink: { value: number };
  spread: { value: number };
};

type ResPack = {
  res: number;
  built: BuiltVolume;
  meshed: MeshedMonster;
  root: THREE.Group;
  meshes: Record<string, THREE.Mesh>;
};

type Debris = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  active: boolean;
};

export interface OozeDebug {
  res: number;
  mat: OozeMat;
  anim: OozeAnim;
  dist: 1 | 2;
  view: OozeView;
  compare: boolean;
  spriteLod: LodName;
  spriteSource: 'gray_ooze' | 'slime-fallback';
  spriteVisible: boolean;
  voxels: number;
  triangles: number;
  draws: number;
  peakHeight: number;
  width: number;
  minY: number;
  hovering: boolean;
  hasFaceStamp: boolean;
  glintVoxels: number;
  embedVoxels: number;
  contact: boolean;
  deathDone: boolean;
  restX: number;
  restZ: number;
}

export interface OozeLab {
  group: THREE.Group;
  def: MonsterDef;
  res: OozeRes;
  mat: OozeMat;
  anim: OozeAnim;
  dist: 1 | 2;
  view: OozeView;
  compare: boolean;
  deathDone: boolean;
  stats: { voxels: number; triangles: number; draws: number };
  setResolution: (res: OozeRes) => void;
  cycleResolution: () => OozeRes;
  setMaterial: (mat: OozeMat) => void;
  toggleMaterial: () => OozeMat;
  setAnim: (anim: OozeAnim) => void;
  cycleAnim: () => OozeAnim;
  setDist: (d: 1 | 2) => void;
  setView: (v: OozeView) => void;
  setCompare: (on: boolean) => void;
  reset: () => void;
  orbitDrag: (dx: number, dy: number) => void;
  applyCamera: (camera: THREE.PerspectiveCamera) => void;
  update: (now: number, dt: number, camera: THREE.Camera, freeze: boolean) => void;
  debug: () => OozeDebug;
}

function artUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(artUrl(file));
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return res.json() as Promise<T>;
}

async function loadPng(file: string): Promise<{ img: HTMLImageElement; texture: THREE.Texture } | null> {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = artUrl(file);
    await img.decode();
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return { img, texture };
  } catch {
    return null;
  }
}

function hookDeform(mat: THREE.Material, u: OozeDeform, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOozePulse = u.pulse;
    shader.uniforms.uOozeLeanX = u.leanX;
    shader.uniforms.uOozeLeanZ = u.leanZ;
    shader.uniforms.uOozeSink = u.sink;
    shader.uniforms.uOozeSpread = u.spread;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uOozePulse;
uniform float uOozeLeanX;
uniform float uOozeLeanZ;
uniform float uOozeSink;
uniform float uOozeSpread;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.xz *= (1.0 + uOozeSpread);
transformed.x += transformed.y * uOozeLeanX;
transformed.z += transformed.y * uOozeLeanZ;
transformed.y *= (1.0 + uOozePulse) * (1.0 - uOozeSink);`
      );
  };
  mat.customProgramCacheKey = () => key;
}

function gooMat(kind: 'opaque' | 'core' | 'shell', u: OozeDeform): THREE.MeshPhysicalMaterial {
  const shell = kind === 'shell';
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: shell ? 0.5 : 0.78,
    metalness: 0,
    ior: 1.45,
    specularIntensity: shell ? 0.26 : 0.2,
    clearcoat: shell ? 0.14 : 0.07,
    clearcoatRoughness: shell ? 0.3 : 0.5,
    envMapIntensity: 0,
    transparent: shell,
    opacity: shell ? 0.46 : 1,
    depthWrite: !shell,
    flatShading: false
  });
  hookDeform(mat, u, shell ? 'ooze-deform-shell' : 'ooze-deform-goo');
  return mat;
}

function glintMat(u: OozeDeform): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.2,
    metalness: 0.02,
    ior: 1.45,
    specularIntensity: 0.7,
    clearcoat: 0.4,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0
  });
  hookDeform(mat, u, 'ooze-deform-glint');
  return mat;
}

function boneMat(u: OozeDeform): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    specularIntensity: 0.1,
    clearcoat: 0,
    envMapIntensity: 0
  });
  hookDeform(mat, u, 'ooze-deform-bone');
  return mat;
}

function rustMat(u: OozeDeform): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.28,
    specularIntensity: 0.28,
    clearcoat: 0,
    envMapIntensity: 0
  });
  hookDeform(mat, u, 'ooze-deform-rust');
  return mat;
}

function caster(mesh: THREE.Mesh, cast: boolean): void {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.userData.castWhenOn = cast;
  mesh.userData.receiveWhenOn = true;
}

function dummyGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setIndex([0, 1, 2]);
  return g;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

type SizesFile = {
  monsters: Record<string, { worldHeight: number; [lod: string]: unknown }>;
};

export async function createOozeLab(): Promise<OozeLab> {
  const def = parseMonsterDef(await fetchJson(OOZE_DEF_FILE));
  const sizes = await fetchJson<SizesFile>(MONSTER_SIZES_FILE);
  const slimeSizes = sizes.monsters[def.compareSprite.sizesKey] ?? sizes.monsters.slime;
  const worldHeight = def.compareSprite.worldHeight || slimeSizes?.worldHeight || 0.39;

  const lodPx: Record<LodName, [number, number]> = {
    close: [102, 71],
    near: [56, 39],
    mid: [40, 27],
    far: [31, 21]
  };
  for (const lod of LOD_NAMES) {
    const entry = slimeSizes?.[lod] as { px?: [number, number] } | undefined;
    if (entry?.px) lodPx[lod] = [entry.px[0], entry.px[1]];
  }

  const spriteMaps: Partial<Record<LodName, { texture: THREE.Texture; img: HTMLImageElement }>> = {};
  let spriteSource: 'gray_ooze' | 'slime-fallback' = 'gray_ooze';
  for (const lod of LOD_NAMES) {
    const preferred = `${OOZE_SPRITE_FOLDER}/${OOZE_SPRITE_PREFIX}_${lod}.png`;
    const loaded = await loadPng(preferred);
    if (loaded) spriteMaps[lod] = loaded;
  }
  if (!spriteMaps.close && !spriteMaps.near) {
    spriteSource = 'slime-fallback';
    for (const lod of LOD_NAMES) {
      const fb = `${OOZE_SPRITE_FOLDER}/${OOZE_SPRITE_FALLBACK}_${lod}.png`;
      const loaded = await loadPng(fb);
      if (loaded) spriteMaps[lod] = loaded;
    }
  }

  const patchPng = await loadPng(SHADOW_PATCH_FILE);
  if (!patchPng) throw new Error('shadow patch missing');
  const patch = prepShadowPatchTexture(patchPng.texture);

  const deform: OozeDeform = {
    pulse: { value: 0 },
    leanX: { value: 0 },
    leanZ: { value: 0 },
    sink: { value: 0 },
    spread: { value: 0 }
  };

  const mats = {
    goo: gooMat('opaque', deform),
    core: gooMat('core', deform),
    shell: gooMat('shell', deform),
    glint: glintMat(deform),
    bone: boneMat(deform),
    rust: rustMat(deform)
  };

  const restX = CELL * 1.42;
  const restZ = 1.82;
  const compareX = CELL * 1.74;

  const group = new THREE.Group();
  group.name = 'lab-gray-ooze';
  group.position.set(restX, 0, restZ);

  const packs = new Map<number, ResPack>();
  for (const res of def.resolutions) {
    const built = buildMonsterVolume(def, res);
    const meshed = meshMonster(def, built);
    const root = new THREE.Group();
    root.name = `ooze-res-${res}`;
    root.visible = false;
    const meshes: Record<string, THREE.Mesh> = {};
    const find = (g: PaletteGroup | 'core') => meshed.groups.find((x) => x.group === g);
    const add = (key: string, geo: THREE.BufferGeometry | undefined, mat: THREE.Material, cast: boolean) => {
      const mesh = new THREE.Mesh(geo ?? dummyGeo(), mat);
      mesh.name = `ooze-${key}-${res}`;
      mesh.visible = !!geo;
      caster(mesh, cast);
      if (key === 'shell') {
        mesh.renderOrder = 6;
        mesh.userData.castWhenOn = false;
        mesh.castShadow = false;
      }
      root.add(mesh);
      meshes[key] = mesh;
    };
    add('goo', find('goo')?.geometry, mats.goo, true);
    add('core', find('core')?.geometry, mats.core, true);
    add('shell', find('goo')?.geometry, mats.shell, false);
    add('glint', find('glint')?.geometry, mats.glint, true);
    add('bone', find('bone')?.geometry, mats.bone, true);
    add('rust', find('rust')?.geometry, mats.rust, true);
    group.add(root);
    packs.set(res, { res, built, meshed, root, meshes });
  }

  const contact = makeContactShadow({
    name: 'lab-ooze-contact',
    width: 1.18,
    depth: 0.64,
    x: 0,
    z: 0.03,
    map: patch
  });
  group.add(contact);

  const dummy = new THREE.Object3D();
  const debrisMat = new THREE.MeshPhysicalMaterial({
    color: 0x2f3329,
    roughness: 0.78,
    metalness: 0,
    envMapIntensity: 0
  });
  const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), debrisMat, DEBRIS_POOL);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debrisMesh.name = 'lab-ooze-debris';
  debrisMesh.visible = false;
  debrisMesh.userData.noShadow = true;
  debrisMesh.castShadow = false;
  debrisMesh.receiveShadow = false;
  debrisMesh.frustumCulled = false;
  group.add(debrisMesh);
  const debris: Debris[] = [];
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < DEBRIS_POOL; i++) {
    debrisMesh.setMatrixAt(i, dummy.matrix);
    debris.push({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      size: 0.04,
      homeX: 0,
      homeY: 0,
      homeZ: 0,
      active: false
    });
  }
  debrisMesh.instanceMatrix.needsUpdate = true;

  const spriteGroup = new THREE.Group();
  spriteGroup.name = 'lab-ooze-compare';
  spriteGroup.position.set(compareX - restX, 0, 0);
  spriteGroup.visible = false;
  const firstLod: LodName = spriteMaps.close ? 'close' : 'near';
  const firstMap = spriteMaps[firstLod] ?? spriteMaps.near;
  const firstSize = quadForWorldHeight(worldHeight, CELL, lodPx[firstLod][0], lodPx[firstLod][1]);
  const spriteGeo = new THREE.PlaneGeometry(1, 1);
  spriteGeo.translate(0, 0.5, 0);
  const spriteMat = new THREE.MeshPhysicalMaterial({
    map: firstMap?.texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: SLIME_ALPHA_TEST_SOLID,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.05,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0,
    side: THREE.DoubleSide
  });
  const depthMap = firstMap?.texture.clone() ?? firstMap?.texture;
  if (depthMap) depthMap.needsUpdate = true;
  const sprite = new THREE.Mesh(spriteGeo, spriteMat);
  sprite.name = 'lab-ooze-sprite';
  sprite.customDepthMaterial = new THREE.MeshDepthMaterial({
    map: depthMap,
    alphaTest: SLIME_ALPHA_TEST_SHADOW,
    depthPacking: THREE.RGBADepthPacking
  });
  sprite.customDistanceMaterial = new THREE.MeshDistanceMaterial({
    map: depthMap,
    alphaTest: SLIME_ALPHA_TEST_SHADOW
  });
  sprite.castShadow = true;
  sprite.receiveShadow = true;
  sprite.userData.castWhenOn = true;
  sprite.userData.receiveWhenOn = true;
  sprite.renderOrder = SLIME_RENDER_ORDER_SOLID;
  sprite.scale.set(firstSize.w, firstSize.h, 1);
  sprite.position.y = SPRITE_SURFACE_LIFT;
  applySlimeSeeThrough(sprite, false);
  const spriteContact = makeContactShadow({
    name: 'lab-ooze-sprite-contact',
    width: firstSize.w * 1.15,
    depth: firstSize.w * 0.5,
    x: 0,
    z: 0.06,
    map: patch
  });
  spriteGroup.add(sprite, spriteContact);
  const wrap = new THREE.Group();
  wrap.name = 'lab-ooze-root';
  wrap.add(group, spriteGroup);
  spriteGroup.position.set(compareX, 0, restZ);

  let res: OozeRes = (def.defaultResolution as OozeRes) || OOZE_DEFAULT_RES;
  let matMode: OozeMat = 'opaque';
  let anim: OozeAnim = 'idle';
  let dist: 1 | 2 = 1;
  let view: OozeView = 'game';
  let compare = false;
  let deathDone = false;
  let animT0 = 0;
  let spriteLod: LodName = 'close';
  let orbitYaw = 0.18;
  let orbitPitch = 0.46;
  const restPos = { x: restX, z: restZ };

  const pack = (): ResPack => packs.get(res) ?? [...packs.values()][0];

  const applyMat = (): void => {
    const p = pack();
    const shell = matMode === 'shell';
    p.meshes.goo.visible = !shell && !!p.meshes.goo.geometry.getAttribute('position');
    p.meshes.core.visible = shell && !!p.meshes.core.geometry.getAttribute('position');
    p.meshes.shell.visible = shell;
    p.meshes.glint.visible = true;
    p.meshes.bone.visible = true;
    p.meshes.rust.visible = true;
  };

  const applyRes = (): void => {
    for (const p of packs.values()) p.root.visible = p.res === res;
    applyMat();
  };

  const visibleTris = (): number => {
    const p = pack();
    let t = 0;
    const add = (mesh: THREE.Mesh, extra = false) => {
      if (!mesh.visible && !extra) return;
      const idx = mesh.geometry.getIndex();
      t += idx ? idx.count / 3 : 0;
    };
    if (matMode === 'opaque') add(p.meshes.goo);
    else {
      add(p.meshes.core);
      add(p.meshes.shell);
    }
    add(p.meshes.glint);
    add(p.meshes.bone);
    add(p.meshes.rust);
    return t;
  };

  const visibleDraws = (): number => {
    let n = 0;
    pack().root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.visible) n += 1;
    });
    if (contact.visible) n += 1;
    if (debrisMesh.visible) n += 1;
    if (spriteGroup.visible) n += 2;
    return n;
  };

  const applySpriteLod = (lod: LodName): void => {
    const maps = spriteMaps[lod] ?? spriteMaps.near ?? spriteMaps.close ?? spriteMaps.mid ?? spriteMaps.far;
    if (!maps) return;
    spriteLod = lod;
    spriteMat.map = maps.texture;
    spriteMat.needsUpdate = true;
    const depth = sprite.customDepthMaterial as THREE.MeshDepthMaterial;
    const distM = sprite.customDistanceMaterial as THREE.MeshDistanceMaterial;
    if (depth) {
      depth.map = maps.texture;
      depth.needsUpdate = true;
    }
    if (distM) {
      distM.map = maps.texture;
      distM.needsUpdate = true;
    }
    const px = lodPx[lod];
    const size = quadForWorldHeight(worldHeight, CELL, px[0], px[1]);
    sprite.scale.set(size.w, size.h, 1);
    spriteContact.scale.set(size.w / (firstSize.w || 1), size.w / (firstSize.w || 1), 1);
  };

  const spawnDebris = (count: number, explode: boolean): void => {
    const p = pack();
    const pts = p.built.surfacePoints;
    const n = Math.min(count, DEBRIS_POOL, Math.max(1, pts.length));
    for (let i = 0; i < DEBRIS_POOL; i++) {
      const d = debris[i];
      if (i >= n) {
        d.active = false;
        continue;
      }
      const src = pts[i % pts.length];
      d.homeX = src[0];
      d.homeY = src[1];
      d.homeZ = src[2];
      d.x = src[0];
      d.y = src[1];
      d.z = src[2];
      d.vx = (Math.random() - 0.5) * (explode ? 1.8 : 1.1);
      d.vy = 0.9 + Math.random() * (explode ? 2.2 : 1.1);
      d.vz = 0.4 + Math.random() * (explode ? 1.4 : 0.7);
      d.life = explode ? 1.8 : 0.55;
      d.max = d.life;
      d.size = p.built.voxelSize * (0.8 + Math.random() * 0.7);
      d.active = true;
    }
    debrisMesh.visible = true;
  };

  const applyAnimStart = (now: number, next: OozeAnim): void => {
    anim = next;
    animT0 = now;
    deathDone = false;
    deform.sink.value = 0;
    deform.spread.value = 0;
    if (next === 'hit') spawnDebris(def.animations.hit.debris ?? 18, false);
    if (next === 'death') spawnDebris(def.animations.death.debris ?? 28, true);
    if (next !== 'hit' && next !== 'death') {
      for (const d of debris) d.active = false;
      debrisMesh.visible = false;
    }
    if (next !== 'move') {
      group.position.x = restPos.x;
      group.position.z = restPos.z;
    }
  };

  applyRes();
  applySpriteLod('close');

  const lab: OozeLab = {
    group: wrap,
    def,
    get res() {
      return res;
    },
    get mat() {
      return matMode;
    },
    get anim() {
      return anim;
    },
    get dist() {
      return dist;
    },
    get view() {
      return view;
    },
    get compare() {
      return compare;
    },
    get deathDone() {
      return deathDone;
    },
    stats: { voxels: 0, triangles: 0, draws: 0 },
    setResolution: (next) => {
      res = next;
      applyRes();
    },
    cycleResolution: () => {
      const list = def.resolutions as OozeRes[];
      const i = list.indexOf(res);
      res = list[(i + 1) % list.length];
      applyRes();
      return res;
    },
    setMaterial: (next) => {
      matMode = next;
      applyMat();
    },
    toggleMaterial: () => {
      matMode = matMode === 'opaque' ? 'shell' : 'opaque';
      applyMat();
      return matMode;
    },
    setAnim: (next) => {
      applyAnimStart(performance.now(), next);
    },
    cycleAnim: () => {
      const order: OozeAnim[] = ['idle', 'move', 'lunge', 'hit', 'death'];
      const next = order[(order.indexOf(anim) + 1) % order.length];
      applyAnimStart(performance.now(), next);
      return next;
    },
    setDist: (d) => {
      dist = d;
    },
    setView: (v) => {
      view = v;
    },
    setCompare: (on) => {
      compare = on;
      spriteGroup.visible = on;
    },
    reset: () => {
      applyAnimStart(performance.now(), 'idle');
      deform.pulse.value = 0;
      deform.leanX.value = 0;
      deform.leanZ.value = 0;
      deform.sink.value = 0;
      deform.spread.value = 0;
      group.position.set(restPos.x, 0, restPos.z);
      deathDone = false;
    },
    orbitDrag: (dx, dy) => {
      orbitYaw -= dx * 0.005;
      orbitPitch = Math.max(0.08, Math.min(1.1, orbitPitch + dy * 0.004));
    },
    applyCamera: (camera) => {
      if (view === 'game') {
        const zDist = (dist + CAMERA_BACK_OFFSET_TILES - MONSTER_OFFSET_TOWARD_PARTY) * CELL;
        camera.position.set(restPos.x, EYE_HEIGHT, restPos.z + zDist);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(CAMERA_PITCH, 0, 0);
      } else if (view === 'orbit') {
        const lookY = 0.28;
        const r = 2.35;
        const py = 0.45 + orbitPitch * 1.1;
        camera.position.set(
          group.position.x + Math.sin(orbitYaw) * r,
          py,
          group.position.z + Math.cos(orbitYaw) * r
        );
        camera.lookAt(group.position.x, lookY, group.position.z);
      }
    },
    update: (now, dt, camera, freeze) => {
      const t = now * 0.001;
      const idle = def.animations.idle;
      const move = def.animations.move;
      const lunge = def.animations.lunge;
      const hit = def.animations.hit;
      const death = def.animations.death;

      deform.leanX.value = 0;
      if (anim === 'idle') {
        deform.pulse.value = freeze ? 0 : (idle.pulse ?? 0.04) * Math.sin(t * Math.PI * 2 * (idle.hz ?? 0.28));
        deform.leanZ.value = 0;
        deform.sink.value = 0;
        deform.spread.value = 0;
      } else if (anim === 'move') {
        const period = move.periodMs ?? 2800;
        const u = ((now - animT0) % period) / period;
        const trip = u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2;
        const k = easeInOut(trip);
        group.position.z = restPos.z + k * CELL * (move.travelCells ?? 1);
        deform.pulse.value = (move.pulse ?? 0.06) * (0.6 + 0.4 * Math.sin(t * 7));
        deform.leanZ.value = (move.lean ?? 0.1) * (u < 0.5 ? 1 : -0.6);
      } else if (anim === 'lunge') {
        const dur = lunge.durationMs ?? 740;
        const u = Math.min(1, (now - animT0) / dur);
        const up = u < 0.42 ? easeInOut(u / 0.42) : 1 - easeInOut((u - 0.42) / 0.58);
        deform.pulse.value = (lunge.pulse ?? 0.58) * up;
        deform.leanZ.value = (lunge.lean ?? 0.52) * up;
        if (u >= 1) applyAnimStart(now, 'idle');
      } else if (anim === 'hit') {
        const dur = hit.durationMs ?? 560;
        const u = Math.min(1, (now - animT0) / dur);
        deform.pulse.value = (hit.pulse ?? 0.1) * Math.sin(u * Math.PI * 6) * (1 - u);
        if (u >= 1) applyAnimStart(now, 'idle');
      } else if (anim === 'death') {
        const dur = death.durationMs ?? 2200;
        const u = Math.min(1, (now - animT0) / dur);
        const k = easeInOut(u);
        deform.pulse.value = 0.04 * (1 - k);
        deform.sink.value = (death.sink ?? 0.94) * k;
        deform.spread.value = (death.spread ?? 0.88) * k;
        if (u >= 1) deathDone = true;
      }

      let anyDebris = false;
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < DEBRIS_POOL; i++) {
        const d = debris[i];
        if (!d.active) {
          dummy.position.set(0, -10, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          debrisMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        anyDebris = true;
        d.life -= dt;
        if (anim === 'hit' && d.life < d.max * 0.35) {
          const k = 1 - d.life / (d.max * 0.35);
          d.x += (d.homeX - d.x) * Math.min(1, k * 4 * dt);
          d.y += (d.homeY - d.y) * Math.min(1, k * 4 * dt);
          d.z += (d.homeZ - d.z) * Math.min(1, k * 4 * dt);
          if (d.life <= 0) d.active = false;
        } else {
          d.vy -= 9.2 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.z += d.vz * dt;
          if (d.y < 0.02) {
            d.y = 0.02;
            d.vy *= -0.25;
            d.vx *= 0.6;
            d.vz *= 0.6;
          }
          if (d.life <= 0) d.active = false;
        }
        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.setScalar(d.active ? d.size : 0);
        dummy.updateMatrix();
        debrisMesh.setMatrixAt(i, dummy.matrix);
      }
      debrisMesh.visible = anyDebris;
      if (anyDebris) debrisMesh.instanceMatrix.needsUpdate = true;

      contact.scale.setScalar(1 + deform.spread.value * 0.35);

      const camDist = Math.hypot(camera.position.x - spriteGroup.position.x, camera.position.z - spriteGroup.position.z);
      const sq = view === 'game' ? dist : squaresFromWorldDist(camDist, CELL);
      const lod = monsterLodName(sq, true);
      if (lod !== spriteLod) applySpriteLod(lod);
      if (spriteGroup.visible) faceSlimeToCamera(sprite, camera);

      const p = pack();
      lab.stats.voxels = p.built.voxelCount;
      lab.stats.triangles = visibleTris();
      lab.stats.draws = visibleDraws();
    },
    debug: () => {
      const p = pack();
      const box = new THREE.Box3();
      p.root.updateWorldMatrix(true, true);
      box.setFromObject(p.root);
      return {
        res,
        mat: matMode,
        anim,
        dist,
        view,
        compare,
        spriteLod,
        spriteSource,
        spriteVisible: spriteGroup.visible,
        voxels: p.built.voxelCount,
        triangles: visibleTris(),
        draws: visibleDraws(),
        peakHeight: p.built.peakHeight,
        width: p.built.width,
        minY: box.min.y,
        hovering: box.min.y > 0.08,
        hasFaceStamp: def.stamps.some((s) => /eye|face|iris/i.test(s.type)),
        glintVoxels: p.built.counts.glint,
        embedVoxels: p.built.counts.bone + p.built.counts.rust,
        contact: contact.visible,
        deathDone,
        restX: restPos.x,
        restZ: restPos.z
      };
    }
  };

  lab.stats.voxels = pack().built.voxelCount;
  lab.stats.triangles = visibleTris();
  lab.stats.draws = visibleDraws();
  return lab;
}
