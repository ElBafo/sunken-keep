/** WebKit MP3 encoder padding. Always used; sample scanning clicks on these loops. */
export const LOOP_START_S = 0.025057;
/** @deprecated Use LOOP_START_S. Kept so older tests/imports keep working. */
export const LOOP_START_FALLBACK_S = LOOP_START_S;

export type LoopSampleBuffer = {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
  getChannelData: (channel: number) => ArrayLike<number>;
};

/** Fixed encoder padding. Detection is dropped — gurgle read 24.989 ms and clicked. */
export function detectLoopStartSec(_buffer: LoopSampleBuffer, _loopLength: number): number {
  return LOOP_START_S;
}

export function applyBufferLoopPoints(
  src: { loop: boolean; loopStart: number; loopEnd: number },
  _buffer: LoopSampleBuffer,
  loopLength: number
) {
  src.loop = true;
  src.loopStart = LOOP_START_S;
  src.loopEnd = LOOP_START_S + loopLength;
}
