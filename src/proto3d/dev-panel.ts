import {
  COMPARE_PARTY,
  CYCLE_HOLD_MS,
  cycleCombos,
  cycleTable,
  DEV_LIGHT_MODES,
  DEV_RES_MODES,
  type DevDist,
  type DevEnemy,
  type DevLightMode,
  type DevResMode,
  type DevSnapshot,
  frameWindowStats,
  pushTimedSample,
  snapshotSlug,
  type TimedSample
} from './dev-opt-in';

export type DevHost = {
  getRes: () => DevResMode;
  setRes: (mode: DevResMode) => void;
  pixelSize: () => { w: number; h: number };
  getLight: () => DevLightMode;
  setLight: (mode: DevLightMode) => Promise<void>;
  getVoxel: () => boolean;
  setVoxel: (on: boolean) => Promise<void>;
  getCompare: () => boolean;
  setCompare: (on: boolean) => Promise<void>;
  getEnemy: () => DevEnemy;
  setEnemy: (enemy: DevEnemy) => Promise<void>;
  getDist: () => DevDist;
  setDist: (dist: DevDist) => Promise<void>;
  captureViewPng: () => string;
  fps: () => number;
  draws: () => number;
  palette: () => boolean;
};

const STYLE = `
#dev-stats {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 9000;
  max-width: min(240px, 58vw);
  background: rgba(8, 6, 4, 0.78);
  color: #e8d8a0;
  font: 11px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  border: 1px solid #6a5430;
  border-radius: 4px;
  padding: 5px 7px;
  pointer-events: none;
  white-space: pre-wrap;
}
#dev-panel {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 9000;
  width: min(250px, calc(100vw - 16px));
  max-height: 42dvh;
  overflow: auto;
  background: rgba(8, 6, 4, 0.88);
  color: #e8d8a0;
  font: 12px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  border: 1px solid #6a5430;
  border-radius: 6px;
  padding: 8px;
  pointer-events: auto;
  touch-action: manipulation;
}
#dev-panel.collapsed {
  width: auto;
  max-width: 42%;
  padding: 6px 8px;
}
#dev-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: #f0c060;
  letter-spacing: 0.04em;
}
#dev-panel.collapsed header { margin-bottom: 0; }
#dev-panel .row { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; align-items: center; }
#dev-panel .lab { min-width: 46px; color: #b8a878; }
#dev-panel button {
  background: #2a2014;
  color: #e8d8a0;
  border: 1px solid #6a5430;
  border-radius: 4px;
  padding: 4px 7px;
  font: inherit;
}
#dev-panel button.sel { background: #6a3c14; border-color: #d4a04a; color: #fff3c8; }
#dev-panel textarea {
  width: 100%;
  min-height: 56px;
  margin-top: 6px;
  background: #140f0a;
  color: #d8ccb0;
  border: 1px solid #4a3c28;
  font: 10px/1.3 ui-monospace, monospace;
}
#dev-panel .hint { color: #8a7c62; margin-top: 4px; }
`;

function btn(label: string, id?: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  if (id) el.id = id;
  return el;
}

