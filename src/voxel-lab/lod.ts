/** Lab copy of proto3d distance LOD — do not import the game. */

export const LOD_NAMES = ['close', 'near', 'mid', 'far'] as const;
export type LodName = (typeof LOD_NAMES)[number];

/** Chebyshev squares from the party, same cuts as proto3d `monsterLodName`. */
export function monsterLodName(dist: number, hasClose = true): LodName {
  if (dist <= 1) return hasClose ? 'close' : 'near';
  if (dist === 2) return 'near';
  if (dist === 3) return 'mid';
  return 'far';
}

/** Visible height is `worldHeight` walls; width follows that frame's pixel ratio. */
export function quadForWorldHeight(
  worldHeight: number,
  wallSize: number,
  imageW: number,
  imageH: number
): { w: number; h: number } {
  const h = worldHeight * wallSize;
  const aspect = imageH > 0 ? imageW / imageH : 1;
  return { w: h * aspect, h };
}

export function squaresFromWorldDist(distM: number, cell: number): number {
  return Math.max(1, Math.min(4, Math.round(distM / cell)));
}
