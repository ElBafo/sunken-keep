export const INTRO_SKIP_MIN_TAP_PX = 44;

export interface IntroSkipHandle {
  refresh(): void;
  show(): void;
  hide(): void;
  button(): HTMLButtonElement | null;
}

/** Skip control on the intro overlay. Tapping the shot itself does nothing. */
export function mountIntroSkip(opts: {
  overlay: HTMLElement;
  story: { uiText(path: string): string };
  onSkip: () => void;
}): IntroSkipHandle {
  const stage = opts.overlay.querySelector('#intro-stage') ?? opts.overlay;
  let btn = stage.querySelector('#intro-skip') as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'intro-skip';
    btn.type = 'button';
    btn.className = 'intro-skip';
    btn.style.minWidth = `${INTRO_SKIP_MIN_TAP_PX}px`;
    btn.style.minHeight = `${INTRO_SKIP_MIN_TAP_PX}px`;
    stage.appendChild(btn);
    const skip = (e: Event) => {
      const pe = e as PointerEvent;
      if (typeof pe.isPrimary === 'boolean' && !pe.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      opts.onSkip();
    };
    btn.addEventListener('pointerup', skip);
    btn.addEventListener('click', skip);
  }
  const refresh = () => {
    btn!.textContent = opts.story.uiText('intro.skip') || 'Skip';
    btn!.setAttribute('aria-label', btn!.textContent);
  };
  refresh();
  btn.hidden = false;
  return {
    refresh,
    show() {
      btn!.hidden = false;
    },
    hide() {
      btn!.hidden = true;
    },
    button: () => btn
  };
}
