import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothOut, springySettle, elasticInOut, exponential } from '../lib/motion/easings.ts';
import { stepSpring } from '../lib/motion/useDamped.ts';
import { damp, smoothOrbit, lookAtDamp, orbitPosition, nudge, makeDampedLoop } from '../lib/motion/camera.ts';
import { sequence } from '../lib/motion/choreography.ts';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function clock() {
  let next = 0;
  const pending = new Map();
  return {
    request(cb) { pending.set(++next, cb); return next; },
    cancel(id) { pending.delete(id); },
    tick(now) { const batch = [...pending.values()]; pending.clear(); batch.forEach((cb) => cb(now)); },
    get size() { return pending.size; },
  };
}
test('curves clamp inputs and preserve endpoints; spring overshoots', () => {
  for (const easing of [smoothOut, springySettle, elasticInOut, exponential]) {
    near(easing(-1), 0); near(easing(0), 0); near(easing(1), 1); near(easing(2), 1);
    for (let i = 0; i <= 100; i++) assert.ok(Number.isFinite(easing(i / 100)));
  }
  assert.ok(springySettle(0.7) > 1);
});
test('spring agrees across frame rates in all damping regimes', () => {
  for (const damping of [0, 12, 20, 40]) {
    const options = { stiffness: 100, damping, precision: 1e-12 };
    const initial = { value: -2, velocity: 3 };
    const direct = stepSpring(initial, 4, 1, options);
    let stepped = initial;
    for (let i = 0; i < 120; i++) stepped = stepSpring(stepped, 4, 1 / 120, options);
    near(direct.value, stepped.value); near(direct.velocity, stepped.velocity);
  }
  assert.deepEqual(stepSpring({ value: 0, velocity: 0 }, 1, 60), { value: 1, velocity: 0 });
  assert.throws(() => stepSpring({ value: 0, velocity: 0 }, 1, 0.1, { stiffness: 0 }), RangeError);
});
test('damping composes, longitude crosses seam, orbit and look-at preserve inputs', () => {
  near(damp(damp(0, 1, 0.3), 1, 0.7), damp(0, 1, 1));
  const current = { lat: 0, lon: Math.PI - 0.1, height: 0, radius: 2 };
  const next = smoothOrbit(current, { ...current, lon: -Math.PI + 0.1 }, 0.1);
  assert.ok(next.lon > current.lon && next.lon < Math.PI + 0.1);
  assert.deepEqual(orbitPosition({ ...current, lon: 0 }), { x: 0, y: 0, z: 2 });
  const point = { x: 0, y: 0, z: 0 };
  assert.ok(lookAtDamp(point, { x: 1, y: 1, z: 1 }, 0.1).x > 0);
  assert.deepEqual(point, { x: 0, y: 0, z: 0 });
});
test('nudge returns to rest without accumulating displacement', () => {
  near(nudge(-1), 0); near(nudge(0), 0); near(nudge(0.65 * 0.3), -0.3); near(nudge(0.65), 0);
  assert.throws(() => nudge(0, 0.3, 0), RangeError);
});
test('loop uses seconds and cancellation within callback prevents remaining callbacks', () => {
  const scheduler = clock();
  const seen = [];
  const stop = makeDampedLoop([(dt, elapsed) => { seen.push([dt, elapsed]); if (elapsed > 0) stop(); }, () => seen.push('second')], scheduler);
  scheduler.tick(100); scheduler.tick(350);
  assert.deepEqual(seen, [[0, 0], 'second', [0.25, 0.25]]);
  assert.equal(scheduler.size, 0); stop();
});
test('sequence chains and staggers with exact final values even after skipped frames', () => {
  let orb = 0;
  const cards = [0, 0, 0];
  const timeline = sequence().to(0.5, (p) => { orb = p; }).wait(0.1)
    .stagger(cards, 0.1, 0.4, (_, p, i) => { cards[i] = p; });
  near(timeline.duration, 1.2);
  timeline.sample(0.65);
  near(orb, 1); assert.ok(cards[0] > 0); near(cards[1], 0);
  assert.equal(timeline.sample(3), false); assert.deepEqual(cards, [1, 1, 1]);
  timeline.cancel(); orb = 7; timeline.sample(0); assert.equal(orb, 7);
});
test('play completes, restarts, and cancels without leftover frames', () => {
  const scheduler = clock(); let value = -1;
  const timeline = sequence().to(1, (p) => { value = p; });
  const stop = timeline.play(scheduler);
  scheduler.tick(0); scheduler.tick(1000);
  assert.equal(value, 1); assert.equal(scheduler.size, 0);
  timeline.play(scheduler); assert.equal(value, 0); stop(); assert.equal(scheduler.size, 0);
  const zero = sequence().to(0, (p) => { value = p; });
  zero.play(scheduler); assert.equal(value, 1); assert.equal(scheduler.size, 0);
});
test('cancellation inside a timeline callback stops subsequent clips', () => {
  const timeline = sequence().to(0, () => timeline.cancel()).to(0, () => assert.fail('cancelled'));
  assert.equal(timeline.sample(0), false);
});
