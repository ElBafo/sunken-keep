import * as THREE from 'three';
import {
  BRACKET_FLAME_H,
  BRACKET_FLAME_SINK,
  BRACKET_FLAME_W,
  BRACKET_HANDLE_TILT,
  CELL,
  CUTOUT_ALPHA_TEST,
  SCONCE_ANIM_FPS,
  SHAFT_OPACITY,
  SHAFT_WIDTH_TILES
} from './constants';
import { dirToRot, poseGridCamera } from './camera';
import {
  FACE_INTO_ROOM,
  floor1FallenBeams,
  sconceIsLit,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
import { applyWallMountNearCull } from './near-cull';
import { loadPng } from '../voxel-lab/materials';
import { cupWorldPos, flameOnBracket, meshBracket } from './bracket';
import { listCeilingBeams, meshCeilingBeams } from './ceiling-beams';
import { floor1Map } from './layout';

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

  const [flame1, flame2, flame3, flame4, shaft1, shaft2, woodBeam] = await Promise.all([
    loadPng('torch/flame_teardrop_1.png'),
    loadPng('torch/flame_teardrop_2.png'),
    loadPng('torch/flame_teardrop_3.png'),
    loadPng('torch/flame_teardrop_4.png'),
    loadPng('../atmo/shaft_1.png'),
    loadPng('../atmo/shaft_2.png'),
    loadPng('wood_beam.png')
  ]);

  const flames = [flame1.texture, flame2.texture, flame3.texture, flame4.texture];
  const flameMat = cutoutFlameMat(flames[0]);
  const flameGeo = new THREE.PlaneGeometry(BRACKET_FLAME_W, BRACKET_FLAME_H);
  // Pivot at the cup: a little of the wide base hangs into the gold so there is no gap.
  flameGeo.translate(0, BRACKET_FLAME_H * 0.5 - BRACKET_FLAME_SINK, 0);
  const flameUp = new THREE.Vector3();
  const sinTilt = Math.sin(BRACKET_HANDLE_TILT);
  const cosTilt = Math.cos(BRACKET_HANDLE_TILT);
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
      const pos = cupWorldPos(spec);
      flame.position.set(pos.x, pos.y, pos.z);
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

  woodBeam.texture.wrapS = THREE.RepeatWrapping;
  woodBeam.texture.wrapT = THREE.RepeatWrapping;
  const ceiling = meshCeilingBeams(woodBeam.texture, listCeilingBeams(floor1Map));
  if (ceiling) group.add(ceiling);
  const woodMat = new THREE.MeshBasicMaterial({
    map: woodBeam.texture,
    color: 0xffffff,
    fog: true,
    toneMapped: false
  });
  for (const pile of floor1FallenBeams) {
    const wx = pile.x * CELL;
    const wz = pile.y * CELL;
    const sign = pile.mirror ? -1 : 1;
    const addPlank = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      rx: number,
      ry: number,
      rz: number
    ): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.name = `beams_fallen:${pile.x},${pile.y}`;
      group.add(mesh);
    };
    addPlank(2.15, 0.28, 0.32, wx + 0.08 * sign, 0.62, wz - 0.06, 0.22, 0, sign * 0.62);
    addPlank(1.55, 0.22, 0.26, wx - 0.18 * sign, 0.34, wz + 0.32, 0, 0.7 * sign, sign * -0.4);
    addPlank(0.55, 0.28, 0.42, wx + 0.42 * sign, 0.14, wz + 0.4, 0, 0.4 * sign, sign * 0.18);
    if (pile.x === 10 && pile.y === 1) {
      addPlank(0.95, 0.14, 0.22, wx + 0.38, 0.1, wz - 0.42, 0.12, 0.55, 0.28);
      addPlank(0.42, 0.12, 0.36, wx - 0.48, 0.08, wz + 0.18, 0.05, -0.35, 0.16);
    }
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
      if (v.flame) {
        const { nx, nz } = FACE_INTO_ROOM[v.spec.face];
        flameUp.set(nx * sinTilt, cosTilt, nz * sinTilt).normalize();
        v.flame.up.copy(flameUp);
        v.flame.lookAt(camera.position);
      }
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
