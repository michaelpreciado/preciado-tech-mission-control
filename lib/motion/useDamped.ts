/**
 * import { useDamped, useSpringTarget } from './useDamped';
 * const scale = useDamped(hovered ? 1.06 : 1, { stiffness: 180, damping: 24 });
 * const [depth, setDepth] = useSpringTarget(0);
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { makeDampedLoop } from './camera';

export interface SpringOptions { stiffness?: number; damping?: number; precision?: number }
export interface SpringState { value: number; velocity: number }

/** Exact unit-mass spring solution for a fixed target, including long frame gaps. */
export function stepSpring(state: SpringState, target: number, dt: number, options: SpringOptions = {}): SpringState {
  const { stiffness: k = 180, damping: c = 24, precision = 0.001 } = options;
  if (![k, c, precision, target, dt, state.value, state.velocity].every(Number.isFinite) || k <= 0 || c < 0 || precision <= 0 || dt < 0) {
    throw new RangeError('Spring requires finite values, stiffness/precision > 0, damping/dt >= 0');
  }
  if (dt === 0) return { ...state };
  const x = state.value - target;
  const v = state.velocity;
  const a = c / 2;
  const discriminant = a * a - k;
  let offset: number;
  let velocity: number;
  if (Math.abs(discriminant) < 1e-8) {
    const b = v + a * x;
    const decay = Math.exp(-a * dt);
    offset = (x + b * dt) * decay;
    velocity = (v - a * b * dt) * decay;
  } else if (discriminant < 0) {
    const w = Math.sqrt(-discriminant);
    const b = (v + a * x) / w;
    const cos = Math.cos(w * dt), sin = Math.sin(w * dt), decay = Math.exp(-a * dt);
    offset = decay * (x * cos + b * sin);
    velocity = decay * (v * cos - (a * b + w * x) * sin);
  } else {
    const root = Math.sqrt(discriminant);
    const r1 = -k / (a + root), r2 = -a - root;
    const b1 = (v - r2 * x) / (r1 - r2), b2 = x - b1;
    offset = b1 * Math.exp(r1 * dt) + b2 * Math.exp(r2 * dt);
    velocity = r1 * b1 * Math.exp(r1 * dt) + r2 * b2 * Math.exp(r2 * dt);
  }
  return Math.abs(offset) < precision && Math.abs(velocity) < precision
    ? { value: target, velocity: 0 } : { value: target + offset, velocity };
}

/** Chase a numeric prop. Preserves velocity on retarget; sleeps at rest and cancels on unmount. */
export function useDamped(target: number, options: SpringOptions = {}): number {
  const { stiffness = 180, damping = 24, precision = 0.001 } = options;
  const state = useRef<SpringState>({ value: target, velocity: 0 });
  const [value, setValue] = useState(target);
  useEffect(() => {
    stepSpring(state.current, target, 0, { stiffness, damping, precision });
    if (state.current.value === target && state.current.velocity === 0) return;
    const stop = makeDampedLoop([(dt) => {
      state.current = stepSpring(state.current, target, dt, { stiffness, damping, precision });
      setValue(state.current.value);
      if (state.current.value === target && state.current.velocity === 0) stop();
    }]);
    return stop;
  }, [target, stiffness, damping, precision]);
  return value;
}

/** Own a spring target and return [animatedValue, setTarget], using React's setter semantics. */
export function useSpringTarget(initial: number, options: SpringOptions = {}) {
  const [target, setTarget] = useState(initial);
  return [useDamped(target, options), setTarget] as const;
}
