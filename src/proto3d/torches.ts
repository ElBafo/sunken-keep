import * as THREE from 'three';
import {
  CELL_SIZE,
  CUTOUT_ALPHA_TEST,
  FACE_INTO_ROOM,
  FLARE_ANIM_FPS,
  SCONCE_ANIM_FPS,
  SCONCE_FRONT_OFFSET_TILES,
  SCONCE_HEIGHT_TILES,
  SCONCE_WIDTH_TILES,
  TORCH_IGNITE_FLARE_MS,
  TORCH_SNUFF_FPS,
  TORCH_TAP_GUARD_MS,
  WALL_MOUNT_INSET
} from './constants';
import { loadSpriteTexture } from './atlas';
import { Sconce } from './types';
import { cameraSpaceDepth, nearPlaneCulled, objectNearPlaneCulled } from './wall-near-cull';

export type TorchVisualState = 'lit' | 'dead' | 'capped';

interface TorchVisual {
  sconce: Sconce;
  group: THREE.Group;
  side: THREE.Mesh;
  front: THREE.Mesh;
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

/** World poses for the three sconce meshes (matches TorchSystem.load). */
export function torchBracketPoses(s: Sconce): {
  side: { x: number; y: number; z: number };
  front: { x: number; y: number; z: number };
  flame: { x: number; y: number; z: number };
} {
  const { nx, nz } = FACE_INTO_ROOM[s.face];
  const wallX = s.x * CELL_SIZE + nx * (CELL_SIZE / 2);
  const wallZ = s.y * CELL_SIZE + nz * (CELL_SIZE / 2);
  const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
  const inset = WALL_MOUNT_INSET;
  const flameH = 0.3125 * CELL_SIZE;
  const midY = CELL_SIZE / 2;
  const x = wallX + nx * inset;
  const z = wallZ + nz * inset;
  return {
    side: { x, y: midY, z },
    front: { x, y: midY, z },
    flame: { x, y: midY + h / 2 - flameH / 2, z }
  };
}

/** Camera-space depth (positive in front). Three.js cameras look down −Z. */
export function sconceCameraDepth(wx: number, wy: number, wz: number, camera: THREE.Camera): number {
  return cameraSpaceDepth(wx, wy, wz, camera);
}

/** True when a sconce mesh would clip the near plane or sit behind the eye. */
export function sconceCulledByNearPlane(depth: number): boolean {
  return nearPlaneCulled(depth);
}

/** Hide the whole sconce (bracket + flame) once any mesh hits the near plane. */
export function sconceCulledByCamera(s: Sconce, camera: THREE.Camera): boolean {
  const poses = torchBracketPoses(s);
  return (
    sconceCulledByNearPlane(sconceCameraDepth(poses.side.x, poses.side.y, poses.side.z, camera)) ||
    sconceCulledByNearPlane(sconceCameraDepth(poses.front.x, poses.front.y, poses.front.z, camera)) ||
    sconceCulledByNearPlane(sconceCameraDepth(poses.flame.x, poses.flame.y, poses.flame.z, camera))
  );
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

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  async load(scene: THREE.Scene, sconces: Sconce[]) {
    const loadTex = async (path: string): Promise<THREE.Texture> => {
      const tex = await loadSpriteTexture(path);
      configureTex(tex);
      return tex;
    };

    const states: TorchVisualState[] = ['lit', 'dead', 'capped'];
    const [bracketTex, flame, flare, snuff] = await Promise.all([
      Promise.all(
        states.flatMap((state) => [
          loadTex(`proto3d/tex3d/torch/bracket_${state}_side.png`),
          loadTex(`proto3d/tex3d/torch/bracket_${state}_front.png`)
        ])
      ),
      Promise.all([1, 2, 3, 4].map((n) => loadTex(`proto3d/tex3d/torch/flame_calm_${n}.png`))),
      Promise.all([1, 2, 3, 4, 5, 6].map((n) => loadTex(`proto3d/tex3d/torch/flare_${n}.png`))),
      Promise.all([1, 2, 3, 4, 5].map((n) => loadTex(`proto3d/tex3d/torch/snuff_${n}.png`)))
    ]);
    states.forEach((state, i) => {
      this.brackets[state].side = bracketTex[i * 2];
      this.brackets[state].front = bracketTex[i * 2 + 1];
    });
    this.flameFrames = flame;
    this.flareFrames = flare;
    this.snuffFrames = snuff;

    const w = SCONCE_WIDTH_TILES * CELL_SIZE;
    const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const flameH = 0.3125 * CELL_SIZE;

    for (const sconce of sconces) {
      const state = torchState(sconce);
      const { rotY } = FACE_INTO_ROOM[sconce.face];
      const poses = torchBracketPoses(sconce);

      const group = new THREE.Group();
      group.position.set(0, 0, 0);

      const sideMat = cutoutMat(this.brackets[state].side!, true);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sideMat);
      side.position.set(poses.side.x, poses.side.y, poses.side.z);
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
      front.position.set(poses.front.x, poses.front.y, poses.front.z);
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
      flame.position.set(poses.flame.x, poses.flame.y, poses.flame.z);
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
        side,
        front,
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

  private sconceHidden(visual: TorchVisual): boolean {
    // Near-band only. At rest in the room / adjacent square the side-wall
    // bracket must stay up (grid-own-square hide is for dressing, not sconces).
    return objectNearPlaneCulled(visual.group, this.camera);
  }

  snapshot() {
    return this.visuals.map((v) => {
      const hide = this.sconceHidden(v);
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

  setParty(_x: number, _y: number, _dir: number) {
    // Hide is camera near-band only; grid pose is unused.
  }

  update(now: number, partyX?: number, partyY?: number, dir?: number) {
    if (partyX !== undefined && partyY !== undefined && dir !== undefined) {
      this.setParty(partyX, partyY, dir);
    }
    const cam = this.camera.position;
    for (const visual of this.visuals) {
      const hide = this.sconceHidden(visual);
      visual.group.visible = !hide;
      const dx = cam.x - visual.flame.position.x;
      const dz = cam.z - visual.flame.position.z;
      const showFlame = !hide && (visual.sconce.lit || visual.lighting || visual.snuffing);
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
