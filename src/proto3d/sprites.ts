import * as THREE from 'three';
import { FloorData, Sconce } from './types';

const CELL_SIZE = 2;

interface SpriteInfo {
  sprite: THREE.Sprite;
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
            sprite,
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
            sprite,
            x,
            y,
            currentFrame: 0,
            animSpeed: 0,
            lastFrameTime: 0
          });
        }
      }
    }

    for (const sconce of sconces) {
      if (!sconce.lit) continue;

      const frames = await Promise.all([
        loadTex('proto3d/sconce_lit_1_near.png'),
        loadTex('proto3d/sconce_lit_2_near.png'),
        loadTex('proto3d/sconce_lit_3_near.png')
      ]);

      const mat = makeSpriteMaterial(frames[0]);

      const wx = sconce.x * CELL_SIZE;
      const wz = sconce.y * CELL_SIZE;
      // Hang on the ROOM side of the wall face (half-cell + a few cm),
      // not inside the wall block — otherwise depth test hides the flame.
      const offset = CELL_SIZE / 2 + 0.08;

      let x = wx;
      let z = wz;
      if (sconce.face === 'N') z = wz - offset;
      else if (sconce.face === 'E') x = wx + offset;
      else if (sconce.face === 'S') z = wz + offset;
      else if (sconce.face === 'W') x = wx - offset;

      const sprite = makeBillboard(mat, x, 0.9, z, 0.7, 0.9);
      scene.add(sprite);

      this.sprites.push({
        sprite,
        x: sconce.x,
        y: sconce.y,
        frames,
        currentFrame: 0,
        animSpeed: 150,
        lastFrameTime: 0
      });
    }
  }

  update(time: number) {
    for (const sprite of this.sprites) {
      if (sprite.frames && sprite.frames.length > 1) {
        if (time - sprite.lastFrameTime > sprite.animSpeed) {
          sprite.currentFrame = (sprite.currentFrame + 1) % sprite.frames.length;
          const mat = sprite.sprite.material;
          mat.map = sprite.frames[sprite.currentFrame];
          mat.needsUpdate = true;
          sprite.lastFrameTime = time;
        }
      }
    }
  }
}
