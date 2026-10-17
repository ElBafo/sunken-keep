import * as THREE from 'three';
import {
  CELL,
  SCONCE_ANIM_FPS,
  SCONCE_HEIGHT_TILES,
  SCONCE_WIDTH_TILES
} from './constants';
import {
  FACE_INTO_ROOM,
  hideWallProp,
  sconceIsLit,
  torchBracketPoses,
  type SconceSpec,
  type SunbeamSpec
} from './fixtures';
import { loadPng } from '../voxel-lab/materials';

type TorchVisual = {
  spec: SconceSpec;
  group: THREE.Group;
  flame: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
};

function cutoutStandard(map: THREE.Texture, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.2,
    roughness: 0.55,
    metalness: 0.05,
    emissive: new THREE.Color(emissive),
    emissiveIntensity: emissive ? 0.55 : 0,
    side: THREE.DoubleSide
  });
}

function cutoutBasic(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    alphaTest: 0.15,
    depthWrite: false,
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
  update: (px: number, py: number, dir: number, now: number, freeze: boolean) => void;
}> {
  const group = new THREE.Group();
  group.name = 'floor1-props';

  const [
    litFront,
    litSide,
    deadFront,
    deadSide,
    cappedFront,
    cappedSide,
    flame1,
    flame2,
    flame3,
    flame4,
    crack,
    shaft1,
    shaft2
  ] = await Promise.all([
    loadPng('torch/bracket_lit_front.png'),
    loadPng('torch/bracket_lit_side.png'),
    loadPng('torch/bracket_dead_front.png'),
    loadPng('torch/bracket_dead_side.png'),
    loadPng('torch/bracket_capped_front.png'),
    loadPng('torch/bracket_capped_side.png'),
    loadPng('torch/flame_calm_1.png'),
    loadPng('torch/flame_calm_2.png'),
    loadPng('torch/flame_calm_3.png'),
    loadPng('torch/flame_calm_4.png'),
    loadPng('../atmo/ceiling_crack.png'),
    loadPng('../atmo/shaft_1.png'),
    loadPng('../atmo/shaft_2.png')
  ]);

  const flames = [flame1.texture, flame2.texture, flame3.texture, flame4.texture];
  const w = SCONCE_WIDTH_TILES * CELL;
  const h = SCONCE_HEIGHT_TILES * CELL;
  const flameH = 0.3125 * CELL;
  const visuals: TorchVisual[] = [];

  for (const spec of sconces) {
    const state = spec.capped ? 'capped' : sconceIsLit(spec) ? 'lit' : 'dead';
    const frontMap = state === 'lit' ? litFront.texture : state === 'capped' ? cappedFront.texture : deadFront.texture;
    const sideMap = state === 'lit' ? litSide.texture : state === 'capped' ? cappedSide.texture : deadSide.texture;
    const { rotY } = FACE_INTO_ROOM[spec.face];
    const poses = torchBracketPoses(spec);
    const g = new THREE.Group();
    g.name = `sconce:${spec.x},${spec.y},${spec.face}`;

    const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cutoutStandard(sideMap, state === 'lit' ? 0xff9a48 : 0));
    side.position.set(poses.side.x, poses.side.y, poses.side.z);
    side.rotation.y = rotY - Math.PI / 2;
    side.castShadow = false;
    side.receiveShadow = true;
    side.userData.noShadow = true;
    side.renderOrder = 2;

    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      cutoutStandard(frontMap, state === 'lit' ? 0xff9a48 : 0)
    );
    front.position.set(poses.front.x, poses.front.y, poses.front.z);
    front.rotation.y = rotY;
    front.castShadow = false;
    front.receiveShadow = true;
    front.userData.noShadow = true;
    front.renderOrder = 2;

    const flameMat = cutoutBasic(flames[0]);
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(w, flameH), flameMat);
    flame.position.set(poses.flame.x, poses.flame.y, poses.flame.z);
    flame.rotation.y = rotY;
    flame.userData.noShadow = true;
    flame.renderOrder = 3;
    flame.visible = state === 'lit';

    g.add(side, front, flame);
    group.add(g);
    visuals.push({ spec, group: g, flame, flameMat });
  }

  sunbeams.forEach((beam, index) => {
    const crackMat = new THREE.MeshBasicMaterial({
      map: crack.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), crackMat);
    crackMesh.rotation.x = Math.PI / 2;
    crackMesh.position.set(beam.wx, beam.wy, beam.wz);
    crackMesh.userData.noShadow = true;
    crackMesh.renderOrder = 4;
    group.add(crackMesh);

    const width = 0.4 * CELL;
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
      opacity: 0.88,
      toneMapped: false
    });
    for (const rotY of [Math.PI / 4, (Math.PI * 3) / 4]) {
      const holder = new THREE.Group();
      holder.position.set(beam.wx, midY, beam.wz);
      holder.rotation.y = rotY;
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shaftMat);
      shaft.rotation.z = slant * sign;
      shaft.renderOrder = 6;
      shaft.userData.noShadow = true;
      holder.add(shaft);
      group.add(holder);
    }
  });

  const frameMs = 1000 / SCONCE_ANIM_FPS;
  const update = (px: number, py: number, dir: number, now: number, freeze: boolean): void => {
    const frame = flames[Math.floor((freeze ? 0 : now) / frameMs) % flames.length];
    for (const v of visuals) {
      const hide = hideWallProp(v.spec.x, v.spec.y, v.spec.face, px, py, dir);
      v.group.visible = !hide;
      if (v.flame.visible && v.flameMat.map !== frame) {
        v.flameMat.map = frame;
        v.flameMat.needsUpdate = true;
      }
    }
  };

  return { group, update };
}
