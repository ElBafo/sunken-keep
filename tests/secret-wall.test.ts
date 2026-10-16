import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { floor1 } from '../src/proto3d/floor-data';
import {
  neighborFacesIntoCell,
  occludesWallFace,
  SceneBuilder
} from '../src/proto3d/scene-builder';

const JOURNAL_SECRET = { x: 5, y: 13 };
const CARVING_SECRET = { x: 5, y: 1 };

afterEach(() => {
  floor1.tiles[JOURNAL_SECRET.y][JOURNAL_SECRET.x].secretOpen = false;
  floor1.tiles[CARVING_SECRET.y][CARVING_SECRET.x].secretOpen = false;
});

function stubBuilder(): SceneBuilder {
  const builder = new SceneBuilder();
  const tex = new THREE.DataTexture(new Uint8Array([90, 86, 78, 255]), 1, 1);
  tex.needsUpdate = true;
  const variants = (builder as unknown as { variants: Map<string, THREE.Texture[]> }).variants;
  variants.set('wall_plain', [tex]);
  Object.assign(builder, { secretOpen: tex, secretClosed: tex });
  return builder;
}

describe('secret wall neighbor faces', () => {
  it('closed secrets occlude; open secrets do not', () => {
    expect(occludesWallFace({ secret: true })).toBe(true);
    expect(occludesWallFace({ secret: true, secretOpen: false })).toBe(true);
    expect(occludesWallFace({ secret: true, secretOpen: true })).toBe(false);
    expect(occludesWallFace({ wall: true })).toBe(true);
    expect(occludesWallFace({})).toBe(false);
  });

  it('journal secret (5,13) needs the south wall of the passage', () => {
    const faces = neighborFacesIntoCell(floor1, JOURNAL_SECRET.x, JOURNAL_SECRET.y);
    expect(faces).toEqual([
      expect.objectContaining({ cellX: 5, cellY: 14, face: 'N', fdx: 0, fdz: -1 })
    ]);
  });

  it('carving secret (5,1) needs the three solid sides of the room', () => {
    const faces = neighborFacesIntoCell(floor1, CARVING_SECRET.x, CARVING_SECRET.y);
    expect(faces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cellX: 5, cellY: 0, face: 'S' }),
        expect.objectContaining({ cellX: 4, cellY: 1, face: 'E' })
      ])
    );
    expect(faces).toHaveLength(2);
  });

  it('opening a secret emits the missing neighbor faces once', () => {
    const builder = stubBuilder();
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    Object.assign(builder, { worldGroup: group, floorData: floor1 });

    const secret = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial()
    );
    secret.userData.kind = 'secret';
    secret.userData.cellX = CARVING_SECRET.x;
    secret.userData.cellY = CARVING_SECRET.y;
    secret.userData.face = 'E';
    group.add(secret);

    floor1.tiles[CARVING_SECRET.y][CARVING_SECRET.x].secretOpen = true;
    builder.setSecretOpen(scene, CARVING_SECRET.x, CARVING_SECRET.y, true);
    builder.setSecretOpen(scene, CARVING_SECRET.x, CARVING_SECRET.y, true);

    const revealed = [] as Array<{ cellX: number; cellY: number; face: string }>;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.secretReveal) return;
      revealed.push({
        cellX: obj.userData.cellX,
        cellY: obj.userData.cellY,
        face: obj.userData.face
      });
    });
    expect(revealed).toEqual(
      expect.arrayContaining([
        { cellX: 5, cellY: 0, face: 'S' },
        { cellX: 4, cellY: 1, face: 'E' }
      ])
    );
    expect(revealed).toHaveLength(2);
    expect((secret.material as THREE.MeshBasicMaterial).visible).toBe(true);
    expect((secret.material as THREE.MeshBasicMaterial).transparent).toBe(true);
  });

  it('openSecretAt rebuilds voxel/lab after the map change', () => {
    const src = readFileSync(resolve(__dirname, '../src/proto3d/main.ts'), 'utf8');
    expect(src).toContain('resyncSecretGeometry');
    expect(src).toContain('this.voxel?.refresh()');
    expect(src).toContain('this.labLook?.refresh()');
    expect(src).toContain('neighborFacesIntoCell');
    const builder = readFileSync(resolve(__dirname, '../src/proto3d/scene-builder.ts'), 'utf8');
    expect(builder).toContain('revealSecretNeighbors');
    expect(builder).toContain('secretReveal');
    expect(builder).toContain('mat.visible = true');
  });
});
