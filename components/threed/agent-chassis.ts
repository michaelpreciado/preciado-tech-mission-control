import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** One low-poly geometry shared by every agent; dimensions normalized to 1. */
export function createAgentChassis(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  }
  box(0.72, 0.72, 0.24, 0, 0, 0)
  // Shoulder rails, recessed face and split feet make a compact robotic chassis.
  box(0.12, 0.85, 0.34, -0.43, 0, 0)
  box(0.12, 0.85, 0.34, 0.43, 0, 0)
  box(0.58, 0.18, 0.12, 0, 0.12, 0.17)
  box(0.22, 0.14, 0.3, -0.23, -0.43, 0)
  box(0.22, 0.14, 0.3, 0.23, -0.43, 0)
  const geometry = mergeGeometries(parts)!
  parts.forEach(part => part.dispose())
  return geometry
}
