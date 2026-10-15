/** Frozen game time while the note reader is open. Wall time still advances. */
export class GameClock {
  private pausedAt: number | null = null;
  private offset = 0;

  nowMs(wall = performance.now()): number {
    if (this.pausedAt != null) return this.pausedAt - this.offset;
    return wall - this.offset;
  }

  nowSec(wall = performance.now()): number {
    return this.nowMs(wall) / 1000;
  }

  get paused(): boolean {
    return this.pausedAt != null;
  }

  pause(wall = performance.now()) {
    if (this.pausedAt != null) return;
    this.pausedAt = wall;
  }

  resume(wall = performance.now()) {
    if (this.pausedAt == null) return;
    this.offset += wall - this.pausedAt;
    this.pausedAt = null;
  }
}

export function remainingUntil(until: number, now: number): number {
  return Math.max(0, until - now);
}

/** Shared bed duck: −4 dB on open, restore on close. */
export const NOTE_READER_DUCK_DB = 4;
export const NOTE_READER_DUCK_OPEN_SEC = 0.2;
export const NOTE_READER_DUCK_CLOSE_SEC = 0.3;

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function isUnstartedSfx(now: number, startAt: number): boolean {
  return startAt > now;
}

export function isMonsterReaderSfx(name: string): boolean {
  return /attack|alert|footstep|sting/i.test(name);
}
