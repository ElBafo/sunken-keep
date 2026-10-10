import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  FLARE_ANIM_FPS,
  hideWallProp,
  SCONCE_ANIM_FPS,
  SCONCE_FRONT_OFFSET_TILES,
  SCONCE_HEIGHT_TILES,
  SCONCE_WIDTH_TILES,
  TORCH_IGNITE_FLARE_MS,
  TORCH_SNUFF_FPS,
  TORCH_TAP_GUARD_MS
} from './constants';
import { Sconce } from './types';

export type TorchVisualState = 'lit' | 'dead' | 'capped';

interface TorchVisual {
  sconce: Sconce;
  group: THREE.Group;
  sideMat: THREE.MeshBasicMaterial;
  frontMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
  lighting: boolean;
  snuffing: boolean;
  flameFrame: number;
  lastFrameTime: number;
  tapLockedUntil: number;
}

function configureTex(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  (tex as any).encoding = 3001;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

function cutoutMat(map: THREE.Texture, unlit: boolean) {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: CUTOUT_ALPHA_TEST,
    depthTest: true,
    depthWrite: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexColors: !unlit
  });
}

export function torchState(s: Sconce): TorchVisualState {
  if (s.capped) return 'capped';
  return s.lit ? 'lit' : 'dead';
}

export function torchFrontSquare(s: Sconce): { x: number; y: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  return { x: s.x + Math.round(nx), y: s.y + Math.round(nz) };
}

export function torchWorldPos(s: Sconce): { x: number; y: number; z: number } {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const dist = CELL_SIZE / 2 + SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
  return {
    x: s.x * CELL_SIZE + nx * dist,
    y: CELL_SIZE / 2 + 0.1 * CELL_SIZE,
    z: s.y * CELL_SIZE + nz * dist
  };
}

