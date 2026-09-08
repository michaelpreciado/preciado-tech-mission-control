# Motion + camera language

Four modules, no added packages. Only `useDamped.ts` imports the existing React runtime; the other modules work with plain numbers and structural `{x,y,z}` objects. Nothing writes to the DOM or imports three.js. Time is in **seconds**, angles in **radians**, distances in your scene's units.

| Module | API |
| --- | --- |
| `lib/motion/easings.ts` | `smoothOut`, `springySettle`, `elasticInOut`, `exponential`: `(t: number) => number`. Inputs clamp to `[0,1]`; spring/elastic curves intentionally overshoot. |
| `lib/motion/useDamped.ts` | `useDamped(target, options?)` returns the animated number, initially equal to target. `useSpringTarget(initial, options?)` returns `[value, setTarget]`. `stepSpring(state, target, dt, options?)` provides the pure numeric solver. |
| `lib/motion/camera.ts` | `damp(value,target,dt,damping=8)`, `smoothOrbit(current,target,dt,damping=6)`, `orbitPosition(orbit,focus?)`, `lookAtDamp(current,target,dt,damping=8)`, `nudge(elapsed,distance=.3,duration=.65)`, `makeDampedLoop(cbs,scheduler?)`. `cameraRig` groups the four orbit/look-at/nudge helpers. |
| `lib/motion/choreography.ts` | `sequence().to(duration,update,ease?).wait(duration).stagger(items,interval,duration,update,ease?)`; `.duration`, `.sample(elapsed)`, `.play(scheduler?)`, `.cancel()`. Default easing is `smoothOut`. |

Spring options default to `{stiffness:180, damping:24, precision:.001}` with unit mass. Stiffness and precision must be positive; damping may be zero for an undamped oscillator. Critical damping is `2 * sqrt(stiffness)`. Precision checks both position error and velocity. The exact spring solution preserves velocity when the target changes and handles long frame gaps. Hooks stop requesting frames when settled, restart on target/options changes, and cancel on unmount, including React Strict Mode cleanup. React rerenders on value changes; use the pure solver in an existing renderer loop for many objects.

`Orbit` is `{lat,lon,height,radius}`. Latitude is elevation from the XZ plane; height offsets Y above the focus. Longitude follows the shortest arc. Keep latitude away from the poles to avoid look-at roll ambiguity. The helpers return new objects and never mutate cameras. `lookAtDamp` smooths a focus point, not a quaternion.

`makeDampedLoop` starts immediately and returns an idempotent stop function. Callbacks receive `(dt,elapsed)` starting at `(0,0)` on the first frame. It uses actual frame time, so timelines catch up after a background-tab pause. An optional `{request, cancel}` scheduler enables deterministic tests. Browser APIs are accessed only when starting a loop; cancel it during component cleanup. In React Three Fiber, use your existing frame loop instead of starting another.

Timelines sample forward in time; callbacks assign values from progress and should be idempotent. Completed clips continue applying their endpoint, then later clips run in insertion order. Capture each clip's starting values explicitly; do not repeatedly interpolate from a mutable current value. Sampling returns whether work remains. Zero-duration clips immediately apply `1`. Stagger waits for the whole group before the next chained clip. Cancellation blocks manual sampling too; `play()` resets cancellation and restarts at zero. Backward seeking/resetting future clips and completion events are intentionally outside this small API.

## Recommended motion values

| Behavior | Starting values | Application |
| --- | --- | --- |
| Orb idle pulse | amplitude `.018`, period `3.2s` | `scale = baseScale * (1 + .018 * sin(2π * elapsed / 3.2))`; layer over a `.6s` springy entrance. |
| Button hover / press | hover `1.04`, press `.96`; stiffness `280`, damping `30` | `useDamped(pressed ? .96 : hovered ? 1.04 : 1, options)`; release targets hover/rest. |
| Kanban-ring orbit | `.12 rad/s` (~52s/revolution), damping `6` | Increment longitude target by `dt * .12`; stagger entrance every `.08s` over `.4s`. |
| Camera status nudge | distance `.3` at radius `6`, duration `.65s` | Add the sampled offset to the base radius: 30% push-in, 70% settle-back. Focus damping `8`. |

Use `nudge(elapsed - statusChangedAt)` as an offset, never accumulate it into the base radius. Replacing the start time during an active nudge restarts from zero; queue rapid changes if continuous motion is required. Maintain `radius > distance`. For reduced motion, choose static scale/positions, zero orbit speed and zero nudge distance in the consumer.

## Renderer integration

```ts
let orbit = { lat: .2, lon: 0, height: 0, radius: 6 };
let focus = { x: 0, y: 0, z: 0 };
const stop = makeDampedLoop([(dt, elapsed) => {
  orbit = smoothOrbit(orbit, orbitTarget, dt);
  focus = lookAtDamp(focus, focusTarget, dt);
  const p = orbitPosition({ ...orbit, radius: orbit.radius + nudge(elapsed - statusChangedAt) }, focus);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(focus.x, focus.y, focus.z);
}]);
// Return stop from the owning effect; no rendering or DOM updates are performed by the kit.
```

`motion-demo.ts` demonstrates an orb entrance, six-card stagger, orbit, focus chase, and status nudge through reproducible numeric snapshots without adding a page:

```sh
node --import ./tests/helpers/ts-resolve.mjs 3d-art/motion-demo.ts
node --test --import ./tests/helpers/ts-resolve.mjs 3d-art/motion.test.mjs
npm run typecheck -- --incremental false
```

A3 MOTION: COMPLETE (4 modules)
