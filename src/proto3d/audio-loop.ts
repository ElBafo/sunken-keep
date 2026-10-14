/** First sample above this is the authored start (gurgle opens soft). */
export const LOOP_START_THRESHOLD = 1e-4;
/** WebKit MP3 encoder padding when detection fails. */
export const LOOP_START_FALLBACK_S = 0.025057;
/** Detected start past this is treated as encoder junk. */
export const LOOP_START_MAX_S = 0.06;

export type LoopSampleBuffer = {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
  getChannelData: (channel: number) => ArrayLike<number>;
};

/** First sample with abs > 1e-4, or the 25.057 ms fallback. */
export function detectLoopStartSec(buffer: LoopSampleBuffer, loopLength: number): number {
  const channels = buffer.numberOfChannels;
  const count = buffer.length;
  let first = -1;
  outer: for (let i = 0; i < count; i++) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(buffer.getChannelData(c)[i]) > LOOP_START_THRESHOLD) {
        first = i;
        break outer;
      }
    }
  }
  const start = first < 0 ? 0 : first / buffer.sampleRate;
  if (start > LOOP_START_MAX_S || buffer.duration - start < loopLength) {
    return LOOP_START_FALLBACK_S;
  }
  return start;
}

export function applyBufferLoopPoints(
  src: { loop: boolean; loopStart: number; loopEnd: number },
  buffer: LoopSampleBuffer,
  loopLength: number
) {
  const start = detectLoopStartSec(buffer, loopLength);
  src.loop = true;
  src.loopStart = start;
  src.loopEnd = start + loopLength;
}