export class TorchSystem {
  private visuals: TorchVisual[] = [];
  private brackets = {
    lit: { side: null as THREE.Texture | null, front: null as THREE.Texture | null },
    dead: { side: null as THREE.Texture | null, front: null as THREE.Texture | null },
    capped: { side: null as THREE.Texture | null, front: null as THREE.Texture | null }
  };
  private flameFrames: THREE.Texture[] = [];
  private flareFrames: THREE.Texture[] = [];
  private snuffFrames: THREE.Texture[] = [];
  private camera: THREE.Camera;
  private look = new THREE.Vector3();
  private partyX = 0;
  private partyY = 0;
  private partyDir = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  async load(scene: THREE.Scene, sconces: Sconce[]) {
    const loader = new THREE.TextureLoader();
    const baseUrl = import.meta.env.BASE_URL;
    const loadTex = (path: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          `${baseUrl}${path}`,
          (tex) => {
            configureTex(tex);
            resolve(tex);
          },
          undefined,
          (err) => reject(new Error(`Failed to load torch texture ${path}: ${String(err)}`))
        );
      });

    const states: TorchVisualState[] = ['lit', 'dead', 'capped'];
    const loaded = await Promise.all(
      states.flatMap((state) => [
        loadTex(`proto3d/tex3d/torch/bracket_${state}_side.png`),
        loadTex(`proto3d/tex3d/torch/bracket_${state}_front.png`)
      ])
    );
    states.forEach((state, i) => {
      this.brackets[state].side = loaded[i * 2];
      this.brackets[state].front = loaded[i * 2 + 1];
    });

    this.flameFrames = await Promise.all(
      [1, 2, 3, 4].map((n) => loadTex(`proto3d/tex3d/torch/flame_calm_${n}.png`))
    );
    this.flareFrames = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => loadTex(`proto3d/tex3d/torch/flare_${n}.png`))
    );
    this.snuffFrames = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => loadTex(`proto3d/tex3d/torch/snuff_${n}.png`))
    );

    const w = SCONCE_WIDTH_TILES * CELL_SIZE;
    const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const frontOff = SCONCE_FRONT_OFFSET_TILES * CELL_SIZE;
    const flameH = 0.3125 * CELL_SIZE;
    const midY = CELL_SIZE / 2;

    for (const sconce of sconces) {
      const state = torchState(sconce);
      const { nx, nz, rotY } = FACE_INTO_ROOM[sconce.face];
      const wallX = sconce.x * CELL_SIZE + nx * (CELL_SIZE / 2);
      const wallZ = sconce.y * CELL_SIZE + nz * (CELL_SIZE / 2);

      const group = new THREE.Group();
      group.position.set(0, 0, 0);

      const sideMat = cutoutMat(this.brackets[state].side!, true);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sideMat);
      side.position.set(wallX + nx * (w / 2), midY, wallZ + nz * (w / 2));
      side.rotation.y = rotY - Math.PI / 2;
      side.renderOrder = 2;
      side.userData.isSconce = true;
      side.userData.skipVertexLighting = true;
      side.userData.kind = 'torch-bracket';
      side.userData.lightX = sconce.x;
      side.userData.lightY = sconce.y;
      group.add(side);

      const frontMat = cutoutMat(this.brackets[state].front!, true);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
      front.position.set(wallX + nx * frontOff, midY, wallZ + nz * frontOff);
      front.rotation.y = rotY;
      front.renderOrder = 2;
      front.userData.isSconce = true;
      front.userData.skipVertexLighting = true;
      front.userData.kind = 'torch-bracket';
      front.userData.lightX = sconce.x;
      front.userData.lightY = sconce.y;
      group.add(front);

      const flameMat = cutoutMat(this.flameFrames[0], true);
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(w, flameH), flameMat);
      flame.position.set(wallX + nx * frontOff, midY + h / 2 - flameH / 2, wallZ + nz * frontOff);
      flame.renderOrder = 3;
      flame.userData.skipVertexLighting = true;
      flame.userData.isSconce = true;
      flame.userData.noPick = true;
      flame.userData.kind = 'torch-flame';
      flame.visible = state === 'lit';
      group.add(flame);

      scene.add(group);
      this.visuals.push({
        sconce,
        group,
        sideMat,
        frontMat,
        flame,
        flameMat,
        lighting: false,
        snuffing: false,
        flameFrame: 0,
        lastFrameTime: 0,
        tapLockedUntil: 0
      });
    }
  }

  private applyBracket(visual: TorchVisual, state: TorchVisualState) {
    const maps = this.brackets[state];
    visual.sideMat.map = maps.side;
    visual.frontMat.map = maps.front;
    visual.sideMat.needsUpdate = true;
    visual.frontMat.needsUpdate = true;
  }

  ignite(sconce: Sconce, now: number) {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    if (!visual) return;
    sconce.lit = true;
    sconce.capped = false;
    sconce.empty = false;
    this.applyBracket(visual, 'lit');
    visual.lighting = true;
    visual.snuffing = false;
    visual.flameFrame = 0;
    visual.lastFrameTime = now;
    visual.tapLockedUntil = now + TORCH_IGNITE_FLARE_MS + TORCH_TAP_GUARD_MS;
    visual.flame.visible = true;
    visual.flameMat.map = this.flareFrames[0];
    visual.flameMat.needsUpdate = true;
  }

  /** Leave a dead bracket with no snuff animation (Take). */
  takeOffWall(sconce: Sconce) {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    sconce.lit = false;
    sconce.empty = true;
    if (!visual) return;
    this.applyBracket(visual, 'dead');
    visual.lighting = false;
    visual.snuffing = false;
    visual.flame.visible = false;
    visual.flameFrame = 0;
  }

  snuff(sconce: Sconce, now: number) {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    sconce.lit = false;
    sconce.empty = false;
    if (!visual) return;
    this.applyBracket(visual, 'dead');
    visual.lighting = false;
    visual.snuffing = true;
    visual.flameFrame = 0;
    visual.lastFrameTime = now;
    visual.tapLockedUntil = now + (1000 / TORCH_SNUFF_FPS) * this.snuffFrames.length + TORCH_TAP_GUARD_MS;
    visual.flame.visible = true;
    visual.flameMat.map = this.snuffFrames[0];
    visual.flameMat.needsUpdate = true;
  }

  syncFromSconce(sconce: Sconce) {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    if (!visual) return;
    const state: TorchVisualState = sconce.capped ? 'capped' : sconce.lit ? 'lit' : 'dead';
    this.applyBracket(visual, state);
    visual.lighting = false;
    visual.snuffing = false;
    visual.flame.visible = !!sconce.lit && !sconce.capped;
    visual.flameFrame = 0;
  }

  isTapLocked(sconce: Sconce, now = performance.now()): boolean {
    const visual = this.visuals.find((v) => v.sconce === sconce);
    if (!visual) return false;
    return visual.snuffing || visual.lighting || now < visual.tapLockedUntil;
  }

  snapshot() {
    return this.visuals.map((v) => {
      const hide = hideWallProp(v.sconce.x, v.sconce.y, v.sconce.face, this.partyX, this.partyY, this.partyDir);
      return {
        x: v.sconce.x,
        y: v.sconce.y,
        face: v.sconce.face,
        lit: v.sconce.lit,
        capped: !!v.sconce.capped,
        snuffing: v.snuffing,
        lighting: v.lighting,
        bracketVisible: !hide,
        flameVisible: !hide && v.flame.visible,
        tapLocked: this.isTapLocked(v.sconce)
      };
    });
  }

  flameFrame(): number {
    const lit = this.visuals.find((v) => v.sconce.lit && !v.lighting && !v.snuffing);
    return lit?.flameFrame ?? 0;
  }

  facingTorch(playerX: number, playerY: number, dir: number): Sconce | null {
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ][dir];
    const fx = playerX + dx;
    const fy = playerY + dy;
    for (const visual of this.visuals) {
      const front = torchFrontSquare(visual.sconce);
      if (front.x === playerX && front.y === playerY && visual.sconce.x === fx && visual.sconce.y === fy) {
        return visual.sconce;
      }
    }
    return null;
  }

  setParty(x: number, y: number, dir: number) {
    this.partyX = x;
    this.partyY = y;
    this.partyDir = dir;
  }

  update(now: number, partyX?: number, partyY?: number, dir?: number) {
    if (partyX !== undefined && partyY !== undefined && dir !== undefined) {
      this.setParty(partyX, partyY, dir);
    }
    const cam = this.camera.position;
    for (const visual of this.visuals) {
      const hide = hideWallProp(
        visual.sconce.x,
        visual.sconce.y,
        visual.sconce.face,
        this.partyX,
        this.partyY,
        this.partyDir
      );
      visual.group.visible = !hide;
      const dx = cam.x - visual.flame.position.x;
      const dz = cam.z - visual.flame.position.z;
      const nearCam = Math.hypot(dx, dz) < 0.8;
      const showFlame = !hide && (visual.sconce.lit || visual.lighting || visual.snuffing) && !nearCam;
      visual.flame.visible = showFlame;
      if (!showFlame && !visual.snuffing && !visual.lighting) continue;
      this.look.set(dx, 0, dz);
      visual.flame.rotation.y = Math.atan2(this.look.x, this.look.z);

      if (visual.snuffing) {
        const frameMs = 1000 / TORCH_SNUFF_FPS;
        if (now - visual.lastFrameTime < frameMs) continue;
        visual.lastFrameTime = now;
        visual.flameFrame += 1;
        if (visual.flameFrame >= this.snuffFrames.length) {
          visual.snuffing = false;
          visual.flameFrame = 0;
          visual.flame.visible = false;
        } else {
          visual.flameMat.map = this.snuffFrames[visual.flameFrame];
          visual.flameMat.needsUpdate = true;
        }
        continue;
      }

      const frames = visual.lighting ? this.flareFrames : this.flameFrames;
      const fps = visual.lighting ? FLARE_ANIM_FPS : SCONCE_ANIM_FPS;
      const frameMs = 1000 / fps;
      if (now - visual.lastFrameTime < frameMs) continue;
      visual.lastFrameTime = now;
      if (visual.lighting) {
        visual.flameFrame += 1;
        if (visual.flameFrame >= this.flareFrames.length) {
          visual.lighting = false;
          visual.flameFrame = 0;
          visual.flameMat.map = this.flameFrames[0];
        } else {
          visual.flameMat.map = this.flareFrames[visual.flameFrame];
        }
        visual.flameMat.needsUpdate = true;
      } else if (visual.sconce.lit) {
        visual.flameFrame = (visual.flameFrame + 1) % frames.length;
        visual.flameMat.map = frames[visual.flameFrame];
        visual.flameMat.needsUpdate = true;
      }
    }
  }
}
