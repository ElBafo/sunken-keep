import * as THREE from 'three';
import { CELL } from './constants';
import { classicFloor1Loot, lootRevealed } from './loot';
import { tileAt, type FloorMap } from './layout';

const ITEM_ASPECT = 80 / 60;
const ITEM_FRONT = CELL * 0.22;

const ITEM_DEF: Record<string, { file: string; h: number }> = {
  key: { file: 'art/dungeon/item_key_near.png', h: 0.2 },
  captain_key: { file: 'art/dungeon/item_captain_key_near.png', h: 0.2 },
  potion_red: { file: 'art/dungeon/item_potion_red_near.png', h: 0.22 },
  potion_blue: { file: 'art/dungeon/item_potion_blue_near.png', h: 0.22 },
  potion_green: { file: 'art/dungeon/item_potion_green_near.png', h: 0.22 },
  oil: { file: 'proto3d/tex3d/torch/item_oil_near.png', h: 0.22 },
  oil_flask: { file: 'proto3d/tex3d/torch/item_oil_near.png', h: 0.22 },
  journal_page: { file: 'art/dungeon/item_journal_page_near.png', h: 0.25 },
  scroll: { file: 'art/dungeon/item_scroll_near.png', h: 0.3 },
  chest: { file: 'art/dungeon/item_chest_near.png', h: 0.5 },
  chest_open: { file: 'art/dungeon/item_chest_open_near.png', h: 0.5 },
  iron_shield: { file: 'art/dungeon/item_iron_shield_near.png', h: 0.5 }
};

export type FloorItemVisual = {
  x: number;
  y: number;
  item: string;
  mesh: THREE.Mesh;
  pickedUp: boolean;
};

function itemMat(map: THREE.Texture): THREE.MeshPhysicalMaterial {
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
    alphaTest: 0.12,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
}

async function loadItemArt(rel: string): Promise<THREE.Texture> {
  const url = `${import.meta.env.BASE_URL}${rel.replace(/^\//, '')}`;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export async function buildFloor1Items(map: FloorMap): Promise<{
  group: THREE.Group;
  visuals: FloorItemVisual[];
  update: (camera: THREE.Camera) => void;
  hideAt: (x: number, y: number) => void;
  openChestAt: (x: number, y: number) => void;
  isPresent: (x: number, y: number) => boolean;
  snapshot: () => Array<{ x: number; y: number; item: string; visible: boolean }>;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-items';
  const visuals: FloorItemVisual[] = [];
  const loot = classicFloor1Loot();
  const files = [...new Set(loot.map((row) => ITEM_DEF[row.item ?? (row.chest ? 'chest' : '')]?.file).filter(Boolean))];
  const textures = new Map<string, THREE.Texture>();
  await Promise.all(
    files.map(async (file) => {
      try {
        textures.set(file, await loadItemArt(file));
      } catch {
        /* unit tests without Image.decode */
      }
    })
  );
  if (!textures.has(ITEM_DEF.chest_open.file)) {
    try {
      textures.set(ITEM_DEF.chest_open.file, await loadItemArt(ITEM_DEF.chest_open.file));
    } catch {
      /* optional open-chest art */
    }
  }

  for (const row of loot) {
    const itemName = row.item ?? (row.chest ? 'chest' : '');
    if (!itemName) continue;
    const def = ITEM_DEF[itemName] ?? { file: `art/dungeon/item_${itemName}_near.png`, h: 0.22 };
    const tex = textures.get(def.file);
    if (!tex) continue;
    const h = def.h * CELL;
    const w = h * ITEM_ASPECT;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), itemMat(tex));
    mesh.position.set(row.x * CELL, h * 0.5, row.y * CELL);
    mesh.userData.kind = 'floor-item';
    mesh.userData.item = itemName;
    mesh.userData.noShadow = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.name = `loot-${itemName}-${row.x}-${row.y}`;
    group.add(mesh);
    visuals.push({ x: row.x, y: row.y, item: itemName, mesh, pickedUp: false });
  }

  const syncVisible = (): void => {
    for (const visual of visuals) {
      const tile = tileAt(map, visual.x, visual.y);
      const present = visual.item === 'chest' || visual.item === 'chest_open'
        ? !!tile?.chest
        : !!tile?.item && !visual.pickedUp;
      visual.mesh.visible = present && lootRevealed(map, visual.x, visual.y);
    }
  };

  const update = (camera: THREE.Camera): void => {
    syncVisible();
    for (const visual of visuals) {
      if (!visual.mesh.visible) continue;
      const wx = visual.x * CELL;
      const wz = visual.y * CELL;
      const dx = camera.position.x - wx;
      const dz = camera.position.z - wz;
      const len = Math.hypot(dx, dz) || 1;
      visual.mesh.position.x = wx + (dx / len) * ITEM_FRONT;
      visual.mesh.position.z = wz + (dz / len) * ITEM_FRONT;
      visual.mesh.lookAt(camera.position.x, visual.mesh.position.y, camera.position.z);
    }
  };

  const hideAt = (x: number, y: number): void => {
    for (const visual of visuals) {
      if (visual.x !== x || visual.y !== y) continue;
      if (visual.item === 'chest' || visual.item === 'chest_open') continue;
      visual.pickedUp = true;
      visual.mesh.visible = false;
    }
  };

  const openChestAt = (x: number, y: number): void => {
    for (const visual of visuals) {
      if (visual.x !== x || visual.y !== y) continue;
      if (visual.item !== 'chest' && visual.item !== 'chest_open') continue;
      const openTex = textures.get(ITEM_DEF.chest_open.file);
      if (openTex) {
        const mat = visual.mesh.material as THREE.MeshPhysicalMaterial;
        mat.map = openTex;
        mat.needsUpdate = true;
      }
      visual.item = 'chest_open';
      visual.mesh.userData.item = 'chest';
      visual.pickedUp = false;
    }
    syncVisible();
  };

  syncVisible();
  return {
    group,
    visuals,
    update,
    hideAt,
    openChestAt,
    isPresent: (x, y) => visuals.some((v) => v.x === x && v.y === y && v.mesh.visible),
    snapshot: () =>
      visuals.map((v) => ({
        x: v.x,
        y: v.y,
        item: v.item,
        visible: v.mesh.visible
      }))
  };
}
