/**
 * import { smoothOrbit, makeDampedLoop } from './camera';
 * let orbit = { lat: 0.2, lon: 0, height: 0, radius: 6 };
 * const stop = makeDampedLoop([(dt) => { orbit = smoothOrbit(orbit, { ...orbit, lon: 1 }, dt); }]);
 */
import { smoothOut } from './easings';

export interface Vec3 { x: number; y: number; z: number }
/** Angles in radians; height is a vertical offset from the focus. */
export interface Orbit { lat: number; lon: number; height: number; radius: number }

/** Frame-rate independent exponential chase; damping is inverse seconds. */
export function damp(value: number, target: number, dt: number, damping = 8): number {
  if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(damping) || damping < 0) {
    throw new RangeError('dt and damping must be finite and non-negative');
  }
  return value + (target - value) * -Math.expm1(-damping * dt);
}

/** Chase an orbit without mutating inputs; longitude takes the shortest arc. */
export function smoothOrbit(current: Orbit, target: Orbit, dt: number, damping = 6): Orbit {
  const delta = Math.atan2(Math.sin(target.lon - current.lon), Math.cos(target.lon - current.lon));
  return {
    lat: damp(current.lat, target.lat, dt, damping),
    lon: damp(current.lon, current.lon + delta, dt, damping),
    height: damp(current.height, target.height, dt, damping),
    radius: damp(current.radius, target.radius, dt, damping),
  };
}

/** Convert a Y-up orbit into a position; positive longitude rotates +Z toward +X. */
export function orbitPosition(orbit: Orbit, focus: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const ring = orbit.radius * Math.cos(orbit.lat);
  return {
    x: focus.x + ring * Math.sin(orbit.lon),
    y: focus.y + orbit.height + orbit.radius * Math.sin(orbit.lat),
    z: focus.z + ring * Math.cos(orbit.lon),
  };
}

/** Damp a look-at POINT; pass the result to your renderer's camera.lookAt(x,y,z). */
export function lookAtDamp(current: Vec3, target: Vec3, dt: number, damping = 8): Vec3 {
  return { x: damp(current.x, target.x, dt, damping), y: damp(current.y, target.y, dt, damping), z: damp(current.z, target.z, dt, damping) };
}

/** Negative radial offset: push in, then return to zero. Sample elapsed seconds. */
export function nudge(elapsed: number, distance = 0.3, duration = 0.65): number {
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('duration must be positive and finite');
  if (elapsed <= 0 || elapsed >= duration) return 0;
  const t = elapsed / duration;
  return -distance * (t < 0.3 ? smoothOut(t / 0.3) : 1 - smoothOut((t - 0.3) / 0.7));
}

export type FrameCallback = (dt: number, elapsed: number) => void;
export interface FrameScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(id: number): void;
}

/** Start one rAF loop. dt/elapsed are seconds; stop is idempotent, including inside a callback. */
export function makeDampedLoop(cbs: readonly FrameCallback[], scheduler?: FrameScheduler): () => void {
  const clock = scheduler ?? {
    request: (cb: (timestamp: number) => void) => requestAnimationFrame(cb),
    cancel: (id: number) => cancelAnimationFrame(id),
  };
  let active = true;
  let previous: number | undefined;
  let start: number | undefined;
  let id: number;
  const stop = () => { active = false; clock.cancel(id); };
  const frame = (now: number) => {
    if (!active) return;
    start ??= now;
    const dt = previous === undefined ? 0 : Math.max(0, (now - previous) / 1000);
    previous = now;
    try {
      for (const cb of cbs) {
        if (!active) break;
        cb(dt, Math.max(0, (now - start) / 1000));
      }
    } catch (error) { stop(); throw error; }
    if (active) id = clock.request(frame);
  };
  id = clock.request(frame);
  return stop;
}

export const cameraRig = { smoothOrbit, orbitPosition, nudge, lookAtDamp };
