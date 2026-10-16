import type { StoryText } from './i18n';
import type { LayoutMode } from './phone-layout';

/** Ignore backdrop taps that are the browser's synthetic click after a touch open. */
export const BACKDROP_CLOSE_GUARD_MS = 300;

export class SettingsMenu {
  open = false;
  private ignoreBackdropUntil = 0;
  private host: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private framedBtn: HTMLButtonElement | null = null;
  private edgeBtn: HTMLButtonElement | null = null;
  private voxelOnBtn: HTMLButtonElement | null = null;
  private voxelOffBtn: HTMLButtonElement | null = null;
  private voxelLabelEl: HTMLElement | null = null;
  private voxelHintEl: HTMLElement | null = null;
  private labOnBtn: HTMLButtonElement | null = null;
  private labOffBtn: HTMLButtonElement | null = null;
  private labLabelEl: HTMLElement | null = null;
  private labHintEl: HTMLElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private story: StoryText;
  private getLayout: () => LayoutMode;
  private setLayout: (mode: LayoutMode) => void;
  private playUi: (name: string) => void;
  private getVoxel: () => boolean;
  private setVoxel: (on: boolean) => void;
  private getLabLight: () => boolean;
  private setLabLight: (on: boolean) => void;

  constructor(
    story: StoryText,
    hooks: {
      getLayout: () => LayoutMode;
      setLayout: (mode: LayoutMode) => void;
      playUi: (name: string) => void;
      getVoxel?: () => boolean;
      setVoxel?: (on: boolean) => void;
      getLabLight?: () => boolean;
      setLabLight?: (on: boolean) => void;
    }
  ) {
    this.story = story;
    this.getLayout = hooks.getLayout;
    this.setLayout = hooks.setLayout;
    this.playUi = hooks.playUi;
    this.getVoxel = hooks.getVoxel ?? (() => false);
    this.setVoxel = hooks.setVoxel ?? (() => {});
    this.getLabLight = hooks.getLabLight ?? (() => false);
    this.setLabLight = hooks.setLabLight ?? (() => {});
  }

