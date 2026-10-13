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

export class BarkDirector {
  private lastLineId: string | null = null;
  private lastBarkEndMs = Number.NEGATIVE_INFINITY;
  private lastAnyBarkMs = Number.NEGATIVE_INFINITY;
  private lastFlavourMs = Number.NEGATIVE_INFINITY;
  private usedFlavour = new Set<string>();
  private playedOnce = new Set<string>();

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
    this.usedFlavour.clear();
    this.playedOnce.clear();
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
    if (!ctx.skipRateLimits && now < this.lastBarkEndMs + minGapMs) return null;

    if (!ctx.skipRateLimits && tier === 'flavour') {
      if (now - this.lastAnyBarkMs < this.rules.flavour_gap_s * 1000) return null;
      if (now - this.lastFlavourMs < this.rules.flavour_min_interval_s * 1000) return null;
    }

    let candidates = pool;
    if (tier === 'flavour' && REPEATING_FLAVOUR.has(trigger)) {
      const unused = pool.filter((l) => !this.usedFlavour.has(lineId(l)));
      if (!unused.length) return null;
      candidates = unused;
    } else if (tier !== 'flavour') {
      const fresh = pool.filter((l) => !this.playedOnce.has(lineId(l)));
      if (!fresh.length) return null;
      candidates = fresh;
    }

    const notLast = candidates.filter((l) => lineId(l) !== this.lastLineId);
    const pickFrom = notLast.length ? notLast : candidates;
    const chosen = pickRandom(pickFrom, this.rng);

    const id = lineId(chosen);
    this.lastLineId = id;
    this.lastAnyBarkMs = now;
    const durationMs = 1500 + chosen.text.length * 40 + (chosen.listener ? 800 : 0);
    this.lastBarkEndMs = now + durationMs;
    if (tier === 'flavour') {
      this.lastFlavourMs = now;
      this.usedFlavour.add(id);
    } else {
      this.playedOnce.add(id);
    }
    return chosen;
  }
}

export function asHeroId(speaker: string): HeroId {
  return (PARTY.has(speaker) ? speaker : 'brannoc') as HeroId;
}
