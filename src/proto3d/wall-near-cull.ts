import * as THREE from 'three';
import { WALL_MOUNT_NEAR_CULL } from './constants';

const _view = new THREE.Vector3();
const _world = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _box = new THREE.Box3();
const _rot = new THREE.Euler();
const _mat = new THREE.Matrix4();

/** Camera-space depth (positive in front). Three.js cameras look down −Z. */
export function cameraSpaceDepth(wx: number, wy: number, wz: number, camera: THREE.Camera): number {
  _view.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
  return -_view.z;
}

/** True when a wall-mounted mesh would clip the near plane or sit behind the eye. */
export function nearPlaneCulled(depth: number): boolean {
  return depth < WALL_MOUNT_NEAR_CULL;
}

function isDrawnSurface(obj: THREE.Object3D): obj is THREE.Mesh | THREE.Sprite {
  return obj instanceof THREE.Mesh || obj instanceof THREE.Sprite;
}

export function ancestorHidden(obj: THREE.Object3D, root: THREE.Object3D | null): boolean {
  let p: THREE.Object3D | null = obj.parent;
  while (p && p !== root) {
    if (!p.visible) return true;
    p = p.parent;
  }
  return false;
}

/** Any of the four local-XY plane corners sits in the near band. */
export function planeNearCulled(
  x: number,
  y: number,
  z: number,
  rotY: number,
  width: number,
  height: number,
  camera: THREE.Camera
): boolean {
  _rot.set(0, rotY, 0, 'YXZ');
  _mat.makeRotationFromEuler(_rot);
  const hw = width / 2;
  const hh = height / 2;
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      _corner.set(sx * hw, sy * hh, 0).applyMatrix4(_mat);
      if (nearPlaneCulled(cameraSpaceDepth(x + _corner.x, y + _corner.y, z + _corner.z, camera))) {
        return true;
      }
    }
  }
  return false;
}

function meshNearCulled(mesh: THREE.Mesh, camera: THREE.Camera): boolean {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) {
    mesh.getWorldPosition(_world);
    return nearPlaneCulled(cameraSpaceDepth(_world.x, _world.y, _world.z, camera));
  }
  _box.copy(bb);
  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? _box.max.x : _box.min.x,
      i & 2 ? _box.max.y : _box.min.y,
      i & 4 ? _box.max.z : _box.min.z
    ).applyMatrix4(mesh.matrixWorld);
    if (nearPlaneCulled(cameraSpaceDepth(_corner.x, _corner.y, _corner.z, camera))) return true;
  }
  return false;
}

function spriteNearCulled(sprite: THREE.Sprite, camera: THREE.Camera): boolean {
  sprite.getWorldPosition(_world);
  const r = 0.5 * Math.hypot(sprite.scale.x, sprite.scale.y);
  const d = cameraSpaceDepth(_world.x, _world.y, _world.z, camera);
  return nearPlaneCulled(d - r);
}

/**
 * Visual-only: true when any *currently drawn* mesh/sprite has a corner (or
 * sprite radius) inside the near band. Mesh *centres* are not enough — a
 * 0.5-wide sconce side piece can fill the screen while its origin is still
 * past WALL_MOUNT_NEAR_CULL. Invisible children (e.g. the off-square lamp
 * sprite while the #32 wall-flat plane is showing) must not cull the group.
 * Ignores `root.visible` so a previous frame's hide can be undone.
 * Does not touch audio.
 */
export function objectNearPlaneCulled(root: THREE.Object3D, camera: THREE.Camera): boolean {
  camera.updateMatrixWorld();
  root.updateWorldMatrix(true, true);
  let culled = false;
  root.traverse((obj) => {
    if (culled) return;
    if (!isDrawnSurface(obj) || !obj.visible) return;
    if (ancestorHidden(obj, root)) return;
    if (obj instanceof THREE.Mesh) {
      if (meshNearCulled(obj, camera)) culled = true;
      return;
    }
    if (spriteNearCulled(obj, camera)) culled = true;
  });
  return culled;
}

/**
 * Hide `root` when any drawn corner clips the near plane at the live camera,
 * or at an optional destination pose (so a backing step hides the mount on
 * tap, not 180ms later when player.x snaps). Callers that also use a grid
 * hide set `visible` from the grid first each frame; this never force-shows.
 */
export function applyWallMountNearCull(
  root: THREE.Object3D,
  camera: THREE.Camera,
  destCamera?: THREE.Camera
): void {
  if (!root.visible) return;
  if (objectNearPlaneCulled(root, camera)) {
    root.visible = false;
    return;
  }
  if (destCamera && objectNearPlaneCulled(root, destCamera)) root.visible = false;
}

function isWallMount(obj: THREE.Object3D): boolean {
  if (obj.userData.isSconce || obj.userData.wallMounted) return true;
  const face = obj.userData.face;
  if (face !== 'N' && face !== 'E' && face !== 'S' && face !== 'W') return false;
  return typeof obj.userData.wallX === 'number' && typeof obj.userData.wallY === 'number';
}

/** Drawn wall mounts whose AABB is in the near band (a flash if this is non-empty). */
export function listVisibleNearBand(
  scene: THREE.Object3D,
  camera: THREE.Camera
): Array<{ kind: string; x: number; y: number }> {
  camera.updateMatrixWorld();
  scene.updateWorldMatrix(true, true);
  const items: Array<{ kind: string; x: number; y: number }> = [];
  scene.traverse((obj) => {
    if (!isDrawnSurface(obj) || !obj.visible) return;
    if (ancestorHidden(obj, scene)) return;
    if (!isWallMount(obj)) return;
    const culled =
      obj instanceof THREE.Mesh ? meshNearCulled(obj, camera) : spriteNearCulled(obj, camera);
    if (!culled) return;
    items.push({
      kind: String(obj.userData.kind ?? (obj.userData.isSconce ? 'sconce' : 'wall-mount')),
      x: Number(obj.userData.lightX ?? obj.userData.gridX ?? obj.userData.wallX ?? obj.userData.x ?? 0),
      y: Number(obj.userData.lightY ?? obj.userData.gridY ?? obj.userData.wallY ?? obj.userData.y ?? 0)
    });
  });
  return items;
}