  mount() {
    this.host = document.getElementById('settings-overlay');
    this.titleEl = document.getElementById('settings-title');
    this.labelEl = document.getElementById('settings-layout-label');
    this.hintEl = document.getElementById('settings-layout-hint');
    this.framedBtn = document.getElementById('btn-layout-framed') as HTMLButtonElement | null;
    this.edgeBtn = document.getElementById('btn-layout-edge') as HTMLButtonElement | null;
    this.voxelOnBtn = document.getElementById('btn-voxel-on') as HTMLButtonElement | null;
    this.voxelOffBtn = document.getElementById('btn-voxel-off') as HTMLButtonElement | null;
    this.voxelLabelEl = document.getElementById('settings-voxel-label');
    this.voxelHintEl = document.getElementById('settings-voxel-hint');
    this.labOnBtn = document.getElementById('btn-lab-light-on') as HTMLButtonElement | null;
    this.labOffBtn = document.getElementById('btn-lab-light-off') as HTMLButtonElement | null;
    this.labLabelEl = document.getElementById('settings-lab-light-label');
    this.labHintEl = document.getElementById('settings-lab-light-hint');
    this.closeBtn = document.getElementById('btn-settings-close') as HTMLButtonElement | null;
    if (!this.host || this.host.dataset.bound) return;
    this.host.dataset.bound = '1';
    this.framedBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.choose('framed');
    });
    this.edgeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.choose('edge');
    });
    this.voxelOnBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.chooseVoxel(true);
    });
    this.voxelOffBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.chooseVoxel(false);
    });
    this.labOnBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.chooseLabLight(true);
    });
    this.labOffBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.chooseLabLight(false);
    });
    this.closeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    });
    this.host.addEventListener('click', (e) => this.onBackdropClick(e));
    this.host.addEventListener('pointerup', (e) => this.onBackdropClick(e));
    this.refreshLabels();
    this.refreshChoice();
  }

  refreshLabels() {
    if (this.titleEl) this.titleEl.textContent = this.story.uiText('settings.title') || 'Settings';
    if (this.labelEl) this.labelEl.textContent = this.story.uiText('settings.layout') || 'Layout';
    if (this.hintEl) {
      this.hintEl.textContent = this.story.uiText('settings.layout_hint') || '';
    }
    if (this.framedBtn) {
      this.framedBtn.textContent = this.story.uiText('settings.layout_framed') || 'Framed';
    }
    if (this.edgeBtn) {
      this.edgeBtn.textContent = this.story.uiText('settings.layout_edge') || 'Edge';
    }
    if (this.closeBtn) {
      this.closeBtn.textContent = this.story.uiText('buttons.resume') || this.story.uiText('journal.close') || 'Close';
    }
    if (this.voxelLabelEl) this.voxelLabelEl.textContent = this.story.uiText('settings.voxel') || '3D walls';
    if (this.voxelHintEl) {
      this.voxelHintEl.textContent =
        this.story.uiText('settings.voxel_hint') || 'Stone you can almost touch. Phone may sweat.';
    }
    if (this.voxelOnBtn) this.voxelOnBtn.textContent = this.story.uiText('settings.on') || 'On';
    if (this.voxelOffBtn) this.voxelOffBtn.textContent = this.story.uiText('settings.off') || 'Off';
    if (this.labLabelEl) this.labLabelEl.textContent = this.story.uiText('settings.lab_light') || 'Lighting';
    if (this.labHintEl) {
      this.labHintEl.textContent =
        this.story.uiText('settings.lab_light_hint') ||
        'Lab: warm pools, glossy stone. Classic: the painted look.';
    }
    if (this.labOnBtn) this.labOnBtn.textContent = this.story.uiText('settings.lab_light_lab') || 'Lab';
    if (this.labOffBtn) this.labOffBtn.textContent = this.story.uiText('settings.lab_light_classic') || 'Classic';
    this.refreshChoice();
  }

  private refreshChoice() {
    const mode = this.getLayout();
    this.framedBtn?.classList.toggle('selected', mode === 'framed');
    this.edgeBtn?.classList.toggle('selected', mode === 'edge');
    this.framedBtn?.setAttribute('aria-pressed', mode === 'framed' ? 'true' : 'false');
    this.edgeBtn?.setAttribute('aria-pressed', mode === 'edge' ? 'true' : 'false');
    const voxel = this.getVoxel();
    this.voxelOnBtn?.classList.toggle('selected', voxel);
    this.voxelOffBtn?.classList.toggle('selected', !voxel);
    this.voxelOnBtn?.setAttribute('aria-pressed', voxel ? 'true' : 'false');
    this.voxelOffBtn?.setAttribute('aria-pressed', voxel ? 'false' : 'true');
    const lab = this.getLabLight();
    this.labOnBtn?.classList.toggle('selected', lab);
    this.labOffBtn?.classList.toggle('selected', !lab);
    this.labOnBtn?.setAttribute('aria-pressed', lab ? 'true' : 'false');
    this.labOffBtn?.setAttribute('aria-pressed', lab ? 'false' : 'true');
  }

  private chooseLabLight(on: boolean) {
    if (this.getLabLight() === on) return;
    this.playUi('ui_button');
    this.setLabLight(on);
    this.refreshChoice();
  }

  private chooseVoxel(on: boolean) {
    if (this.getVoxel() === on) return;
    this.playUi('ui_button');
    this.setVoxel(on);
    this.refreshChoice();
  }

  private choose(mode: LayoutMode) {
    if (this.getLayout() === mode) return;
    this.playUi('ui_button');
    this.setLayout(mode);
    this.refreshChoice();
  }

  private onBackdropClick(e: Event) {
    if (e.target !== this.host) return;
    if (performance.now() < this.ignoreBackdropUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.hide();
  }

  show() {
    this.mount();
    this.refreshLabels();
    this.refreshChoice();
    this.open = true;
    this.ignoreBackdropUntil = performance.now() + BACKDROP_CLOSE_GUARD_MS;
    this.host?.removeAttribute('hidden');
    this.host?.classList.add('show');
    document.body.classList.add('settings-open');
    this.playUi('ui_menu_open');
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.host?.classList.remove('show');
    this.host?.setAttribute('hidden', '');
    document.body.classList.remove('settings-open');
    this.playUi('ui_menu_close');
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }
}
