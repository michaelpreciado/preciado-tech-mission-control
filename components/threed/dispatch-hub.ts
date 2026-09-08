import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Command dais: hexagonal core, wide console wings, raised crown antenna. */
export function createDispatchHub(): THREE.BufferGeometry {
  const core = new THREE.CylinderGeometry(0.42, 0.48, 0.3, 6).rotateX(Math.PI / 2)
  const parts = [core,
    new THREE.BoxGeometry(0.32, 0.22, 0.22).translate(-0.48, -0.08, 0),
    new THREE.BoxGeometry(0.32, 0.22, 0.22).translate(0.48, -0.08, 0),
    new THREE.BoxGeometry(0.8, 0.12, 0.4).translate(0, -0.43, 0),
    new THREE.BoxGeometry(0.08, 0.24, 0.12).translate(0, 0.48, 0),
  ]
  const geometry = mergeGeometries(parts)!
  parts.forEach(part => part.dispose())
  return geometry
}
