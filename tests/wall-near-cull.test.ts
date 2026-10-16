import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_EYE_HEIGHT,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_VIEW,
  CELL_SIZE,
  DIR_DELTA,
  FACE_INTO_ROOM,
  SCONCE_HEIGHT_TILES,
  SCONCE_NEAR_CULL,
  SCONCE_WIDTH_TILES,
  WALL_MOUNT_NEAR_CULL,
  wallPropRoom
} from '../src/proto3d/constants';
import { floor1, floor1Sconces } from '../src/proto3d/floor-data';
import { Player } from '../src/proto3d/player';
import { jarRackPlanePose } from '../src/proto3d/props';
import { torchBracketPoses } from '../src/proto3d/torches';
import {
  applyWallMountNearCull,
  cameraSpaceDepth,
  nearPlaneCulled,
  objectNearPlaneCulled,
  planeNearCulled
} from '../src/proto3d/wall-near-cull';
import {
  interactPropAt,
  isWallFace,
  isWallProp,
  PROP_WALL_DIR,
  wallPropPlanePose,
  wallPropShowsFlat,
  type PropWall
} from '../src/proto3d/wall-props';
import { BarkDirector, DEFAULT_BARK_RULES, type BarkLine } from '../src/proto3d/bark-picker';

const barks = JSON.parse(readFileSync(resolve(__dirname, '../public/barks.json'), 'utf8')) as BarkLine[];
const log = JSON.parse(readFileSync(resolve(__dirname, '../public/log.json'), 'utf8')) as {
  key: string;
  text: string;
}[];

const party = [
  { id: 'brannoc', hp: 45 },
  { id: 'wren', hp: 32 },
  { id: 'ilsevar', hp: 24 },
  { id: 'mags', hp: 28 }
];

function makePlayer(x: number, y: number, dir: number): Player {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW[0] / CAMERA_VIEW[1], CAMERA_NEAR, 32);
  const player = new Player(cam, floor1);
  player.setPosition(x, y, dir);
  return player;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function meshAt(x: number, y: number, z: number, w = 0.4, h = 0.8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h));
  mesh.position.set(x, y, z);
  return mesh;
}

function floor1WallProps(): Array<{ x: number; y: number; face: PropWall; prop: string }> {
  const out: Array<{ x: number; y: number; face: PropWall; prop: string }> = [];
  for (let y = 0; y < floor1.height; y++) {
    for (let x = 0; x < floor1.width; x++) {
      const tile = floor1.tiles[y][x];
      if (!isWallProp(tile) || !isWallFace(tile.propWall) || !tile.prop) continue;
      out.push({ x, y, face: tile.propWall, prop: tile.prop });
    }
  }
  return out;
}

function backIntoPath(propX: number, propY: number, face: PropWall): {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  dir: number;
} {
  const toward = PROP_WALL_DIR[face];
  const dir = (toward + 2) & 3;
  const [dx, dy] = DIR_DELTA[dir];
  return { fromX: propX + dx, fromY: propY + dy, toX: propX, toY: propY, dir };
}

function makeLampGroup(): { group: THREE.Group; sprite: THREE.Sprite; plane: THREE.Mesh } {
  const group = new THREE.Group();
  const sprite = new THREE.Sprite();
  sprite.position.set(13 * CELL_SIZE - 0.55, 0.02, 9 * CELL_SIZE + 0.15);
  sprite.userData.kind = 'lamp_capped';
  const pose = wallPropPlanePose(13, 9, 'E', 32, 48);
  const plane = meshAt(pose.x, pose.y, pose.z);
  plane.userData.kind = 'lamp_capped_wall';
  plane.visible = false;
  group.add(sprite, plane);
  return { group, sprite, plane };
}

function layoutLamp(
  lamp: { group: THREE.Group; sprite: THREE.Sprite; plane: THREE.Mesh },
  playerX: number,
  playerY: number,
  dir: number,
  camera: THREE.Camera
) {
  const onOwn = playerX === 13 && playerY === 9;
  lamp.sprite.visible = !onOwn;
  lamp.plane.visible = wallPropShowsFlat(playerX, playerY, dir, 13, 9, 'E');
  lamp.group.visible = true;
  applyWallMountNearCull(lamp.group, camera);
}

