import * as THREE from 'three';
import { WALL_MOUNT_NEAR_CULL } from './constants';

const _view = new THREE.Vector3();
const _world = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _box = new THREE.Box3();

/** Camera-space depth (positive in front). Three.js cameras look down −Z. */
export function cameraSpaceDepth(wx: number, wy: number, wz: number, camera: THREE.Camera): number {
  _view.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
  return -_view.z;
}

export function nearPlaneCulled(depth: number): boolean {
  return depth < WALL_MOUNT_NEAR_CULL;
}

function isDrawnSurface(obj: THREE.Object3D): obj is THREE.Mesh | THREE.Sprite {
  return !!(obj as THREE.Mesh).isMesh || !!(obj as THREE.Sprite).isSprite;
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
    _corner
      .set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z)
      .applyMatrix4(mesh.matrixWorld);
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

function planeNearCulled(mesh: THREE.Mesh, camera: THREE.Camera): boolean {
  mesh.getWorldPosition(_world);
  const geo = mesh.geometry as THREE.PlaneGeometry;
  const params = geo.parameters;
  const r = 0.5 * Math.hypot(params?.width ?? mesh.scale.x, params?.height ?? mesh.scale.y);
  return nearPlaneCulled(cameraSpaceDepth(_world.x, _world.y, _world.z, camera) - r);
}

/** True when any drawn mesh/sprite of `root` clips the near band. */
export function objectNearPlaneCulled(root: THREE.Object3D, camera: THREE.Camera): boolean {
  camera.updateMatrixWorld();
  root.updateWorldMatrix(true, true);
  let culled = false;
  root.traverse((obj) => {
    if (culled) return;
    if (!isDrawnSurface(obj) || !obj.visible) return;
    if ((obj as THREE.Sprite).isSprite) {
      if (spriteNearCulled(obj as THREE.Sprite, camera)) culled = true;
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry?.type === 'PlaneGeometry') {
      if (planeNearCulled(mesh, camera)) culled = true;
      return;
    }
    if (meshNearCulled(mesh, camera)) culled = true;
  });
  return culled;
}

/** Hide `root` when it clips the live camera or an optional destination pose. Never force-shows. */
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
