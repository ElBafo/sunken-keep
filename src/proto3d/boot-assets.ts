import { audioStemPath, titleMenuStems } from './audio-groups';
import type { Locale } from './i18n';

/** Menu bed + the two title-button voices. Loaded with the title, not the dungeon. */
export const TITLE_MENU_AUDIO: ReadonlyArray<readonly [string, string]> = titleMenuStems().map(
  (stem) => [stem.startsWith('sfx_') ? stem.slice(4) : stem === 'music_menu_loop' ? 'menu' : stem, audioStemPath(stem)] as const
);

export interface TitleEssentialLayout {
  bg: string;
  logo: string;
  buttons: { normal: string; pressed: string; dim: string };
}

/** Title images needed before the first tap: bg, current-language logo, button frames, 5×7 font. */
export function titleEssentialImageKeys(locale: Locale, layout: TitleEssentialLayout): string[] {
  const logo = locale === 'el' ? 'title_logo_el.png' : layout.logo;
  return [layout.bg, logo, layout.buttons.normal, layout.buttons.pressed, layout.buttons.dim, 'font_5x7.png'];
}

/**
 * Every asset request that must finish before the title can be tapped.
 * Story JSON is required for Loading / Tap to start (no hardcoded copy).
 */
export function titleBootRelPaths(locale: Locale = 'en'): string[] {
  const logo = locale === 'el' ? 'art/ui/title/title_logo_el.png' : 'art/ui/title/title_logo.png';
  const story =
    locale === 'el'
      ? [
          'story/el/ui_text.el.json',
          'story/el/title_text.el.json',
          'story/el/names.el.json',
          'story/el/note_lampkeeper.el.json',
          'story/el/log.el.json',
          'story/el/barks.el.json'
        ]
      : [
          'story/ui_text.json',
          'story/title_text.json',
          'story/names.json',
          'story/note_lampkeeper.json',
          'log.json',
          'barks.json'
        ];
  return [
    ...story,
    'art/ui/title/title.json',
    'art/ui/title/title_bg.png',
    logo,
    'art/ui/title/btn_normal.png',
    'art/ui/title/btn_pressed.png',
    'art/ui/title/btn_dim.png',
    'art/font/font_5x7.png',
    'art/font/font_5x7.json',
    ...TITLE_MENU_AUDIO.map(([, path]) => path)
  ];
}
