import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type ReactorUniforms = {
  uColor: { value: THREE.Color }
  uIntensity: { value: number }
  uTime: { value: number }
  uFlicker: { value: number }
}

/** Broad nav-scale forms only: no screws, grooves, or >200px-only detail.
 * One merged geometry, no material groups, one single-sided draw call.
 */
export function createReactorGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = []
  const add = (source: THREE.BufferGeometry, emission: number) => {
    const geometry = source.index ? source.toNonIndexed() : source
    if (geometry !== source) source.dispose()
    geometry.deleteAttribute('uv')
    geometry.setAttribute('aEmission', new THREE.Float32BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count).fill(emission), 1,
    ))
    pieces.push(geometry)
  }
  // Closed cross-section: recessed aperture, bright front bevel, thick outer wall.
  const profile = [[.46, -.12], [.46, .13], [.54, .23], [.76, .23],
    [.86, .12], [.86, -.12], [.76, -.2], [.54, -.2], [.46, -.12]]
  const housing = new THREE.LatheGeometry(profile.reverse().map(([r, z]) => new THREE.Vector2(r, z)), 12)
  housing.rotateX(Math.PI / 2)
  add(housing, .22)

  const core = new THREE.IcosahedronGeometry(.43, 0)
  core.scale(1, 1, .5)
  core.translate(0, 0, .08)
  add(core, 1)

  // Raised aperture lip and six chunky radial lugs remain legible at 40–120px.
  add(new THREE.TorusGeometry(.5, .045, 4, 12).translate(0, 0, .24), .85)
  for (let i = 0; i < 6; i++) {
    const fin = new THREE.BoxGeometry(.25, .15, .24)
    fin.translate(.88, 0, 0)
    fin.rotateZ(i * Math.PI / 3)
    add(fin, .4)
  }
  const result = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  if (!result) throw new Error('Unable to merge reactor geometry')
  result.computeBoundingSphere()
  return result
}

export function createReactorMaterial(uniforms: ReactorUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aEmission;
      varying float vEmission;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vEmission = aEmission;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      uniform float uFlicker;
      varying float vEmission;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 normal = normalize(vNormal);
        float rim = pow(1.0 - max(dot(normal, normalize(vView)), 0.0), 2.2);
        float facet = 0.92 + 0.08 * sin((normal.x + normal.y * 1.7) * 18.0 + uTime * uFlicker);
        float bevel = 0.2 + 0.45 * max(dot(normal, normalize(vec3(-0.4, 0.65, 1.0))), 0.0);
        float energy = (vEmission + bevel * 0.35 + rim * 0.55) * uIntensity * facet;
        gl_FragColor = vec4(uColor * energy, min(0.98, 0.55 + vEmission * 0.35 + rim * 0.1));
      }
    `,
  })
}
