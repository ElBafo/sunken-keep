import * as THREE from 'three';
import { CELL } from './constants';
import { tileFlatPose } from '../voxel-lab/faces';
import { tileAt, type FloorMap } from './layout';

export type MarkerSpec = {
  id: string;
  kind: 'journal' | 'carving';
  x: number;
  y: number;
  prompt: string;
  face?: 'N' | 'E' | 'S' | 'W';
  /** Secret cell that must be open before this marker shows. */
  secretX: number;
  secretY: number;
};

/**
 * Classic floor-1 secret contents (from public/levels/floor1.ts):
 * - (5,1) secret + carving_secret — 1-square alcove, plate "We gave much. We need more."
 * - (5,13) secret opens west to (4,13) journal_page 1 (Orrun's journal).
 * Sprites land in a later step; these are stand-in markers so the spaces aren't empty.
 */
export const floor1SecretMarkers: readonly MarkerSpec[] = [
  {
    id: 'carving_secret',
    kind: 'carving',
    x: 5,
    y: 1,
    secretX: 5,
    secretY: 1,
    face: 'N',
    prompt: '"We gave much. We need more."'
  },
  {
    id: 'journal_page_1',
    kind: 'journal',
    x: 4,
    y: 13,
    secretX: 5,
    secretY: 13,
    prompt: "Orrun's journal. The ink still holds."
  }
];

const FACE_DELTA: Record<'N' | 'E' | 'S' | 'W', [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0]
};

export function markerUnlocked(map: FloorMap, spec: MarkerSpec): boolean {
  return !!tileAt(map, spec.secretX, spec.secretY)?.secretOpen;
}

export function buildFloor1Markers(map: FloorMap): {
  group: THREE.Group;
  update: () => void;
  interact: (px: number, py: number, dir: number) => string | null;
} {
  const group = new THREE.Group();
  group.name = 'floor1-markers';
  const nodes: Array<{ spec: MarkerSpec; obj: THREE.Object3D }> = [];

  for (const spec of floor1SecretMarkers) {
    let obj: THREE.Object3D;
    if (spec.kind === 'journal') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.03, 0.56),
        new THREE.MeshBasicMaterial({ color: 0xc4b089, fog: true })
      );
      mesh.position.set(spec.x * CELL, 0.025, spec.y * CELL);
      mesh.userData.noShadow = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = spec.id;
      obj = mesh;
    } else {
      const face = spec.face ?? 'N';
      const pose = tileFlatPose(face, spec.x, spec.y, CELL, 'center');
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.72, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x6a6e66, fog: true })
      );
      const [dx, dz] = FACE_DELTA[face];
      mesh.position.set(pose.x - dx * 0.04, pose.y, pose.z - dz * 0.04);
      mesh.rotation.y = pose.rotY;
      mesh.userData.noShadow = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = spec.id;
      obj = mesh;
    }
    obj.visible = false;
    group.add(obj);
    nodes.push({ spec, obj });
  }

  const update = (): void => {
    for (const node of nodes) node.obj.visible = markerUnlocked(map, node.spec);
  };

  const interact = (px: number, py: number, dir: number): string | null => {
    update();
    const [dx, dy] = FACE_DELTA[['N', 'E', 'S', 'W'][dir & 3] as 'N' | 'E' | 'S' | 'W'];
    const fx = px + dx;
    const fy = py + dy;
    for (const node of nodes) {
      if (!markerUnlocked(map, node.spec)) continue;
      const on = node.spec.x === px && node.spec.y === py;
      const ahead = node.spec.x === fx && node.spec.y === fy;
      const facingPlaque = node.spec.kind === 'carving' && on && node.spec.face === ['N', 'E', 'S', 'W'][dir & 3];
      if (on || ahead || facingPlaque) return node.spec.prompt;
    }
    return null;
  };

  update();
  return { group, update, interact };
}
