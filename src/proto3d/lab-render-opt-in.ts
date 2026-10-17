/** Opt-in lab world renderer. Tiny, always imported — default path must not load voxel-lab. */

export const LAB_RENDER_QUERY = 'render';
export const HEIGHT_RELIEF_QUERY = 'relief';

export function labRenderFromSearch(params: URLSearchParams): boolean {
  return params.get(LAB_RENDER_QUERY) === 'lab';
}

export function syncLabRenderQuery(on: boolean): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(LAB_RENDER_QUERY, 'lab');
  else url.searchParams.delete(LAB_RENDER_QUERY);
  history.replaceState(null, '', url);
}

/** Height-map voxel relief. Default on for ?render=lab; `relief=off` keeps maps unused (flat). */
export function heightReliefFromSearch(params: URLSearchParams): boolean {
  const v = params.get(HEIGHT_RELIEF_QUERY);
  if (v == null || v === '') return true;
  return v !== '0' && v !== 'off' && v !== 'flat' && v !== 'false';
}

export function syncHeightReliefQuery(on: boolean): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.delete(HEIGHT_RELIEF_QUERY);
  else url.searchParams.set(HEIGHT_RELIEF_QUERY, 'off');
  history.replaceState(null, '', url);
}
