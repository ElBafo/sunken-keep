import { OIL_FLASK, OIL_MAX } from './constants';

export const OIL_FLASK_GLUGS = [0.051, 0.351] as const;
export const OIL_FLASK_FADE_AT = 0.28;
export const OIL_FLASK_FADE_SEC = 0.05;

export type OilFlaskPlan =
  | { kind: 'full' }
  | { kind: 'use'; from: number; to: number; glugs: number[]; fadeAt: number | null };

/** How a flask fills the lantern. Extra bars above OIL_MAX are lost. */
export function oilFlaskPlan(oil: number, max = OIL_MAX, flask = OIL_FLASK): OilFlaskPlan {
  if (oil >= max) return { kind: 'full' };
  const to = Math.min(max, oil + flask);
  const needed = to - oil;
  const glugs = OIL_FLASK_GLUGS.slice(0, needed);
  const fadeAt = needed < OIL_FLASK_GLUGS.length ? OIL_FLASK_FADE_AT : null;
  return { kind: 'use', from: oil, to, glugs, fadeAt };
}
