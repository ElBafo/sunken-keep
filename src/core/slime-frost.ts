export const SLIME_FROST_RESIST_FLAG = 'slime_frost_resist_seen';

export function isSlimeKind(kind: string | undefined): boolean {
  return kind === 'slime' || kind === 'slime_small';
}

/** First frost resist this run. Flag is stored with the other save flags. */
export function takeSlimeFrostBark(flags: Set<string>): boolean {
  if (flags.has(SLIME_FROST_RESIST_FLAG)) return false;
  flags.add(SLIME_FROST_RESIST_FLAG);
  return true;
}

/**
 * Dedicated frost-flash art for that kind’s idle frame: `<idle frame>_frost`.
 * slime_small uses its own names (not a scaled slime _frost). Art ships later.
 */
export function slimeFrostFramePath(kind: string, lod: string, idleIndex = 1): string {
  const idleFrame = `${kind}_idle_${idleIndex}_${lod}`;
  return `art/dungeon/monsters_v2/${idleFrame}_frost.png`;
}
