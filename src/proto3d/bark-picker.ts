import { HERO_IDS, type HeroId } from '../core/types';

export type BarkTier = 'tutorial' | 'story' | 'flavour';

export interface BarkLine {
  trigger: string;
  speaker: string;
  text: string;
  face?: string;
  listener?: string;
  listenerFace?: string;
  tier?: BarkTier;
  condition?: Record<string, boolean>;
  act?: number;
}

export interface BarkRules {
  flavour_gap_s: number;
  flavour_min_interval_s: number;
  min_gap_s: number;
}

export const DEFAULT_BARK_RULES: BarkRules = {
  flavour_gap_s: 120,
  flavour_min_interval_s: 180,
  min_gap_s: 8
};

/** Repeating flavour pools: random unused line, then stop once spent. */
const REPEATING_FLAVOUR = new Set([
  'loot',
  'idle',
  'low_health',
  'new_monster',
  'secret_wall',
  'deep_water',
  'leech_latch'
]);

const PARTY = new Set<string>(HERO_IDS);

export interface BarkPartyMember {
  id: string;
  downed?: boolean;
  hp?: number;
}

export interface BarkPickContext {
  nowMs: number;
  party: readonly BarkPartyMember[];
  flags: Set<string>;
  act?: number;
  inDialogue?: boolean;
  forcedSpeaker?: string;
  /** Debug / explicit speaker: still never steal another hero's line, but skip flavour gaps. */
  skipRateLimits?: boolean;
}

export function lineId(line: BarkLine): string {
  return `${line.trigger}|${line.speaker}|${line.text}`;
}

export function isAliveInParty(id: string, party: readonly BarkPartyMember[]): boolean {
  if (!PARTY.has(id)) return true;
  const hero = party.find((h) => h.id === id);
  if (!hero) return false;
  if (hero.downed) return false;
  return hero.hp == null || hero.hp > 0;
}

function flagValue(flags: Set<string>, key: string): boolean {
  return flags.has(key) || flags.has(`${key}:true`);
}

function conditionMatches(line: BarkLine, flags: Set<string>): boolean {
  if (!line.condition) return true;
  for (const [key, want] of Object.entries(line.condition)) {
    if (flagValue(flags, key) !== want) return false;
  }
  return true;
}

function magsGoesCold(line: BarkLine, ctx: BarkPickContext): boolean {
  if (line.speaker !== 'mags' || (line.tier ?? 'flavour') !== 'flavour') return false;
  if ((ctx.act ?? 1) < 2) return false;
  if (flagValue(ctx.flags, 'saved_tam')) return false;
  return !line.condition;
}

