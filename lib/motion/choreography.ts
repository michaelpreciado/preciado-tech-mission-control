/**
 * import { sequence } from './choreography';
 * const entrance = sequence().to(0.6, (p) => { orb.scale = p; }).wait(0.1).to(0.3, reveal);
 * const stop = entrance.play(); // or entrance.sample(elapsedSeconds) from your render loop
 */
import { smoothOut, type Easing } from './easings';
import { makeDampedLoop, type FrameScheduler } from './camera';

type Clip = { start: number; duration: number; update: (progress: number) => void; ease: Easing };
const durationCheck = (n: number) => {
  if (!Number.isFinite(n) || n < 0) throw new RangeError('Timing must be finite and non-negative');
};

/** Chain timed callbacks; all timings are seconds. No renderer or DOM assumptions. */
export function sequence() {
  const clips: Clip[] = [];
  let cursor = 0;
  let cancelled = false;
  let stopLoop: (() => void) | undefined;
  const timeline = {
    get duration() { return cursor; },
    to(duration: number, update: Clip['update'], ease: Easing = smoothOut) {
      durationCheck(duration);
      clips.push({ start: cursor, duration, update, ease });
      cursor += duration;
      return timeline;
    },
    wait(duration: number) {
      durationCheck(duration);
      cursor += duration;
      return timeline;
    },
    /** Overlap item entrances with an interval; next chained clip waits for the entire group. */
    stagger<T>(items: readonly T[], interval: number, duration: number, update: (item: T, progress: number, index: number) => void, ease: Easing = smoothOut) {
      durationCheck(interval); durationCheck(duration);
      items.forEach((item, index) => clips.push({ start: cursor + index * interval, duration, update: (p) => update(item, p, index), ease }));
      if (items.length) cursor += (items.length - 1) * interval + duration;
      return timeline;
    },
    /** Forward-time sampling. Completed clips keep applying endpoints; callbacks must be idempotent. */
    sample(elapsed: number) {
      durationCheck(elapsed);
      if (cancelled) return false;
      for (const clip of clips) {
        if (cancelled) return false;
        if (elapsed < clip.start) continue;
        const p = clip.duration === 0 ? 1 : Math.min(1, (elapsed - clip.start) / clip.duration);
        clip.update(clip.ease(p));
      }
      return !cancelled && elapsed < cursor;
    },
    /** Cancel sampling and playback; play() explicitly resets cancellation and restarts at zero. */
    cancel() { cancelled = true; stopLoop?.(); stopLoop = undefined; },
    play(scheduler?: FrameScheduler): () => void {
      timeline.cancel();
      cancelled = false;
      if (timeline.sample(0)) {
        stopLoop = makeDampedLoop([(_dt, elapsed) => {
          if (!timeline.sample(elapsed)) { stopLoop?.(); stopLoop = undefined; }
        }], scheduler);
      }
      return timeline.cancel;
    },
  };
  return timeline;
}
