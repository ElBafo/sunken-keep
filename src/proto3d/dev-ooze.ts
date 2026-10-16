import * as THREE from 'three';
import { CELL_SIZE, MONSTER_OFFSET_TOWARD_PARTY } from './constants';
import { monsterVisualOffset } from './sprites';
import {
  buildMonsterVolume,
  meshMonster,
  parseMonsterDef,
  type MonsterDef
} from '../voxel-lab/monster-builder';

const OOZE_DEF_FILE = 'lab/monsters/gray_ooze.json';
const IDLE_PULSE = 0.04;
const IDLE_HZ = 0.28;

type Deform = {
  pulse: { value: number };
  leanX: { value: number };
  leanZ: { value: number };
  sink: { value: number };
  spread: { value: number };
};

function hookDeform(mat: THREE.Material, u: Deform, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOozePulse = u.pulse;
    shader.uniforms.uOozeLeanX = u.leanX;
    shader.uniforms.uOozeLeanZ = u.leanZ;
    shader.uniforms.uOozeSink = u.sink;
    shader.uniforms.uOozeSpread = u.spread;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uOozePulse;
uniform float uOozeLeanX;
uniform float uOozeLeanZ;
uniform float uOozeSink;
uniform float uOozeSpread;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.xz *= (1.0 + uOozeSpread);
transformed.x += transformed.y * uOozeLeanX;
transformed.z += transformed.y * uOozeLeanZ;
transformed.y *= (1.0 + uOozePulse) * (1.0 - uOozeSink);`
      );
  };
  mat.customProgramCacheKey = () => key;
}

export type DevOoze = {
  group: THREE.Group;
  def: MonsterDef;
  voxels: number;
  triangles: number;
  place: (tileX: number, tileY: number, partyX: number, partyY: number) => void;
  setTint: (r: number, g: number, b: number) => void;
  setVisible: (on: boolean) => void;
  update: (now: number) => void;
  dispose: () => void;
};

export async function createDevOoze(scene: THREE.Scene): Promise<DevOoze> {
  const url = `${import.meta.env.BASE_URL}${OOZE_DEF_FILE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${OOZE_DEF_FILE}`);
  const def = parseMonsterDef(await res.json());
  const built = buildMonsterVolume(def, def.defaultResolution ?? 32);
  const meshed = meshMonster(def, built);
  const idle = def.animations?.idle ?? {};
  const pulseAmt = idle.pulse ?? IDLE_PULSE;
  const hz = idle.hz ?? IDLE_HZ;

  const deform: Deform = {
    pulse: { value: 0 },
    leanX: { value: 0 },
    leanZ: { value: 0 },
    sink: { value: 0 },
    spread: { value: 0 }
  };

  const group = new THREE.Group();
  group.name = 'dev-gray-ooze';
  group.visible = false;
  for (const g of meshed.groups) {
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
      transparent: g.group === 'core',
      opacity: g.group === 'core' ? 0.55 : 1,
      depthWrite: g.group !== 'core'
    });
    hookDeform(mat, deform, `dev-ooze-${g.group}`);
    const mesh = new THREE.Mesh(g.geometry, mat);
    mesh.userData.kind = 'dev-ooze';
    mesh.userData.skipVertexLighting = true;
    mesh.userData.skipLabLook = true;
    group.add(mesh);
  }
  scene.add(group);

  return {
    group,
    def,
    voxels: built.voxelCount,
    triangles: meshed.triangles,
    place(tileX, tileY, partyX, partyY) {
      const { ox, oz } = monsterVisualOffset(tileX, tileY, partyX, partyY, MONSTER_OFFSET_TOWARD_PARTY, CELL_SIZE);
      group.position.set(tileX * CELL_SIZE + ox, 0, tileY * CELL_SIZE + oz);
      group.rotation.set(0, 0, 0);
    },
    setTint(r, g, b) {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshBasicMaterial;
        mat.color.setRGB(r, g, b);
      });
    },
    setVisible(on) {
      group.visible = on;
    },
    update(now) {
      const t = now * 0.001;
      deform.pulse.value = pulseAmt * Math.sin(t * Math.PI * 2 * hz);
    },
    dispose() {
      group.removeFromParent();
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      });
    }
  };
}
