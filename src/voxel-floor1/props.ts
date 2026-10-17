import * as THREE from 'three';
import {
  BRACKET_VOX,
  CELL,
  CUTOUT_ALPHA_TEST,
  SCONCE_ANIM_FPS,
  SHAFT_OPACITY,
  SHAFT_WIDTH_TILES
} from './constants';
import { dirToRot, poseGridCamera } from './camera';
import { sconceIsLit, torchWorldPos, type SconceSpec, type SunbeamSpec } from './fixtures';
import { applyWallMountNearCull } from './near-cull';
import { loadPng } from '../voxel-lab/materials';
import { flameOnBracket, meshBracket } from './bracket';

type TorchVisual = {
  spec: SconceSpec;
  group: THREE.Group;
  flame: THREE.Mesh | null;
};

export type PropDest = { x: number; y: number; dir: number };

function cutoutFlameMat(map: THREE.Texture): THREE.MeshBasicMaterial {
  map.premultiplyAlpha = true;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    premultipliedAlpha: true,
    alphaTest: CUTOUT_ALPHA_TEST,
    depthTest: true,
    depthWrite: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
}

export async function buildFloor1Props(
  sconces: SconceSpec[],
  sunbeams: SunbeamSpec[]
): Promise<{
  group: THREE.Group;
  update: (camera: THREE.Camera, now: number, freeze: boolean, dest?: PropDest | null) => void;
  sconceVisible: (x: number, y: number, face: string) => boolean;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-props';

  const [flame1, flame2, flame3, flame4, shaft1, shaft2] = await Promise.all([
    loadPng('torch/flame_calm_1.png'),
    loadPng('torch/flame_calm_2.png'),
    loadPng('torch/flame_calm_3.png'),
    loadPng('torch/flame_calm_4.png'),
    loadPng('../atmo/shaft_1.png'),
    loadPng('../atmo/shaft_2.png')
  ]);

  const flames = [flame1.texture, flame2.texture, flame3.texture, flame4.texture];
  const flameMat = cutoutFlameMat(flames[0]);
  const flameW = 12 * BRACKET_VOX;
  const flameH = 20 * BRACKET_VOX;
  const flameGeo = new THREE.PlaneGeometry(flameW, flameH);
  const visuals: TorchVisual[] = [];
  const destCam = new THREE.PerspectiveCamera();

  for (const spec of sconces) {
    const g = new THREE.Group();
    g.name = `sconce:${spec.x},${spec.y},${spec.face}`;
    g.userData.isSconce = true;
    g.add(meshBracket(spec));

    let flame: THREE.Mesh | null = null;
    if (flameOnBracket(spec) && sconceIsLit(spec)) {
      flame = new THREE.Mesh(flameGeo, flameMat);
      const pos = torchWorldPos(spec);
      flame.position.set(pos.x, pos.y + flameH * 0.28, pos.z);
      flame.userData.noShadow = true;
      flame.userData.isSconce = true;
      flame.frustumCulled = false;
      flame.castShadow = false;
      flame.receiveShadow = false;
      flame.renderOrder = 3;
      g.add(flame);
    }

    group.add(g);
    visuals.push({ spec, group: g, flame });
  }

  sunbeams.forEach((beam, index) => {
    const width = SHAFT_WIDTH_TILES * CELL;
    const height = CELL - 0.04;
    const midY = beam.wy - height / 2;
    const slant = ((12 + (index % 3) * 5) * Math.PI) / 180;
    const sign = index % 2 === 0 ? 1 : -1;
    const shaftTex = index % 2 === 0 ? shaft1.texture : shaft2.texture;
    const shaftMat = new THREE.MeshBasicMaterial({
      map: shaftTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
      opacity: SHAFT_OPACITY,
      toneMapped: false
    });
    const coreMat = shaftMat.clone();
    coreMat.opacity = 0.55;
    for (const rotY of [Math.PI / 4, (Math.PI * 3) / 4]) {
      const holder = new THREE.Group();
      holder.position.set(beam.wx, midY, beam.wz);
      holder.rotation.y = rotY;
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shaftMat);
      shaft.rotation.z = slant * sign;
      shaft.renderOrder = 6;
      shaft.userData.noShadow = true;
      const core = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.45, height), coreMat);
      core.rotation.z = slant * sign * 0.6;
      core.renderOrder = 7;
      core.userData.noShadow = true;
      holder.add(shaft, core);
      group.add(holder);
    }
  });

  const frameMs = 1000 / SCONCE_ANIM_FPS;
  const update = (camera: THREE.Camera, now: number, freeze: boolean, dest?: PropDest | null): void => {
    const frame = flames[Math.floor((freeze ? 0 : now) / frameMs) % flames.length];
    if (flameMat.map !== frame) {
      flameMat.map = frame;
      flameMat.needsUpdate = true;
    }
    let destCamera: THREE.Camera | undefined;
    if (dest) {
      poseGridCamera(destCam, dest.x, dest.y, dirToRot(dest.dir));
      destCamera = destCam;
    }
    for (const v of visuals) {
      v.group.visible = true;
      if (v.flame) v.flame.quaternion.copy(camera.quaternion);
      applyWallMountNearCull(v.group, camera, destCamera);
    }
  };

  return {
    group,
    update,
    sconceVisible: (x: number, y: number, face: string) => {
      const v = visuals.find((row) => row.spec.x === x && row.spec.y === y && row.spec.face === face);
      return v ? v.group.visible : false;
    }
  };
}
