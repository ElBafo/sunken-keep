import * as THREE from 'three';
import { CELL, SCONCE_ANIM_FPS, SHAFT_OPACITY, SHAFT_WIDTH_TILES } from './constants';
import { hideWallProp, sconceIsLit, torchWorldPos, type SconceSpec, type SunbeamSpec } from './fixtures';
import { loadPng } from '../voxel-lab/materials';
import { flameOnBracket, meshBracket } from './bracket';

type TorchVisual = {
  spec: SconceSpec;
  group: THREE.Group;
  flame: THREE.Sprite | null;
};

export async function buildFloor1Props(
  sconces: SconceSpec[],
  sunbeams: SunbeamSpec[]
): Promise<{
  group: THREE.Group;
  update: (px: number, py: number, dir: number, now: number, freeze: boolean) => void;
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
  const flameMat = new THREE.SpriteMaterial({
    map: flames[0],
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    alphaTest: 0.12
  });
  const flameW = 0.42;
  const flameH = 0.62;
  const visuals: TorchVisual[] = [];

  for (const spec of sconces) {
    const g = new THREE.Group();
    g.name = `sconce:${spec.x},${spec.y},${spec.face}`;
    g.add(meshBracket(spec));

    let flame: THREE.Sprite | null = null;
    if (flameOnBracket(spec) && sconceIsLit(spec)) {
      flame = new THREE.Sprite(flameMat);
      const pos = torchWorldPos(spec);
      flame.position.set(pos.x, pos.y + 0.06, pos.z);
      flame.scale.set(flameW, flameH, 1);
      flame.userData.noShadow = true;
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
  const update = (px: number, py: number, dir: number, now: number, freeze: boolean): void => {
    const frame = flames[Math.floor((freeze ? 0 : now) / frameMs) % flames.length];
    if (flameMat.map !== frame) {
      flameMat.map = frame;
      flameMat.needsUpdate = true;
    }
    for (const v of visuals) {
      v.group.visible = !hideWallProp(v.spec.x, v.spec.y, v.spec.face, px, py, dir);
    }
  };

  return { group, update };
}