export function eligibleBarks(lines: readonly BarkLine[], ctx: BarkPickContext): BarkLine[] {
  const act = ctx.act ?? 1;
  return lines.filter((line) => {
    if (!line.text) return false;
    if (line.act != null && act < line.act) return false;
    if (!conditionMatches(line, ctx.flags)) return false;
    if (magsGoesCold(line, ctx)) return false;
    if (ctx.forcedSpeaker && line.speaker !== ctx.forcedSpeaker) return false;
    if (!isAliveInParty(line.speaker, ctx.party)) return false;
    if (line.listener && PARTY.has(line.listener) && !isAliveInParty(line.listener, ctx.party)) return false;
    return true;
  });
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function barkDurationMs(line: BarkLine): number {
  return 1500 + line.text.length * 40 + (line.listener ? 800 : 0);
}

const MAX_STORY_QUEUE = 3;

export class BarkDirector {
  private lastLineId: string | null = null;
  private lastBarkEndMs = Number.NEGATIVE_INFINITY;
  private lastAnyBarkMs = Number.NEGATIVE_INFINITY;
  private lastFlavourMs = Number.NEGATIVE_INFINITY;
  private lastWasStory = false;
  private usedFlavour = new Set<string>();
  private playedOnce = new Set<string>();
  private storyQueue: BarkLine[] = [];

  constructor(
    private rules: BarkRules = DEFAULT_BARK_RULES,
    private rng: () => number = Math.random
  ) {}

  setRules(rules: BarkRules) {
    this.rules = rules;
  }

  reset() {
    this.lastLineId = null;
    this.lastBarkEndMs = Number.NEGATIVE_INFINITY;
    this.lastAnyBarkMs = Number.NEGATIVE_INFINITY;
    this.lastFlavourMs = Number.NEGATIVE_INFINITY;
    this.lastWasStory = false;
    this.usedFlavour.clear();
    this.playedOnce.clear();
    this.clearQueue();
  }

  /** Title / New Game / load leave the moment a queued story bark belonged to. */
  clearQueue() {
    this.storyQueue = [];
  }

  queuedCount(): number {
    return this.storyQueue.length;
  }

  /**
   * Play the next queued story/tutorial bark once the previous line has finished.
   * Story barks bypass min_gap_s; they only wait for the current bark to end.
   */
  flush(nowMs: number): BarkLine | null {
    if (!this.storyQueue.length) return null;
    if (nowMs < this.lastBarkEndMs) return null;
    const next = this.storyQueue.shift()!;
    this.commit(next, nowMs);
    return next;
  }

  pick(trigger: string, lines: readonly BarkLine[], ctx: BarkPickContext): BarkLine | null {
    if (ctx.inDialogue) return null;
    const pool = eligibleBarks(
      lines.filter((l) => l.trigger === trigger),
      ctx
    );
    if (!pool.length) return null;

    const tier = (pool[0].tier ?? 'flavour') as BarkTier;
    const now = ctx.nowMs;
    const minGapMs = this.rules.min_gap_s * 1000;
    const inGap = now < this.lastBarkEndMs + minGapMs;
    const speaking = now < this.lastBarkEndMs;
    const storyHeld = this.storyQueue.length > 0 || (this.lastWasStory && speaking);

    if (tier === 'flavour' && storyHeld) return null;

    if (!ctx.skipRateLimits && tier === 'flavour') {
      if (inGap) return null;
      if (now - this.lastAnyBarkMs < this.rules.flavour_gap_s * 1000) return null;
      if (now - this.lastFlavourMs < this.rules.flavour_min_interval_s * 1000) return null;
    }

    let candidates = pool;
    if (tier === 'flavour' && REPEATING_FLAVOUR.has(trigger)) {
      const unused = pool.filter((l) => !this.usedFlavour.has(lineId(l)));
      if (!unused.length) return null;
      candidates = unused;
    } else if (tier !== 'flavour') {
      const queued = new Set(this.storyQueue.map(lineId));
      const fresh = pool.filter((l) => !this.playedOnce.has(lineId(l)) && !queued.has(lineId(l)));
      if (!fresh.length) return null;
      candidates = fresh;
    }

    const notLast = candidates.filter((l) => lineId(l) !== this.lastLineId);
    const pickFrom = notLast.length ? notLast : candidates;
    const chosen = pickRandom(pickFrom, this.rng);

    if (tier !== 'flavour' && (speaking || this.storyQueue.length > 0)) {
      this.enqueueStory(chosen);
      return null;
    }

    this.commit(chosen, now);
    return chosen;
  }

  private enqueueStory(line: BarkLine) {
    const id = lineId(line);
    if (this.storyQueue.some((q) => lineId(q) === id)) return;
    if (this.storyQueue.length >= MAX_STORY_QUEUE) return;
    this.storyQueue.push(line);
  }

  private commit(chosen: BarkLine, now: number) {
    const id = lineId(chosen);
    const tier = (chosen.tier ?? 'flavour') as BarkTier;
    this.lastLineId = id;
    this.lastAnyBarkMs = now;
    this.lastBarkEndMs = now + barkDurationMs(chosen);
    this.lastWasStory = tier !== 'flavour';
    if (tier === 'flavour') {
      this.lastFlavourMs = now;
      this.usedFlavour.add(id);
    } else {
      this.playedOnce.add(id);
    }
  }
}

export function asHeroId(speaker: string): HeroId {
  return (PARTY.has(speaker) ? speaker : 'brannoc') as HeroId;
}
