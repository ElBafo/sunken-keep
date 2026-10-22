import type { Scene } from 'three';
import { floor1 as rawFloor1 } from '../../public/levels/floor1';
import { fetchJsonCached } from '../proto3d/asset-cache';
import { AudioManager } from '../proto3d/audio';
import { FIRST_FIGHT_PRIORITY_STEMS } from '../proto3d/floor1-sounds';
import {
  asHeroId,
  BarkDirector,
  barkDurationMs,
  DEFAULT_BARK_RULES,
  type BarkLine,
  type BarkPartyMember,
  type BarkRules
} from '../proto3d/bark-picker';
import { SpeechBubble } from '../proto3d/bubble';
import { enterPlayFromIntro, mountIntroSkip, type IntroSkipHandle } from '../proto3d/intro-skip';
import { IntroPlayer } from '../proto3d/intro';
import { resolveLocale, StoryText, type Locale } from '../proto3d/i18n';
import { StoryProgress } from '../proto3d/story-progress';
import { TitleScreen, type TitleAction } from '../proto3d/title';
import type { FloorData } from '../proto3d/types';
import { CELL } from './constants';
import { floor1Sconces } from './fixtures';
import { floor1Map, tileAt } from './layout';
import type { HudHeroId } from './portrait-layout';
import type { QualityLevel } from './lights';

export type GameplayPhase = 'boot' | 'tap' | 'title' | 'intro' | 'play';

export type GameplayFlags = {
  /** `?test=1` without `?title=1` — skip tap/title/intro so existing floor tests stay playable. */
  skipChrome: boolean;
  /** `?title=1` — Classic title after the first tap; New Game starts the intro. */
  showTitle: boolean;
};

export type GameplayHooks = {
  pushLog: (text: string) => void;
  setSpeaking: (id: HudHeroId | null) => void;
  party: () => BarkPartyMember[];
  oil: () => number;
};

export function parseGameplayFlags(search: string): GameplayFlags {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const test = q.get('test') === '1';
  const title = q.get('title') === '1';
  return {
    skipChrome: test && !title,
    showTitle: title
  };
}

export function protoAudioQuality(quality: QualityLevel): 'high' | 'low' {
  return quality === 'max' ? 'high' : 'low';
}

export function floor1BarkAt(x: number, y: number): string | undefined {
  return tileAt(floor1Map, x, y)?.bark;
}

/** Four party hurt clips — decoded in the first-fight burst, played from `noteHero`. */
export const HERO_HURT_STEMS = FIRST_FIGHT_PRIORITY_STEMS.filter((stem) => stem.includes('_hurt_'));

function tapEl(): HTMLElement | null {
  return document.getElementById('tap-to-start');
}

function tapText(): HTMLElement | null {
  return document.getElementById('tap-to-start-text');
}

export class Floor1Gameplay {
  readonly story = new StoryText();
  readonly progress = new StoryProgress();
  readonly director = new BarkDirector();
  audio: AudioManager;
  intro: IntroPlayer | null = null;
  title: TitleScreen | null = null;
  bubble: SpeechBubble | null = null;
  phase: GameplayPhase = 'boot';
  audioUnlocked = false;
  lastBark: BarkLine | null = null;
  lastBarkTrigger: string | null = null;
  private hooks: GameplayHooks | null = null;
  private flags: GameplayFlags;
  private introSkip: IntroSkipHandle | null = null;
  private playStarted = false;
  private pendingTap = false;
  private scene: Scene | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHp: Record<string, { hp: number; downed: boolean }> = {};
  private firedCells = new Set<string>();
  private storyFlags = new Set<string>();

  constructor(search: string, quality: QualityLevel) {
    this.flags = parseGameplayFlags(search);
    this.audio = new AudioManager(protoAudioQuality(quality));
  }

  allowsInput(): boolean {
    return this.phase === 'play';
  }

  introVisible(): boolean {
    return !!document.getElementById('intro-overlay')?.classList.contains('show');
  }

