/** Opt-in lab per-pixel lighting. Tiny, always imported — default path must not load voxel-lab. */

/** Voxel-lab torch 0xff9a48 — duplicated so this module stays proto3d-only. */
export const LAB_TORCH_HEX = 0xff9a48;
/** Voxel-lab lantern 0xead1a3. */
export const LAB_LANTERN_HEX = 0xead1a3;

export function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export const LAB_TORCH_RGB = hexToRgb01(LAB_TORCH_HEX);
export const LAB_LANTERN_RGB = hexToRgb01(LAB_LANTERN_HEX);

export function labLightFromSearch(params: URLSearchParams): boolean {
  return params.get('light') === 'lab';
}

export function syncLabLightQuery(on: boolean): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set('light', 'lab');
  else url.searchParams.delete('light');
  history.replaceState(null, '', url);
}
