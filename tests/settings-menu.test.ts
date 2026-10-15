import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryText } from '../src/proto3d/i18n';
import { BACKDROP_CLOSE_GUARD_MS, SettingsMenu } from '../src/proto3d/settings-menu';

type Listener = (e: FakeEvent) => void;

interface FakeEvent {
  type: string;
  target: FakeEl | null;
  isPrimary: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

class FakeEl {
  id: string;
  dataset: Record<string, string> = {};
  className = '';
  hidden = false;
  textContent = '';
  private listeners = new Map<string, Listener[]>();
  classList = {
    add: (name: string) => {
      if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim();
    },
    remove: (name: string) => {
      this.className = this.className
        .split(/\s+/)
        .filter((part) => part && part !== name)
        .join(' ');
    },
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.contains(name);
      if (on) this.classList.add(name);
      else this.classList.remove(name);
      return on;
    }
  };

  constructor(id: string) {
    this.id = id;
  }

  addEventListener(type: string, fn: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  setAttribute(name: string, _value: string) {
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name: string) {
    if (name === 'hidden') this.hidden = false;
  }

  dispatch(type: string, extra: Partial<FakeEvent> = {}): FakeEvent {
    const event: FakeEvent = {
      type,
      target: extra.target ?? this,
      isPrimary: extra.isPrimary ?? true,
      preventDefault: extra.preventDefault ?? (() => {}),
      stopPropagation: extra.stopPropagation ?? (() => {})
    };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
}

function stubDom() {
  const nodes = new Map<string, FakeEl>();
  const add = (id: string) => {
    const el = new FakeEl(id);
    nodes.set(id, el);
    return el;
  };
  const overlay = add('settings-overlay');
  add('settings-title');
  add('settings-layout-label');
  add('settings-layout-hint');
  add('btn-layout-framed');
  add('btn-layout-edge');
  add('btn-settings-close');
  const menuBtn = add('btn-menu');
  vi.stubGlobal('document', {
    getElementById: (id: string) => nodes.get(id) ?? null,
    body: { classList: { add: () => {}, remove: () => {} } }
  });
  return { overlay, menuBtn };
}

function wireMenuButton(btn: FakeEl, onTap: () => void) {
  btn.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    onTap();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('settings menu touch open', () => {
  it('stays open after pointerdown/up plus a follow-up backdrop click', () => {
    const { overlay, menuBtn } = stubDom();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const menu = new SettingsMenu({ uiText: () => '' } as unknown as StoryText, {
      getLayout: () => 'framed',
      setLayout: () => {},
      playUi: () => {}
    });
    menu.mount();
    wireMenuButton(menuBtn, () => menu.toggle());

    menuBtn.dispatch('pointerdown');
    menuBtn.dispatch('pointerup');
    expect(menu.open, 'pointerup opens the menu').toBe(true);

    const ghost = overlay.dispatch('click', { target: overlay });
    expect(menu.open, 'synthetic click on the dark backdrop must not close').toBe(true);
    expect(overlay.classList.contains('show')).toBe(true);

    now.mockReturnValue(1000 + BACKDROP_CLOSE_GUARD_MS + 1);
    overlay.dispatch('click', { target: overlay });
    expect(menu.open, 'a later backdrop tap still closes').toBe(false);
    expect(ghost.preventDefault).toBeTypeOf('function');
  });

  it('does not toggle closed if the follow-up click stays on the menu button', () => {
    const { menuBtn } = stubDom();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const menu = new SettingsMenu({ uiText: () => '' } as unknown as StoryText, {
      getLayout: () => 'framed',
      setLayout: () => {},
      playUi: () => {}
    });
    menu.mount();
    wireMenuButton(menuBtn, () => menu.toggle());

    menuBtn.dispatch('pointerdown');
    menuBtn.dispatch('pointerup');
    menuBtn.dispatch('click');
    expect(menu.open).toBe(true);
  });
});
