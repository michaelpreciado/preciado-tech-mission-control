/** Renderer-neutral demo: run with node --import ./tests/helpers/ts-resolve.mjs 3d-art/motion-demo.ts. */
import { sequence } from '../lib/motion/choreography';
import { cameraRig } from '../lib/motion/camera';
import { springySettle } from '../lib/motion/easings';

export function motionDemo() {
  const orb = { scale: 0 };
  const cards = Array.from({ length: 6 }, () => ({ entrance: 0 }));
  let orbit = { lat: 0.2, lon: 0, height: 0, radius: 6 };
  let focus = { x: 0, y: 0, z: 0 };
  const timeline = sequence()
    .to(0.6, (p) => { orb.scale = p; }, springySettle)
    .stagger(cards, 0.08, 0.4, (card, p) => { card.entrance = p; });
  const snapshots = [];
  for (let frame = 0; frame <= 180; frame++) {
    const elapsed = frame / 60;
    timeline.sample(elapsed);
    orbit = cameraRig.smoothOrbit(orbit, { ...orbit, lon: elapsed * 0.12 }, 1 / 60);
    focus = cameraRig.lookAtDamp(focus, { x: 0, y: elapsed >= 1.5 ? 0.3 : 0, z: 0 }, 1 / 60);
    const position = cameraRig.orbitPosition({ ...orbit, radius: orbit.radius + cameraRig.nudge(elapsed - 1.5) });
    if (frame % 30 === 0) snapshots.push({ elapsed, orb: { ...orb }, cards: cards.map((c) => ({ ...c })), position, focus });
  }
  timeline.cancel();
  return snapshots;
}

console.log(JSON.stringify(motionDemo(), null, 2));
