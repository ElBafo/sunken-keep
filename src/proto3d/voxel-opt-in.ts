/** Opt-in voxel walls. Tiny, always imported — default path must not load the lab page. */

/** Build voxel geometry at this Chebyshev distance (build-ahead). */
export const VOXEL_ENTER_CHEB = 3;
/** Keep voxels until the party is this far (hysteresis so stepping does not pop). */
export const VOXEL_LEAVE_CHEB = 4;

export function voxelFromSearch(params: URLSearchParams): boolean {
  const v = params.get('voxel');
  return v === '1' || v === 'true';
}

export function syncVoxelQuery(on: boolean): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set('voxel', '1');
  else url.searchParams.delete('voxel');
  history.replaceState(null, '', url);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function voxelLodWants(
  dist: number,
  wasVoxel: boolean,
  enter = VOXEL_ENTER_CHEB,
  leave = VOXEL_LEAVE_CHEB
): boolean {
  if (wasVoxel) return dist <= leave;
  return dist <= enter;
}

export function surfaceChebyshev(
  partyX: number,
  partyY: number,
  cellX: number,
  cellY: number,
  lightX?: number,
  lightY?: number
): number {
  const toCell = chebyshev(partyX, partyY, cellX, cellY);
  if (lightX == null || lightY == null) return toCell;
  return Math.min(toCell, chebyshev(partyX, partyY, lightX, lightY));
}
