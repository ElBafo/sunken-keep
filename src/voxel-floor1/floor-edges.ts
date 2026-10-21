/**
 * Floor-stone variants are edge-matched offline
 * (`levels/tools/edge_match_floor_tiles.py`): a 16–24 px band from
 * `floor_stone.png`'s left/top is stamped onto every variant (hard copy,
 * jagged depth, hard pixels) so any two tiles join in the mesher's unrotated
 * UV frame. Joints run across cell borders; tone has no rim.
 */
export const FLOOR_EDGE_BAND_MIN = 16;
export const FLOOR_EDGE_BAND_MAX = 24;
/** Max per-channel delta allowed on a shared edge column/row. */
export const FLOOR_EDGE_MATCH_TOLERANCE = 8;

export type RgbaPixels = { width: number; height: number; data: ArrayLike<number> };

function sample(img: RgbaPixels, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

export function edgeColumn(img: RgbaPixels, x: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let y = 0; y < img.height; y++) out.push(sample(img, x, y));
  return out;
}

export function edgeRow(img: RgbaPixels, y: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let x = 0; x < img.width; x++) out.push(sample(img, x, y));
  return out;
}

export function maxChannelDelta(
  a: ReadonlyArray<[number, number, number]>,
  b: ReadonlyArray<[number, number, number]>
): number {
  let max = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(a[i][c] - b[i][c]));
  }
  return max;
}
