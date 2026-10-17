/** Dev-only measurement tools. Tiny, always imported — default path must not load the ooze builder. */

export const DEV_QUERY = 'dev';

export const DEV_RES_MODES = [270, 360, 480, 'native'] as const;
export type DevResMode = (typeof DEV_RES_MODES)[number];

export const DEV_LIGHT_MODES = ['classic', 'lab'] as const;
export type DevLightMode = (typeof DEV_LIGHT_MODES)[number];

export const DEV_RENDER_MODES = ['classic', 'lab'] as const;
export type DevRenderMode = (typeof DEV_RENDER_MODES)[number];

export type DevEnemy = 'slime' | 'ooze';
export type DevDist = 1 | 2;

/** Two-torch north corridor: two empty squares ahead, same viewing angle. */
export const COMPARE_PARTY = { x: 1, y: 7, dir: 0 } as const;

export const CYCLE_HOLD_MS = 5000;
export const FRAME_WINDOW_MS = 5000;

export function devFromSearch(params: URLSearchParams): boolean {
  const v = params.get(DEV_QUERY);
  return v === '1' || v === 'true';
}

export function isDevResMode(value: unknown): value is DevResMode {
  return value === 270 || value === 360 || value === 480 || value === 'native';
}

/** Keep the camera/view aspect; only the 3D buffer width changes. */
export function internalPixelSize(
  mode: DevResMode,
  viewW: number,
  viewH: number,
  nativeW: number
): { w: number; h: number } {
  const aspect = viewW / Math.max(1, viewH);
  const w = mode === 'native' ? Math.max(1, Math.round(nativeW)) : mode;
  const h = Math.max(1, Math.round(w / aspect));
  return { w, h };
}

export function compareEnemyTile(dist: DevDist): { x: number; y: number } {
  const [dx, dy] = (
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ] as const
  )[COMPARE_PARTY.dir];
  return { x: COMPARE_PARTY.x + dx * dist, y: COMPARE_PARTY.y + dy * dist };
}

export function cycleCombos(): Array<{ res: DevResMode; light: DevLightMode }> {
  const out: Array<{ res: DevResMode; light: DevLightMode }> = [];
  for (const res of DEV_RES_MODES) {
    for (const light of DEV_LIGHT_MODES) out.push({ res, light });
  }
  return out;
}

export type TimedSample = { t: number; ms: number };

export function pushTimedSample(samples: TimedSample[], t: number, ms: number, windowMs = FRAME_WINDOW_MS): void {
  if (!(ms > 0) || ms >= 1000) return;
  samples.push({ t, ms });
  const cut = t - windowMs;
  while (samples.length && samples[0].t < cut) samples.shift();
}

export function frameWindowStats(samples: TimedSample[]): { n: number; avg: number; p95: number } {
  if (samples.length === 0) return { n: 0, avg: 0, p95: 0 };
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const sum = ms.reduce((a, b) => a + b, 0);
  return {
    n: ms.length,
    avg: sum / ms.length,
    p95: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]
  };
}

export type DevSnapshot = {
  res: DevResMode;
  pixelW: number;
  pixelH: number;
  light: DevLightMode;
  render?: DevRenderMode;
  heightRelief?: boolean;
  voxel: boolean;
  enemy: DevEnemy;
  dist: DevDist;
  compare: boolean;
  fps: number;
  avg: number;
  p95: number;
  draws: number;
  tris?: number;
  palette: boolean;
};

export function snapshotSlug(s: DevSnapshot): string {
  const res = s.res === 'native' ? `native${s.pixelW}` : String(s.res);
  const vx = s.voxel ? 'vxon' : 'vxoff';
  const en = s.compare ? `${s.enemy}-${s.dist}sq` : 'noenemy';
  const avg = s.avg.toFixed(1).replace('.', 'p');
  const p95 = s.p95.toFixed(1).replace('.', 'p');
  return `sk-${res}x${s.pixelH}-${s.light}-${vx}-${en}-${s.fps}fps-${avg}avg-${p95}p95`;
}

export function cycleTable(rows: Array<DevSnapshot & { holdMs: number }>): string {
  const head = 'res\tlight\tpixels\tfps\tavg_ms\tp95_ms\tdraws\thold_ms';
  const lines = rows.map((r) =>
    [
      r.res === 'native' ? `native ${r.pixelW}` : String(r.res),
      r.light,
      `${r.pixelW}x${r.pixelH}`,
      String(r.fps),
      r.avg.toFixed(2),
      r.p95.toFixed(2),
      String(r.draws),
      String(Math.round(r.holdMs))
    ].join('\t')
  );
  return [head, ...lines].join('\n');
}
