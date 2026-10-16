import { FACE_INSET } from './constants';

/**
 * Greedy meshing (Mikola Lysenko) over a binary occupancy volume.
 * Occupancy is 0 or 1 — colour lives on the source texture via UVs, so
 * same-depth brick faces collapse even when the PNG is noisy.
 */

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function emptyMesh(): MeshArrays {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function triangleCount(mesh: MeshArrays): number {
  return mesh.indices.length / 3;
}

function addQuad(
  mesh: MeshArrays,
  c0: [number, number, number],
  c1: [number, number, number],
  c2: [number, number, number],
  c3: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  uv3: [number, number]
): void {
  const ax = c1[0] - c0[0];
  const ay = c1[1] - c0[1];
  const az = c1[2] - c0[2];
  const bx = c3[0] - c0[0];
  const by = c3[1] - c0[1];
  const bz = c3[2] - c0[2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  const base = mesh.positions.length / 3;
  const corners = [c0, c1, c2, c3];
  const uvs = [uv0, uv1, uv2, uv3];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    mesh.positions.push(p[0] + nx * FACE_INSET, p[1] + ny * FACE_INSET, p[2] + nz * FACE_INSET);
    mesh.normals.push(nx, ny, nz);
    mesh.uvs.push(uvs[i][0], uvs[i][1]);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export interface GreedyOptions {
  cullNeg?: [boolean, boolean, boolean];
  cullPos?: [boolean, boolean, boolean];
}

export interface GreedyResult {
  mesh: MeshArrays;
  quads: number;
  triangles: number;
}

function texelUV(
  x: number,
  y: number,
  W: number,
  H: number
): [number, number] {
  const u = (Math.min(Math.max(x, 0), W) - (x >= W ? 0.001 : 0)) / W;
  const v = (Math.min(Math.max(y, 0), H) - (y >= H ? 0.001 : 0)) / H;
  return [u, v];
}

export function greedyMesh(
  volume: Uint8Array,
  dims: [number, number, number],
  toWorld: (x: number, y: number, z: number) => [number, number, number],
  options: GreedyOptions = {}
): GreedyResult {
  const [W, H, D] = dims;
  const cullNeg = options.cullNeg ?? [false, false, true];
  const cullPos = options.cullPos ?? [false, false, false];
  const mesh = emptyMesh();
  let quads = 0;

  const get = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 0;
    return volume[x + y * W + z * W * H];
  };

  const dimsA = [W, H, D];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int8Array(dimsA[u] * dimsA[v]);

    for (x[d] = -1; x[d] < dimsA[d]; ) {
      let n = 0;
      for (x[v] = 0; x[v] < dimsA[v]; ++x[v]) {
        for (x[u] = 0; x[u] < dimsA[u]; ++x[u], ++n) {
          const a = get(x[0], x[1], x[2]);
          const b = get(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          if (a !== 0 && b === 0) mask[n] = 1;
          else if (a === 0 && b !== 0) mask[n] = -1;
          else mask[n] = 0;
        }
      }

      ++x[d];

      n = 0;
      for (let j = 0; j < dimsA[v]; ++j) {
        for (let i = 0; i < dimsA[u]; ) {
          const c = mask[n];
          if (c === 0) {
            i += 1;
            n += 1;
            continue;
          }
          let width = 1;
          while (i + width < dimsA[u] && mask[n + width] === c) width += 1;
          let height = 1;
          heightLoop: while (j + height < dimsA[v]) {
            for (let k = 0; k < width; k++) {
              if (mask[n + k + height * dimsA[u]] !== c) break heightLoop;
            }
            height += 1;
          }

          const posSign = c > 0;
          const plane = x[d];
          const skip =
            (!posSign && plane === 0 && cullNeg[d]) ||
            (posSign && plane === dimsA[d] && cullPos[d]);

          if (!skip) {
            const origin = [0, 0, 0];
            origin[u] = i;
            origin[v] = j;
            origin[d] = x[d];
            const du = [0, 0, 0];
            du[u] = width;
            const dv = [0, 0, 0];
            dv[v] = height;

            const p0 = origin;
            const p1 = [origin[0] + du[0], origin[1] + du[1], origin[2] + du[2]];
            const p2 = [
              origin[0] + du[0] + dv[0],
              origin[1] + du[1] + dv[1],
              origin[2] + du[2] + dv[2]
            ];
            const p3 = [origin[0] + dv[0], origin[1] + dv[1], origin[2] + dv[2]];

            const w0 = toWorld(p0[0], p0[1], p0[2]);
            const w1 = toWorld(p1[0], p1[1], p1[2]);
            const w2 = toWorld(p2[0], p2[1], p2[2]);
            const w3 = toWorld(p3[0], p3[1], p3[2]);
            const uv0 = texelUV(p0[0], p0[1], W, H);
            const uv1 = texelUV(p1[0], p1[1], W, H);
            const uv2 = texelUV(p2[0], p2[1], W, H);
            const uv3 = texelUV(p3[0], p3[1], W, H);

            if (posSign) addQuad(mesh, w0, w1, w2, w3, uv0, uv1, uv2, uv3);
            else addQuad(mesh, w0, w3, w2, w1, uv0, uv3, uv2, uv1);
            quads += 1;
          }

          for (let t = 0; t < height; t++) {
            for (let k = 0; k < width; k++) {
              mask[n + k + t * dimsA[u]] = 0;
            }
          }
          i += width;
          n += width;
        }
      }
    }
  }

  return { mesh, quads, triangles: triangleCount(mesh) };
}

export function mergeMeshes(meshes: MeshArrays[]): MeshArrays {
  const out = emptyMesh();
  for (const m of meshes) {
    const base = out.positions.length / 3;
    for (let i = 0; i < m.positions.length; i++) out.positions.push(m.positions[i]);
    for (let i = 0; i < m.normals.length; i++) out.normals.push(m.normals[i]);
    for (let i = 0; i < m.uvs.length; i++) out.uvs.push(m.uvs[i]);
    for (let i = 0; i < m.indices.length; i++) out.indices.push(m.indices[i] + base);
  }
  return out;
}
