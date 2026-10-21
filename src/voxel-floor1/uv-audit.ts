import { CELL } from './constants';
import { enumerateFaces, type FloorMap, floor1Map } from './layout';
import { KNOT_WALL_FILE, floor1KnotWalls, knotWallViewer } from './knot-walls';

export type StreakedFace = {
  tx: number;
  tz: number;
  wallX: number;
  wallY: number;
  face: string;
  wallFace: string;
  file: string;
  reason: string;
};

/**
 * Unique one-shot panels (knot / secret_closed). They are a full composition,
 * not a tileable run — a running U plus ClampToEdge smears one texel column
 * into horizontal grey streaks across the whole 2 m face.
 */
export function isUniqueWallPanel(file: string): boolean {
  return file === KNOT_WALL_FILE || file.startsWith('secret_');
}

/** Tileable family-base / variant stone — integer U offset + RepeatWrapping. */
export function isRepeatableWallFile(file: string): boolean {
  return file.startsWith('walls_floor1/');
}

/**
 * Viewer cells that showed the ClampToEdge streak before the knot U offset
 * was cleared. Guard-hall north (between the hall side walls) and Pell.
 */
export function listKnotStreakCells(): StreakedFace[] {
  return floor1KnotWalls.map((spec) => {
    const viewer = knotWallViewer(spec);
    return {
      tx: viewer.x,
      tz: viewer.y,
      wallX: spec.x,
      wallY: spec.y,
      face: spec.face === 'N' ? 'S' : spec.face === 'S' ? 'N' : spec.face === 'E' ? 'W' : 'E',
      wallFace: spec.face,
      file: KNOT_WALL_FILE,
      reason: spec.note
    };
  });
}

/**
 * Faces that would render as one texel column/row stretched across a full
 * cell: unique panel + non-zero running U (ClampToEdge), or a non-repeatable
 * file that still carries an offset.
 */
export function listStreakedWallCells(map: FloorMap = floor1Map): StreakedFace[] {
  const out: StreakedFace[] = [];
  for (const job of enumerateFaces(map)) {
    if (job.kind !== 'wall') continue;
    if (!job.uOffset) continue;
    if (isRepeatableWallFile(job.file)) continue;
    out.push({
      tx: job.tx,
      tz: job.tz,
      wallX: job.wallX,
      wallY: job.wallY,
      face: job.face,
      wallFace: job.wallFace,
      file: job.file,
      reason: 'uOffset on a unique / non-repeat wall map (ClampToEdge column smear)'
    });
  }
  return out;
}

/** Quad is large in two world axes but UVs collapse on one axis. */
export function quadIsStreaked(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  first: number,
  minWorld = 0.2,
  minUv = 0.02
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let k = 0; k < 4; k++) {
    const i = first + k;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const u = uvs[i * 2];
    const v = uvs[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const extents = [maxX - minX, maxY - minY, maxZ - minZ].sort((a, b) => b - a);
  if (extents[0] < minWorld || extents[1] < minWorld) return false;
  return maxU - minU < minUv || maxV - minV < minUv;
}

/**
 * Reproject a greedy-mesh quad onto the two longest world axes so jambs and
 * soffits keep wall texel density instead of one stretched row/column.
 */
export function remapDegenerateUvs(
  positions: number[],
  uvs: number[],
  cell: number,
  minWorld = 0.12,
  minUv = 0.02
): number {
  const vCount = (positions.length / 3) | 0;
  let fixed = 0;
  for (let v = 0; v + 3 < vCount; v += 4) {
    if (!quadIsStreaked(positions, uvs, v, minWorld, minUv)) continue;
    const xs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3]);
    const ys = [0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 1]);
    const zs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 2]);
    const ext = (
      [
        { axis: 0 as const, span: Math.max(...xs) - Math.min(...xs), min: Math.min(...xs) },
        { axis: 1 as const, span: Math.max(...ys) - Math.min(...ys), min: Math.min(...ys) },
        { axis: 2 as const, span: Math.max(...zs) - Math.min(...zs), min: Math.min(...zs) }
      ] satisfies Array<{ axis: 0 | 1 | 2; span: number; min: number }>
    ).sort((a, b) => b.span - a.span);
    const vAxis = ext.find((e) => e.axis === 1 && e.span >= minWorld) ?? ext[1];
    const uPick = ext.find((e) => e.axis !== vAxis.axis) ?? ext[0];
    for (let k = 0; k < 4; k++) {
      const p = [
        positions[(v + k) * 3],
        positions[(v + k) * 3 + 1],
        positions[(v + k) * 3 + 2]
      ];
      uvs[(v + k) * 2] = (p[uPick.axis] - uPick.min) / cell;
      uvs[(v + k) * 2 + 1] = (p[vAxis.axis] - vAxis.min) / cell;
    }
    fixed += 1;
  }
  return fixed;
}

