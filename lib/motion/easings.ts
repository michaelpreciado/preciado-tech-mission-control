/**
 * import { smoothOut, springySettle } from './easings';
 * const opacity = smoothOut(elapsed / duration);
 * const scale = 0.8 + 0.2 * springySettle(elapsed / duration);
 */
export type Easing = (t: number) => number;
const unit = (t: number) => Math.max(0, Math.min(1, t));

/** Cubic deceleration: fast departure, soft arrival, no overshoot. */
export const smoothOut: Easing = (t) => 1 - (1 - unit(t)) ** 3;

/** Back-out curve with a small, intentional overshoot before settling. */
export const springySettle: Easing = (t) => {
  const x = unit(t) - 1;
  return 1 + 2.70158 * x ** 3 + 1.70158 * x ** 2;
};

/** Elastic anticipation and overshoot with exact zero and one endpoints. */
export const elasticInOut: Easing = (t) => {
  const x = unit(t);
  if (x === 0 || x === 1) return x;
  const wave = Math.sin((20 * x - 11.125) * (2 * Math.PI / 4.5));
  return x < 0.5 ? -(2 ** (20 * x - 10) * wave) / 2 : 2 ** (-20 * x + 10) * wave / 2 + 1;
};

/** Exponential deceleration with exact endpoints, ideal for camera pushes. */
export const exponential: Easing = (t) => {
  const x = unit(t);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
};