function makeRackGroup(): THREE.Group {
  const group = new THREE.Group();
  const pose = jarRackPlanePose(9, 10);
  const wallX = 9 * CELL_SIZE - CELL_SIZE / 2 + 0.18;
  const wz = 10 * CELL_SIZE;
  for (const zOff of [-0.52, 0.52] as const) {
    group.add(meshAt(wallX, 0.36, wz + zOff));
  }
  for (const hy of [0.18, 0.4, 0.62] as const) {
    group.add(meshAt(wallX + 0.04, hy, wz));
  }
  group.add(meshAt(pose.x, pose.y, pose.z));
  return group;
}

function makeSconceGroup(s: (typeof floor1Sconces)[number]): THREE.Group {
  const group = new THREE.Group();
  const poses = torchBracketPoses(s);
  const { rotY } = FACE_INTO_ROOM[s.face];
  const w = SCONCE_WIDTH_TILES * CELL_SIZE;
  const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
  const side = meshAt(poses.side.x, poses.side.y, poses.side.z, w, h);
  side.rotation.y = rotY - Math.PI / 2;
  side.userData.isSconce = true;
  side.userData.kind = 'torch-bracket';
  side.userData.lightX = s.x;
  side.userData.lightY = s.y;
  group.add(side);
  const front = meshAt(poses.front.x, poses.front.y, poses.front.z, w, h);
  front.rotation.y = rotY;
  front.userData.isSconce = true;
  front.userData.kind = 'torch-bracket';
  front.userData.lightX = s.x;
  front.userData.lightY = s.y;
  group.add(front);
  const flame = meshAt(poses.flame.x, poses.flame.y, poses.flame.z, w, 0.3125 * CELL_SIZE);
  flame.visible = !!s.lit && !s.capped;
  flame.userData.isSconce = true;
  flame.userData.kind = 'torch-flame';
  group.add(flame);
  return group;
}

function visibleNear(root: THREE.Object3D, camera: THREE.Camera): boolean {
  if (!root.visible) return false;
  return objectNearPlaneCulled(root, camera);
}

function backIntoSconce(s: (typeof floor1Sconces)[number]) {
  const room = wallPropRoom(s.x, s.y, s.face);
  const dir = PROP_WALL_DIR[s.face];
  const [dx, dy] = DIR_DELTA[dir];
  return { fromX: room.x + dx, fromY: room.y + dy, toX: room.x, toY: room.y, dir };
}

function tapLampFromDesk(
  director: BarkDirector,
  nowMs: number
): { kind: 'bark'; speaker: string; text: string } | { kind: 'log'; key: string; text: string } {
  const hit = interactPropAt(floor1.tiles, floor1.width, floor1.height, 12, 9, 1);
  if (!hit || hit.tile.prop !== 'lamp_capped') {
    throw new Error(`expected Pell lamp from (12,9) east, got ${hit?.tile.prop}`);
  }
  const lines = barks.filter((l) => l.trigger === hit.tile.bark);
  const bark = director.pick(hit.tile.bark!, lines, { nowMs, party, flags: new Set() });
  if (bark) return { kind: 'bark', speaker: bark.speaker, text: bark.text };
  const sealed = log.find((l) => l.key === 'lamp_sealed')!;
  return { kind: 'log', key: 'lamp_sealed', text: sealed.text };
}

