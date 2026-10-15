export const CAVE_IN_CRASH_AT = 1.2;
export const CAVE_IN_TURN_SEC = 0.45;
export const CAVE_IN_SKIP_FADE_SEC = 0.3;
export const CAVE_IN_BARK2_DELAY_MS = 800;
export const CAVE_IN_DUST_SKIP_FRAME = 5;
export const CAVE_IN_DUST_GONE_SEC = 2.0;
export const CAVE_IN_STATE = 'cave_in_done';

/** Dust frame start times, seconds after the crash. Frame 5 is the skip still. */
export const CAVE_IN_DUST_AT = [0, 0.2, 0.45, 0.8, 1.2, 1.6] as const;

export function easeOutQuad(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

export function caveInTurnT(elapsed: number): number {
  if (elapsed < CAVE_IN_CRASH_AT) return 0;
  return easeOutQuad((elapsed - CAVE_IN_CRASH_AT) / CAVE_IN_TURN_SEC);
}

export function caveInCrashed(elapsed: number): boolean {
  return elapsed >= CAVE_IN_CRASH_AT;
}

export function caveInFinished(elapsed: number): boolean {
  return elapsed >= CAVE_IN_CRASH_AT + CAVE_IN_TURN_SEC;
}

/** 1-based dust_burst frame, or null after the cloud is gone. */
export function dustBurstFrame(tSinceCrash: number): number | null {
  if (tSinceCrash < 0 || tSinceCrash >= CAVE_IN_DUST_GONE_SEC) return null;
  let frame = 1;
  for (let i = 0; i < CAVE_IN_DUST_AT.length; i++) {
    if (tSinceCrash >= CAVE_IN_DUST_AT[i]) frame = i + 1;
  }
  return frame;
}

export type CaveInSpec = {
  at: { x: number; y: number };
  stepTo: { x: number; y: number };
  rubble: { x: number; y: number };
  endDir: number;
  once?: boolean;
  state: string;
  bark: string;
};

export class CaveInDirector {
  private bark2Timer: ReturnType<typeof setTimeout> | null = null;
  private openingFirstRun = false;

  /** First run of the opening, before cave_in_done is set. */
  beginOpening(alreadyDone: boolean): boolean {
    this.clearLeaveScreen();
    this.openingFirstRun = !alreadyDone;
    return this.openingFirstRun;
  }

  /** Arm opening_cavein_2 only on that first run. */
  scheduleBark2(fire: () => void, delayMs = CAVE_IN_BARK2_DELAY_MS): void {
    this.clearBark2();
    if (!this.openingFirstRun) return;
    this.bark2Timer = setTimeout(() => {
      this.bark2Timer = null;
      fire();
    }, delayMs);
  }

  /** Title, New Game, and load all leave the game screen. */
  clearLeaveScreen(): void {
    this.clearBark2();
    this.openingFirstRun = false;
  }

  hasBark2Pending(): boolean {
    return this.bark2Timer != null;
  }

  private clearBark2(): void {
    if (this.bark2Timer != null) {
      clearTimeout(this.bark2Timer);
      this.bark2Timer = null;
    }
  }
}
