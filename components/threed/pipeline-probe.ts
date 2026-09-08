import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Ring-stage atlas: prospecting, approval, development, shipped/lost.
// [panel span, mast height]; semantic instance colors remain untouched.
export const PIPELINE_PROBE_ATLAS = [
  [0.86, 1.05],
  [1.05, 0.86],
  [1.05, 1.05],
  [0.90, 0.90],
] as const

/** One flat-shaded, ungrouped mesh; all four silhouettes fit inside radius 1. */
export function createPipelineProbeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (source: THREE.BufferGeometry, part: number) => {
    const geometry = source.index ? source.toNonIndexed() : source
    if (geometry !== source) source.dispose()
    geometry.deleteAttribute('uv')
    geometry.setAttribute('probePart', new THREE.Float32BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count).fill(part), 1,
    ))
    parts.push(geometry)
  }
  // Cylinder's axis is rotated toward the camera to reveal the hexagonal plate.
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.24, 6).rotateX(Math.PI / 2), 0)
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.40, 0.44, 0.08).translate(side * 0.68, 0, 0), 1)
  }
  add(new THREE.BoxGeometry(0.07, 0.30, 0.08).translate(0, 0.62, 0), 2)
  add(new THREE.BoxGeometry(0.24, 0.14, 0.18).translate(0, 0.82, 0), 2)
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('Pipeline probe geometry could not be merged')
  // Conservative bounds include every atlas deformation (shader-side).
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  return merged
}
