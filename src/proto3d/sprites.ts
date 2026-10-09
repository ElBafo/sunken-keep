import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  SCONCE_ANIM_FPS,
  SCONCE_HEIGHT_TILES,
  SCONCE_WALL_OFFSET_TILES,
  SCONCE_WIDTH_TILES,
  sconceNeedsMirror
} from './constants';
import { FloorData, Sconce } from './types';

interface SpriteInfo {
  object: THREE.Object3D;
  material: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  x: number;
  y: number;
  frames?: THREE.Texture[];
  currentFrame: number;
  animSpeed: number;
  lastFrameTime: number;
}

function configureSpriteTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001; // sRGBEncoding fallback
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
  // Anchor at the feet so scale changes don't sink into the floor
  sprite.center.set(0.5, 0);
  sprite.position.set(x, y, z);
  sprite.scale.set(width, height, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = 10;
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

  async loadSprites(scene: THREE.Scene, floorData: FloorData, sconces: readonly Sconce[]) {
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

        // tiles[row][col] === tiles[y][x]. Slime is at tiles[2][7] → x=7, y=2.
        if (tile.monster === 'slime') {
          const frames = await Promise.all([
            loadTex('art/dungeon/slime_idle_1_near.png'),
            loadTex('art/dungeon/slime_idle_2_near.png'),
            loadTex('art/dungeon/slime_idle_3_near.png'),
            loadTex('art/dungeon/slime_idle_4_near.png')
          ]);

          const mat = makeSpriteMaterial(frames[0]);
          // ~wall-height billboard, feet on the floor, centered in the cell
          const sprite = makeBillboard(mat, x * CELL_SIZE, 0.02, y * CELL_SIZE, 1.85, 1.7);
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
            frames,
            currentFrame: 0,
            animSpeed: 200,
            lastFrameTime: 0
          });
        }

        if (tile.item === 'key') {
          const tex = await loadTex('art/dungeon/item_key_near.png');
          const mat = makeSpriteMaterial(tex);
          const sprite = makeBillboard(mat, x * CELL_SIZE, 0.15, y * CELL_SIZE, 0.9, 0.9);
          scene.add(sprite);

          this.sprites.push({
            object: sprite,
            material: mat,
            x,
            y,
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

  update(time: number) {
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
  }
}
