/** Graphics quality. `?fx=0` (and `?quality=low`) select Low for later settings UI. */
export type QualityLevel = 'high' | 'low';

export interface QualityPreset {
  dustCount: number;
  dripSites: number;
  maxActiveDrips: number;
  dripIntervalMin: number;
  dripIntervalMax: number;
  farAudio: boolean;
  /** Cap on simultaneous positional voices; Infinity = all nearby sources. */
  positionalBudget: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    dustCount: 80,
    dripSites: 6,
    maxActiveDrips: 6,
    dripIntervalMin: 800,
    dripIntervalMax: 2600,
    farAudio: true,
    positionalBudget: Infinity
  },
  low: {
    dustCount: 0,
    dripSites: 0,
    maxActiveDrips: 0,
    dripIntervalMin: 1e9,
    dripIntervalMax: 1e9,
    farAudio: true,
    positionalBudget: 3
  }
};

export function qualityFromSearch(params: URLSearchParams): QualityLevel {
  const fx = params.get('fx');
  const q = params.get('quality');
  if (fx === '0' || q === 'low') return 'low';
  return 'high';
}