describe('shared wall-mount near-plane cull', () => {
  it('uses one CAMERA_NEAR + 0.5 band for every wall-mounted object', () => {
    expect(WALL_MOUNT_NEAR_CULL).toBe(CAMERA_NEAR + 0.5);
    expect(SCONCE_NEAR_CULL).toBe(WALL_MOUNT_NEAR_CULL);
    expect(nearPlaneCulled(WALL_MOUNT_NEAR_CULL - 0.001)).toBe(true);
    expect(nearPlaneCulled(WALL_MOUNT_NEAR_CULL)).toBe(false);
  });

  it('skips invisible children so #32 wall-flat Pell lamp is not culled at rest on its square', () => {
    const player = makePlayer(13, 9, 1);
    const lamp = makeLampGroup();
    layoutLamp(lamp, 13, 9, 1, player.camera);
    expect(lamp.sprite.visible).toBe(false);
    expect(lamp.plane.visible).toBe(true);
    expect(objectNearPlaneCulled(lamp.group, player.camera)).toBe(false);
    expect(lamp.group.visible).toBe(true);
  });

  it("keeps Pell's lamp visible and tappable from (12,9) facing east", () => {
    const player = makePlayer(12, 9, 1);
    const lamp = makeLampGroup();
    layoutLamp(lamp, 12, 9, 1, player.camera);
    expect(lamp.sprite.visible).toBe(true);
    expect(lamp.plane.visible).toBe(false);
    expect(lamp.group.visible, 'near cull must not hide the lamp at rest from the room').toBe(true);
    expect(objectNearPlaneCulled(lamp.group, player.camera)).toBe(false);

    const hit = interactPropAt(floor1.tiles, floor1.width, floor1.height, 12, 9, 1);
    expect(hit?.x).toBe(13);
    expect(hit?.y).toBe(9);
    expect(hit?.tile.prop).toBe('lamp_capped');
  });

  it('first lamp tap from (12,9) east is Brannoc bark; later taps are the silent sealed line', () => {
    const director = new BarkDirector(DEFAULT_BARK_RULES, () => 0);
    const first = tapLampFromDesk(director, 0);
    expect(first.kind).toBe('bark');
    if (first.kind !== 'bark') return;
    expect(first.speaker).toBe('brannoc');
    expect(first.text).toMatch(/capped the last one/i);

    const later = tapLampFromDesk(director, 100);
    expect(later.kind).toBe('log');
    if (later.kind !== 'log') return;
    expect(later.key).toBe('lamp_sealed');
    expect(later.text).toBe('Pell\'s lamp. Sealed tight. Not yet.');
  });

  it('keeps the jar rack visible from its own square facing west, not at rest generally hidden', () => {
    const player = makePlayer(9, 10, 3);
    const rack = makeRackGroup();
    rack.visible = true;
    applyWallMountNearCull(rack, player.camera);
    expect(objectNearPlaneCulled(rack, player.camera)).toBe(false);
    expect(rack.visible).toBe(true);
    const hit = interactPropAt(floor1.tiles, floor1.width, floor1.height, 9, 10, 3);
    expect(hit?.tile.prop).toBe('jar_rack');

    const fromRoom = makePlayer(10, 10, 3);
    rack.visible = true;
    applyWallMountNearCull(rack, fromRoom.camera);
    expect(objectNearPlaneCulled(rack, fromRoom.camera)).toBe(false);
    expect(rack.visible, 'still shown facing the rack from the room').toBe(true);
  });

  it('backs the camera into each floor-1 wall prop and never shows a mesh in the near band', () => {
    const props = floor1WallProps();
    expect(props.map((p) => `${p.prop}@${p.x},${p.y}`).sort()).toEqual(['jar_rack@9,10', 'lamp_capped@13,9']);

    for (const prop of props) {
      const path = backIntoPath(prop.x, prop.y, prop.face);
      const player = makePlayer(path.fromX, path.fromY, path.dir);
      const rotY = (-path.dir * Math.PI) / 2;
      const lamp = prop.prop === 'lamp_capped' ? makeLampGroup() : null;
      const rack = prop.prop === 'jar_rack' ? makeRackGroup() : null;
      const frames: Array<{ t: number; inBand: boolean; shown: boolean }> = [];

      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const eased = easeInOutQuad(t);
        const x = path.fromX + (path.toX - path.fromX) * eased;
        const y = path.fromY + (path.toY - path.fromY) * eased;
        player.poseCamera(x, y, rotY, 0);
        const root = lamp?.group ?? rack!;
        if (lamp) layoutLamp(lamp, path.fromX, path.fromY, path.dir, player.camera);
        else {
          root.visible = true;
          applyWallMountNearCull(root, player.camera);
        }
        const inBand = objectNearPlaneCulled(root, player.camera);
        const shown = visibleNear(root, player.camera);
        frames.push({ t, inBand, shown });
      }

      expect(
        frames.some((f) => f.inBand),
        `${prop.prop} backing (${path.fromX},${path.fromY},${path.dir})→(${path.toX},${path.toY}) never entered the near band`
      ).toBe(true);
      expect(
        frames.every((f) => !f.shown),
        `${prop.prop} showed a near-band mesh: ${JSON.stringify(frames.filter((f) => f.shown))}`
      ).toBe(true);
    }
  });

  it('keeps a side-wall sconce visible at rest in its room and the adjacent corridor square', () => {
    const lit = floor1Sconces.find((s) => s.x === 0 && s.y === 6)!;
    const group = makeSconceGroup(lit);
    for (const [x, y, dir] of [
      [1, 6, 0],
      [1, 6, 2],
      [1, 7, 0]
    ] as const) {
      const player = makePlayer(x, y, dir);
      group.visible = true;
      applyWallMountNearCull(group, player.camera);
      expect(
        objectNearPlaneCulled(group, player.camera),
        `near-cull at rest (${x},${y}) dir ${dir}`
      ).toBe(false);
      expect(group.visible, `hidden at rest (${x},${y}) dir ${dir}`).toBe(true);
    }
  });

  it('culls sconces with the same helper while backing into the unlit (4,6) W bracket', () => {
    const unlit = floor1Sconces.find((s) => s.x === 4 && s.y === 6)!;
    const group = makeSconceGroup(unlit);
    const player = makePlayer(2, 6, 3);
    const rotY = (-3 * Math.PI) / 2;
    let hidBeforeGrid = false;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const eased = easeInOutQuad(t);
      player.poseCamera(2 + (3 - 2) * eased, 6, rotY, 0);
      group.visible = true;
      applyWallMountNearCull(group, player.camera);
      if (!group.visible && t < 1) hidBeforeGrid = true;
      expect(visibleNear(group, player.camera)).toBe(false);
    }
    expect(hidBeforeGrid).toBe(true);

    const facing = makePlayer(3, 6, 1);
    group.visible = true;
    applyWallMountNearCull(group, facing.camera);
    expect(group.visible).toBe(true);
  });

  it('is visual-only: torch loops stay on their own Object3D and update never mutes them', () => {
    const torches = readFileSync(resolve(__dirname, '../src/proto3d/torches.ts'), 'utf8');
    const audio = readFileSync(resolve(__dirname, '../src/proto3d/audio.ts'), 'utf8');
    const cull = readFileSync(resolve(__dirname, '../src/proto3d/wall-near-cull.ts'), 'utf8');
    expect(cull).toContain('Does not touch audio');
    expect(torches).not.toMatch(/stopTorchLoop|startTorchLoop|AudioManager/);
    const start = audio.slice(audio.indexOf('startTorchLoop'), audio.indexOf('stopTorchLoop'));
    expect(start).toContain('scene.add(object)');
    expect(start).toContain('new THREE.Object3D()');
    expect(start).not.toContain('visual.group');
  });

  it('does not consult near-cull when tapping Pell\'s lamp (grid interact stays live)', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    const fn = main.slice(main.indexOf('private handleFacingProp'), main.indexOf('private wireTorchChoice'));
    expect(fn).toContain('interactPropAt');
    expect(fn).toContain("tile.prop === 'lamp_capped'");
    expect(fn).toContain("this.storyLog('lamp_sealed')");
    expect(fn).not.toMatch(/NearCull|group\.visible|objectNearPlaneCulled/);
  });

  it('culls when a corner is in the band even if the mesh origin is not', () => {
    const player = makePlayer(1, 6, 0);
    const camZ = player.camera.position.z;
    const z = camZ - (WALL_MOUNT_NEAR_CULL + 0.12);
    const w = SCONCE_WIDTH_TILES * CELL_SIZE;
    const h = SCONCE_HEIGHT_TILES * CELL_SIZE;
    const x = player.camera.position.x;
    const y = CAMERA_EYE_HEIGHT;
    const mesh = meshAt(x, y, z, w, h);
    mesh.rotation.y = Math.PI / 2;
    const group = new THREE.Group();
    group.add(mesh);
    const centerD = cameraSpaceDepth(x, y, z, player.camera);
    expect(centerD, 'origin stays outside the band').toBeGreaterThanOrEqual(WALL_MOUNT_NEAR_CULL);
    expect(nearPlaneCulled(centerD)).toBe(false);
    expect(
      planeNearCulled(x, y, z, Math.PI / 2, w, h, player.camera),
      'near edge already in the band'
    ).toBe(true);
    expect(objectNearPlaneCulled(group, player.camera)).toBe(true);
    applyWallMountNearCull(group, player.camera);
    expect(group.visible).toBe(false);
  });

  it('hides all 11 wall mounts while backing into them, including hitch frames, 20 times', () => {
    expect(floor1Sconces).toHaveLength(9);
    const mounts: Array<{ name: string; fromX: number; fromY: number; toX: number; toY: number; dir: number; root: () => THREE.Object3D }> = [];
    for (const s of floor1Sconces) {
      const path = backIntoSconce(s);
      mounts.push({
        name: `sconce ${s.x},${s.y} ${s.face}`,
        ...path,
        root: () => makeSconceGroup(s)
      });
    }
    for (const prop of floor1WallProps()) {
      const path = backIntoPath(prop.x, prop.y, prop.face);
      mounts.push({
        name: `${prop.prop}@${prop.x},${prop.y}`,
        ...path,
        root: () => (prop.prop === 'lamp_capped' ? makeLampGroup().group : makeRackGroup())
      });
    }
    expect(
      mounts.map((m) => m.name).sort(),
      `got ${mounts.length} mounts`
    ).toHaveLength(11);

    const flashes: string[] = [];
    for (let run = 0; run < 20; run++) {
      for (const mount of mounts) {
        const player = makePlayer(mount.fromX, mount.fromY, mount.dir);
        const root = mount.root();
        for (const hitch of [false, true]) {
          const rotY = (-mount.dir * Math.PI) / 2;
          const ts = hitch ? [0, 0.55, 0.92, 1] : Array.from({ length: 13 }, (_, i) => i / 12);
          for (const t of ts) {
            const eased = easeInOutQuad(t);
            player.poseCamera(
              mount.fromX + (mount.toX - mount.fromX) * eased,
              mount.fromY + (mount.toY - mount.fromY) * eased,
              rotY,
              0
            );
            if (mount.name.startsWith('lamp')) {
              const lamp = { group: root, sprite: root.children[0] as THREE.Sprite, plane: root.children[1] as THREE.Mesh };
              layoutLamp(lamp, mount.fromX, mount.fromY, mount.dir, player.camera);
            } else {
              root.visible = true;
              applyWallMountNearCull(root, player.camera);
            }
            if (visibleNear(root, player.camera)) {
              flashes.push(`${mount.name} run ${run} t=${t.toFixed(2)} hitch=${hitch}`);
            }
          }
        }
      }
    }
    expect(flashes, flashes.slice(0, 8).join('; ')).toEqual([]);
  });

  it('hides from the live camera, not from a step event or stale player.x', () => {
    const main = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    const torches = readFileSync(resolve(__dirname, '../src/proto3d/torches.ts'), 'utf8');
    const cull = readFileSync(resolve(__dirname, '../src/proto3d/wall-near-cull.ts'), 'utf8');
    expect(cull).toContain('boundingBox');
    expect(cull).toContain('planeNearCulled');
    expect(torches).toContain('Live camera AABB');
    expect(torches).toContain('objectNearPlaneCulled(visual.group, this.camera)');
    expect(main).toContain('this.cullWallMounts(now)');
    expect(main).toContain('this.cullWallMounts(performance.now())');
    expect(main).toContain('destCullCam');
    expect(main).toContain('listVisibleNearBand');
  });
});