export type SkewedQuad = {
  index: number;
  ratio: number;
  worldA: number;
  worldB: number;
  densityA: number;
  densityB: number;
};

/**
 * Texel density along the two quad edges from vertex `first`.
 * Density is UV-span / world-span (same map on both axes).
 */
export function quadEdgeDensities(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  first: number,
  minEdge = 0.008
): { worldA: number; worldB: number; densityA: number; densityB: number } | null {
  const corner = (k: number): { x: number; y: number; z: number; u: number; v: number } => ({
    x: positions[(first + k) * 3],
    y: positions[(first + k) * 3 + 1],
    z: positions[(first + k) * 3 + 2],
    u: uvs[(first + k) * 2],
    v: uvs[(first + k) * 2 + 1]
  });
  const a = corner(0);
  const b = corner(1);
  const d = corner(3);
  const worldA = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const worldB = Math.hypot(d.x - a.x, d.y - a.y, d.z - a.z);
  if (worldA < minEdge || worldB < minEdge) return null;
  const uvA = Math.hypot(b.u - a.u, b.v - a.v);
  const uvB = Math.hypot(d.u - a.u, d.v - a.v);
  return {
    worldA,
    worldB,
    densityA: uvA / worldA,
    densityB: uvB / worldB
  };
}

/** min(density) / max(density). 1 = even; 0 = one axis collapsed. */
export function quadTexelDensityRatio(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  first: number,
  minEdge = 0.008
): number | null {
  const d = quadEdgeDensities(positions, uvs, first, minEdge);
  if (!d) return null;
  const hi = Math.max(d.densityA, d.densityB);
  if (hi < 1e-12) return 0;
  return Math.min(d.densityA, d.densityB) / hi;
}

export function listSkewedQuads(
  positions: ArrayLike<number>,
  uvs: ArrayLike<number>,
  minRatio = 0.5,
  minEdge = 0.008
): SkewedQuad[] {
  const out: SkewedQuad[] = [];
  const vCount = (positions.length / 3) | 0;
  for (let v = 0; v + 3 < vCount; v += 4) {
    const d = quadEdgeDensities(positions, uvs, v, minEdge);
    if (!d) continue;
    const hi = Math.max(d.densityA, d.densityB);
    const ratio = hi < 1e-12 ? 0 : Math.min(d.densityA, d.densityB) / hi;
    if (ratio < minRatio) {
      out.push({
        index: v,
        ratio,
        worldA: d.worldA,
        worldB: d.worldB,
        densityA: d.densityA,
        densityB: d.densityB
      });
    }
  }
  return out;
}

/**
 * Project every arch-opening face from world metres at wall/floor density
 * (1 UV / CELL). Front keeps U along the wall; jambs use depth × height so
 * bed joints run into the passage; soffit/threshold use across × depth.
 */
export function projectArchOpeningUvs(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  uvs: number[],
  face: 'N' | 'E' | 'S' | 'W',
  cell = CELL,
  uOffset = 0
): void {
  const alongX = face === 'N' || face === 'S';
  const count = (positions.length / 3) | 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const across = (alongX ? x : z) / cell;
    const depth = (alongX ? z : x) / cell;
    const up = y / cell;
    const anX = Math.abs(nx);
    const anY = Math.abs(ny);
    const anZ = Math.abs(nz);
    let u: number;
    let v: number;
    if (anY >= anX && anY >= anZ) {
      u = across + uOffset;
      v = depth;
    } else {
      const wallFacing = alongX ? anZ >= anX : anX >= anZ;
      u = (wallFacing ? across : depth) + uOffset;
      v = up;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
}
