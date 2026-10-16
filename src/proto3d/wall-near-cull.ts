import * as THREE from 'three';
import { WALL_MOUNT_NEAR_CULL } from './constants';

const _view = new THREE.Vector3();
const _world = new THREE.Vector3();

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

function ancestorHidden(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = obj.parent;
  while (p && p !== root) {
    if (!p.visible) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Visual-only: true when any *currently drawn* mesh/sprite is inside the near
 * band. Invisible children (e.g. the off-square lamp sprite while the #32
 * wall-flat plane is showing) must not cull the group. Ignores `root.visible`
 * so a previous frame's hide can be undone. Does not touch audio.
 */
export function objectNearPlaneCulled(root: THREE.Object3D, camera: THREE.Camera): boolean {
  root.updateWorldMatrix(true, true);
  let culled = false;
  root.traverse((obj) => {
    if (culled) return;
    if (!isDrawnSurface(obj) || !obj.visible) return;
    if (ancestorHidden(obj, root)) return;
    obj.getWorldPosition(_world);
    if (nearPlaneCulled(cameraSpaceDepth(_world.x, _world.y, _world.z, camera))) {
      culled = true;
    }
  });
  return culled;
}

/** Hide `root` when it clips the near plane. Never force-shows a hidden object. */
export function applyWallMountNearCull(root: THREE.Object3D, camera: THREE.Camera): void {
  if (!root.visible) return;
  if (objectNearPlaneCulled(root, camera)) root.visible = false;
}
