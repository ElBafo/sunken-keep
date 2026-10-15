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
  private closeBtn: HTMLButtonElement | null = null;
  private story: StoryText;
  private getLayout: () => LayoutMode;
  private setLayout: (mode: LayoutMode) => void;
  private playUi: (name: string) => void;

  constructor(
    story: StoryText,
    hooks: {
      getLayout: () => LayoutMode;
      setLayout: (mode: LayoutMode) => void;
      playUi: (name: string) => void;
    }
  ) {
    this.story = story;
    this.getLayout = hooks.getLayout;
    this.setLayout = hooks.setLayout;
    this.playUi = hooks.playUi;
  }

  mount() {
    this.host = document.getElementById('settings-overlay');
    this.titleEl = document.getElementById('settings-title');
    this.labelEl = document.getElementById('settings-layout-label');
    this.hintEl = document.getElementById('settings-layout-hint');
    this.framedBtn = document.getElementById('btn-layout-framed') as HTMLButtonElement | null;
    this.edgeBtn = document.getElementById('btn-layout-edge') as HTMLButtonElement | null;
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
  }

  private refreshChoice() {
    const mode = this.getLayout();
    this.framedBtn?.classList.toggle('selected', mode === 'framed');
    this.edgeBtn?.classList.toggle('selected', mode === 'edge');
    this.framedBtn?.setAttribute('aria-pressed', mode === 'framed' ? 'true' : 'false');
    this.edgeBtn?.setAttribute('aria-pressed', mode === 'edge' ? 'true' : 'false');
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