  titleVisible(): boolean {
    return !!document.getElementById('title-overlay')?.classList.contains('show');
  }

  async loadStory(search: string): Promise<void> {
    const locale = resolveLocale(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search));
    document.documentElement.lang = locale;
    const base = import.meta.env.BASE_URL;
    await Promise.all([this.story.load(locale), this.progress.load(base), this.loadBarkRules(base)]);
    this.setTapStatus('loading');
  }

  attach(scene: Scene): void {
    this.scene = scene;
    this.audio.attach(scene);
  }

  mountChrome(): void {
    const introCanvas = document.getElementById('intro-canvas') as HTMLCanvasElement | null;
    const titleCanvas = document.getElementById('title-canvas') as HTMLCanvasElement | null;
    const bubbleCanvas = document.getElementById('speech-bubble') as HTMLCanvasElement | null;
    if (bubbleCanvas) this.bubble = new SpeechBubble(bubbleCanvas);
    if (introCanvas) {
      this.intro = new IntroPlayer(introCanvas, this.story);
      this.intro.setTimeSource(() => this.audio.introCurrentTime());
      this.intro.setAudioState(() => this.audio.introAudioState());
      this.intro.setOnFinished(() => this.skipIntro());
      const overlay = document.getElementById('intro-overlay');
      if (overlay) {
        this.introSkip = mountIntroSkip({
          overlay,
          story: this.story,
          onSkip: () => this.skipIntro()
        });
        this.introSkip.hide();
      }
    }
    if (titleCanvas) {
      this.title = new TitleScreen(titleCanvas, this.story, (action) => this.handleTitleAction(action));
    }
    this.wireTap();
  }

  async start(hooks: GameplayHooks): Promise<void> {
    this.hooks = hooks;
    for (const hero of hooks.party()) {
      this.lastHp[hero.id] = { hp: hero.hp ?? 1, downed: !!hero.downed };
    }
    this.mountChrome();
    const scene = this.scene;
    if (scene) void this.audio.loadBeforePlaySounds(scene);
    void this.audio.loadIntroMusic();
    if (this.flags.showTitle) void this.title?.loadEssential();
    if (this.flags.skipChrome) {
      this.hideTap();
      this.beginPlay();
      return;
    }
    if (this.flags.showTitle) {
      this.phase = 'tap';
      this.showTap('tap_to_start');
      if (this.pendingTap) this.consumeTitleTap();
      return;
    }
    await this.openIntro();
  }

  unlock(): void {
    this.audio.unlock();
    this.audioUnlocked = true;
  }

  skipIntro(): void {
    this.unlock();
    this.intro?.skip();
    enterPlayFromIntro({
      hideSkip: () => this.introSkip?.hide(),
      introOverlay: document.getElementById('intro-overlay'),
      tapToStart: tapEl(),
      alreadyPlaying: this.phase === 'play' || this.playStarted,
      beginPlay: () => this.beginPlay()
    });
  }

  speakBark(trigger: string, forcedSpeaker?: HudHeroId): boolean {
    if (!this.hooks) return false;
    const picked = this.director.pick(trigger, this.story.barksFor(trigger), {
      nowMs: performance.now(),
      party: this.hooks.party(),
      flags: this.storyFlags,
      act: 1,
      forcedSpeaker,
      skipRateLimits: !!forcedSpeaker
    });
    if (!picked) return false;
    this.lastBarkTrigger = trigger;
    return this.deliverBark(picked);
  }

  onStep(x: number, y: number): void {
    if (this.phase !== 'play') return;
    const tile = tileAt(floor1Map, x, y);
    if (!tile) return;
    if (tile.deepWater) {
      this.audio.playStep('step_water_deep');
      if (this.progress.fire('water_deep')) this.pushStoryLog('water_deep');
      this.speakBark('deep_water');
    } else if (tile.shallowWater) {
      this.audio.playStep('step_water_shallow');
      if (this.progress.fire('water_shallow')) this.pushStoryLog('water_shallow');
    } else {
      this.audio.playStep('step');
    }
    this.fireTileBark(x, y);
  }

  onSecretOpened(): void {
    if (this.progress.fire('secret_found')) this.pushStoryLog('secret_found');
    this.speakBark('secret_wall');
  }

  noteHero(id: HudHeroId, hp: number, downed: boolean): void {
    const prev = this.lastHp[id] ?? { hp, downed: false };
    if (downed && !prev.downed) this.audio.playHeroDown(id);
    else if (hp < prev.hp) this.audio.playHeroHurt(id, performance.now() / 1000);
    this.lastHp[id] = { hp, downed };
  }

  update(now: number, gridX: number, gridY: number, dir: number): void {
    this.audio.updateListener(gridX, gridY, dir);
    this.audio.update(now, gridX * CELL, gridY * CELL);
    if (this.phase === 'play') this.flushBarks(now);
  }

  storyLog(key: string): string {
    return this.story.log(key);
  }

  private async loadBarkRules(base: string): Promise<void> {
    try {
      const raw = await fetchJsonCached<Partial<BarkRules>>(`${base}bark_rules.json`);
      this.director.setRules({
        flavour_gap_s: raw.flavour_gap_s ?? DEFAULT_BARK_RULES.flavour_gap_s,
        flavour_min_interval_s: raw.flavour_min_interval_s ?? DEFAULT_BARK_RULES.flavour_min_interval_s,
        min_gap_s: raw.min_gap_s ?? DEFAULT_BARK_RULES.min_gap_s
      });
    } catch {
      this.director.setRules(DEFAULT_BARK_RULES);
    }
  }

  private setTapStatus(kind: 'loading' | 'tap_to_start'): void {
    const el = tapText();
    if (el) el.textContent = this.story.uiText(kind === 'loading' ? 'status.loading' : 'tap_to_start');
  }

  private showTap(kind: 'loading' | 'tap_to_start'): void {
    this.setTapStatus(kind);
    tapEl()?.classList.remove('hidden');
  }

  private hideTap(): void {
    tapEl()?.classList.add('hidden');
  }

  private wireTap(): void {
    const tap = tapEl();
    const onTap = () => {
      this.unlock();
      const active = !!tap && !tap.classList.contains('hidden');
      if (this.phase === 'intro') {
        this.audio.crossfadeToIntro();
        return;
      }
      if (!active) return;
      if (this.flags.showTitle) {
        if (!this.title?.essentialReady) {
          this.pendingTap = true;
          tap.classList.add('feedback');
          window.setTimeout(() => tap.classList.remove('feedback'), 180);
          return;
        }
        this.consumeTitleTap();
        return;
      }
      void this.openIntro();
    };
    tap?.addEventListener('pointerdown', onTap);
    tap?.addEventListener('pointerup', onTap);
    tap?.addEventListener('click', onTap);
    tap?.addEventListener('touchstart', onTap, { passive: true });
    const intro = document.getElementById('intro-overlay');
    intro?.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('#intro-skip')) return;
        this.unlock();
        if (this.phase === 'intro') this.audio.crossfadeToIntro();
      },
      true
    );
  }

  private consumeTitleTap(): void {
    this.pendingTap = false;
    this.hideTap();
    this.unlock();
    try {
      this.audio.playMenu();
    } catch {
      // Host audio can refuse playback after the overlay is already gone.
    }
    this.phase = 'title';
    this.title?.show('title');
  }

  private handleTitleAction(action: TitleAction): void {
    if (action.type === 'toast' || action.type === 'language') {
      this.audio.playUi('ui_button_denied');
      if (action.type === 'toast') this.showTitleToast(action.text);
      else void this.setLocale(action.locale);
      return;
    }
    this.audio.playUi('ui_button');
    if (action.type === 'new_game') {
      this.title?.hide();
      this.audio.markPlayStarted();
      void this.openIntro();
      return;
    }
    if (action.type === 'continue' || action.type === 'load' || action.type === 'open_load' || action.type === 'save') {
      this.showTitleToast(this.story.uiText('status.no_saves'));
    }
  }

  private showTitleToast(text: string): void {
    const el = document.getElementById('title-toast');
    if (!el) {
      this.hooks?.pushLog(text);
      return;
    }
    el.textContent = text;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 1600);
  }

  private async setLocale(locale: Locale): Promise<void> {
    await this.story.load(locale);
    document.documentElement.lang = locale;
    if (this.title) this.title.story = this.story;
    this.intro?.applyLocale();
    this.introSkip?.refresh();
    await this.title?.ensureLogo();
    this.title?.refreshHint();
    this.title?.layoutButtons();
    this.setTapStatus(this.phase === 'tap' ? 'tap_to_start' : 'loading');
  }

  private async openIntro(): Promise<void> {
    if (this.phase === 'intro' || this.phase === 'play') return;
    this.hideTap();
    const overlay = document.getElementById('intro-overlay');
    if (!overlay || !this.intro) {
      this.beginPlay();
      return;
    }
    this.phase = 'intro';
    this.intro.preloadShot1();
    await this.intro.whenShot1();
    this.intro.setNeedShot((waiting) => {
      if (this.phase !== 'intro') return;
      if (waiting) this.showTap('loading');
      else this.hideTap();
    });
    overlay.classList.add('show');
    this.introSkip?.refresh();
    this.introSkip?.show();
    this.intro.start();
    if (this.audioUnlocked) this.audio.crossfadeToIntro();
  }

  private beginPlay(): void {
    if (this.playStarted) return;
    this.playStarted = true;
    this.phase = 'play';
    this.hideTap();
    document.getElementById('intro-overlay')?.classList.remove('show');
    this.introSkip?.hide();
    this.title?.hide();
    this.unlock();
    this.progress.startNewGame();
    this.director.reset();
    this.audio.markPlayStarted();
    this.audio.armFirstFightCap();
    void this.audio.startPlayStreaming();
    this.audio.crossfadeToAct1();
    if (this.progress.fire('enter_floor1')) this.pushStoryLog('enter_floor1');
    this.progress.fire('f1_start');
    this.startFloorAudio();
  }

  private startFloorAudio(): void {
    const scene = this.scene;
    const oil = (this.hooks?.oil() ?? 2) > 0;
    try {
      if (scene) {
        this.audio.attachWaterPools(scene, rawFloor1 as FloorData);
        for (const sconce of floor1Sconces) {
          if (sconce.lit && !sconce.capped) this.audio.startTorchLoop(sconce);
        }
      }
      this.audio.startFloorLoops(oil);
    } catch (err) {
      console.warn('Audio init failed', err);
      this.audio.startLanternLoop(oil);
    }
  }

  private pushStoryLog(key: string): void {
    const text = this.story.log(key);
    if (!text) return;
    this.hooks?.pushLog(text);
    if (!this.story.logIsSilent(key)) this.audio.playUi('ui_log_line');
  }

  private fireTileBark(x: number, y: number): void {
    const bark = tileAt(floor1Map, x, y)?.bark;
    if (!bark) return;
    const key = `bark:${bark}`;
    if (this.firedCells.has(key) || !this.progress.fire(bark)) return;
    if (this.speakBark(bark)) this.firedCells.add(key);
  }

  private flushBarks(nowMs: number): void {
    const picked = this.director.flush(nowMs);
    if (picked) this.deliverBark(picked);
  }

  private deliverBark(picked: BarkLine): boolean {
    const speaker = asHeroId(picked.speaker);
    const name = this.story.speakerName(picked.speaker);
    const line = `${name}: ${picked.text}`;
    this.lastBark = picked;
    this.hooks?.pushLog(line);
    this.hooks?.setSpeaking(speaker);
    if (this.speakTimer) clearTimeout(this.speakTimer);
    this.speakTimer = setTimeout(() => this.hooks?.setSpeaking(null), barkDurationMs(picked));
    void this.bubble?.load().then(() => this.bubble?.show(picked.text, speaker, name));
    this.audio.playBarkVoice(picked.speaker);
    return true;
  }
}
