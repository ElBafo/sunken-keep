export type SlimePairSlot = 'left' | 'right';
export type SlimePairLod = 'close' | 'near' | 'mid' | 'far';

/** Sideways shift as a fraction of that LOD's own frame width. */
export const SLIME_PAIR_OFFSET_FRAC = 0.55;
/** Second slimeling's 2.5s timer starts this long after the first. */
export const SLIME_SMALL_STAGGER_SEC = 1.25;
/** No two slimeling voices may start closer than this. */
export const SLIME_SMALL_SFX_GAP_MS = 100;
export const SLIME_SMALL_PAN = { left: -0.3, right: 0.3 } as const;
export const SLIME_PAIR_SLIDE_MS = 280;
/** Pixel widths of slime_small idle_1 at each LOD (matches monster_anchor). */
export const SLIME_SMALL_FRAME_W: Record<SlimePairLod, number> = {
  close: 82,
  near: 45,
  mid: 32,
  far: 25
};

export function slimePairShiftPx(lod: SlimePairLod, frameW = SLIME_SMALL_FRAME_W[lod]): number {
  return frameW * SLIME_PAIR_OFFSET_FRAC;
}

export function slimePairSideSign(slot: SlimePairSlot | null | undefined): number {
  if (slot === 'left') return -1;
  if (slot === 'right') return 1;
  return 0;
}

export function slimeSmallPitchRate(semitone: number): number {
  return 2 ** (semitone / 12);
}
