import * as THREE from 'three';
import { CELL_SIZE, FACE_SEGMENTS, WALL_BOTTOM, WALL_TOP } from './constants';

function makeWallSizedPlane(): THREE.PlaneGeometry {
  const height = WALL_TOP - WALL_BOTTOM;
  const geo = new THREE.PlaneGeometry(CELL_SIZE, height, FACE_SEGMENTS, FACE_SEGMENTS);
  geo.computeVertexNormals();
  return geo;
}

/** Wall-sized quad with UVs in world-Y / CELL_SIZE, matching stone friezes. */
export function makeWallGeometry(): THREE.PlaneGeometry {
  const height = WALL_TOP - WALL_BOTTOM;
  const geo = makeWallSizedPlane();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i);
    const worldY = WALL_BOTTOM + v * height;
    uv.setY(i, worldY / CELL_SIZE);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Same vertex scale / normals as a wall; 0–1 UVs for the authored rubble sprite. */
export function makeRubbleGeometry(): THREE.PlaneGeometry {
  return makeWallSizedPlane();
}

export function wallMidY(): number {
  return (WALL_TOP + WALL_BOTTOM) / 2;
}