function download(name: string, href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function sidecarHref(meta: DevSnapshot): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(meta, null, 2))}`;
}

export class DevPanel {
  host: DevHost;
  root: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private tableEl: HTMLTextAreaElement;
  private samples: TimedSample[] = [];
  private cycling = false;
  private cycleRows: Array<DevSnapshot & { holdMs: number }> = [];
  lastCapture: { slug: string; png: string; meta: DevSnapshot } | null = null;

  constructor(host: DevHost) {
    this.host = host;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.statsEl = document.createElement('div');
    this.statsEl.id = 'dev-stats';
    document.body.appendChild(this.statsEl);

    this.root = document.createElement('div');
    this.root.id = 'dev-panel';
    this.root.classList.add('collapsed');
    this.root.innerHTML = `<header><span id="dev-title">DEV</span></header>`;
    const min = btn('+', 'dev-collapse');
    min.setAttribute('aria-expanded', 'false');
    this.root.querySelector('header')!.appendChild(min);
    min.addEventListener('click', () => {
      this.root.classList.toggle('collapsed');
      const collapsed = this.root.classList.contains('collapsed');
      const body = this.root.querySelector('.dev-body') as HTMLElement | null;
      if (body) body.hidden = collapsed;
      min.textContent = collapsed ? '+' : '–';
      min.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    const body = document.createElement('div');
    body.className = 'dev-body';
    body.hidden = true;

    body.appendChild(this.modeRow('Res', DEV_RES_MODES, () => this.host.getRes(), (v) => this.host.setRes(v), String));
    body.appendChild(
      this.modeRow(
        'Light',
        DEV_LIGHT_MODES,
        () => this.host.getLight(),
        (v) => void this.host.setLight(v),
        (v) => (v === 'lab' ? 'Lab' : 'Classic')
      )
    );
    body.appendChild(this.toggleRow('3D walls', () => this.host.getVoxel(), (on) => void this.host.setVoxel(on)));
    body.appendChild(this.toggleRow('Compare', () => this.host.getCompare(), (on) => void this.host.setCompare(on)));
    body.appendChild(
      this.modeRow(
        'Enemy',
        ['slime', 'ooze'] as const,
        () => this.host.getEnemy(),
        (v) => void this.host.setEnemy(v),
        (v) => (v === 'ooze' ? 'Ooze' : 'Slime')
      )
    );
    body.appendChild(
      this.modeRow(
        'Dist',
        [1, 2] as const,
        () => this.host.getDist(),
        (v) => void this.host.setDist(v),
        (v) => `${v} sq`
      )
    );

    const actions = document.createElement('div');
    actions.className = 'row';
    const cap = btn('Capture', 'dev-capture');
    const cycle = btn('Cycle all', 'dev-cycle');
    const copy = btn('Copy table', 'dev-copy');
    cap.addEventListener('click', () => this.capture());
    cycle.addEventListener('click', () => void this.cycleAll());
    copy.addEventListener('click', () => void navigator.clipboard?.writeText(this.tableEl.value));
    actions.append(cap, cycle, copy);
    body.appendChild(actions);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = `Pose ${COMPARE_PARTY.x},${COMPARE_PARTY.y} N · HUD stays native`;
    body.appendChild(hint);

    this.tableEl = document.createElement('textarea');
    this.tableEl.id = 'dev-table';
    this.tableEl.readOnly = true;
    this.tableEl.placeholder = 'Cycle all writes a copyable table here.';
    body.appendChild(this.tableEl);

    this.root.appendChild(body);
    document.body.appendChild(this.root);
    this.refresh();
  }

  noteFrame(now: number, ms: number): void {
    pushTimedSample(this.samples, now, ms);
  }

  refresh(): void {
    const snap = this.snapshot();
    const win = frameWindowStats(this.samples);
    const title = this.root.querySelector('#dev-title');
    if (title) {
      title.textContent = this.root.classList.contains('collapsed')
        ? `DEV · ${snap.res === 'native' ? snap.pixelW : snap.res} · ${snap.fps || '--'}fps`
        : 'DEV · iPhone Air';
    }
    this.statsEl.textContent =
      `${snap.res === 'native' ? `native ${snap.pixelW}` : snap.res}×${snap.pixelH} · ${snap.light}` +
      ` · voxel ${snap.voxel ? 'on' : 'off'} · ${snap.compare ? `${snap.enemy} ${snap.dist}sq` : 'free'}\n` +
      `${snap.fps} fps · avg ${win.avg.toFixed(1)} · p95 ${win.p95.toFixed(1)} ms (5s)` +
      ` · ${snap.draws} draws`;
    for (const row of this.root.querySelectorAll('.row[data-key]')) {
      const key = (row as HTMLElement).dataset.key;
      const selected =
        key === 'Res'
          ? String(this.host.getRes())
          : key === 'Light'
            ? this.host.getLight()
            : key === 'Enemy'
              ? this.host.getEnemy()
              : key === 'Dist'
                ? String(this.host.getDist())
                : key === '3D walls'
                  ? this.host.getVoxel()
                    ? 'On'
                    : 'Off'
                  : key === 'Compare'
                    ? this.host.getCompare()
                      ? 'On'
                      : 'Off'
                    : '';
      row.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.value === String(selected)));
    }
  }

  snapshot(): DevSnapshot {
    const px = this.host.pixelSize();
    const win = frameWindowStats(this.samples);
    return {
      res: this.host.getRes(),
      pixelW: px.w,
      pixelH: px.h,
      light: this.host.getLight(),
      voxel: this.host.getVoxel(),
      enemy: this.host.getEnemy(),
      dist: this.host.getDist(),
      compare: this.host.getCompare(),
      fps: this.host.fps(),
      avg: win.avg,
      p95: win.p95,
      draws: this.host.draws(),
      palette: this.host.palette()
    };
  }

  capture(): { slug: string; png: string; meta: DevSnapshot } {
    const png = this.host.captureViewPng();
    const meta = this.snapshot();
    const slug = snapshotSlug(meta);
    this.lastCapture = { slug, png, meta };
    download(`${slug}.png`, png);
    download(`${slug}.json`, sidecarHref(meta));
    return this.lastCapture;
  }

  async cycleAll(): Promise<string> {
    if (this.cycling) return this.tableEl.value;
    this.cycling = true;
    this.cycleRows = [];
    const prev = {
      res: this.host.getRes(),
      light: this.host.getLight(),
      compare: this.host.getCompare()
    };
    await this.host.setCompare(true);
    for (const combo of cycleCombos()) {
      await this.host.setLight(combo.light);
      this.host.setRes(combo.res);
      this.samples.length = 0;
      this.refresh();
      const t0 = performance.now();
      await wait(CYCLE_HOLD_MS);
      const snap = this.snapshot();
      this.cycleRows.push({ ...snap, holdMs: performance.now() - t0 });
      this.tableEl.value = cycleTable(this.cycleRows);
    }
    this.host.setRes(prev.res);
    await this.host.setLight(prev.light);
    await this.host.setCompare(prev.compare);
    this.cycling = false;
    this.refresh();
    return this.tableEl.value;
  }

  private modeRow<T extends string | number>(
    label: string,
    values: readonly T[],
    get: () => T,
    set: (v: T) => void,
    text: (v: T) => string
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.key = label;
    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = label;
    row.appendChild(lab);
    for (const v of values) {
      const b = btn(text(v));
      b.dataset.value = String(v);
      if (get() === v) b.classList.add('sel');
      b.addEventListener('click', () => set(v));
      row.appendChild(b);
    }
    return row;
  }

  private toggleRow(label: string, get: () => boolean, set: (on: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.key = label;
    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = label;
    row.appendChild(lab);
    for (const [text, on] of [
      ['Off', false],
      ['On', true]
    ] as const) {
      const b = btn(text);
      b.dataset.value = text;
      if (get() === on) b.classList.add('sel');
      b.addEventListener('click', () => set(on));
      row.appendChild(b);
    }
    return row;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mountDevPanel(host: DevHost): Promise<DevPanel> {
  return new DevPanel(host);
}
