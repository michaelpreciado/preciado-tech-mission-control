import * as THREE from 'three'

/** One closed, beveled chip in the ring's XY plane; no separate rim mesh. */
export function createTaskTokenGeometry(capacity: number): THREE.BufferGeometry {
  // Radius stays at one so the ring's existing priority scales retain their footprint.
  const profile = [
    [0, -0.18], [0.84, -0.18], [0.95, -0.13], [1, -0.06],
    [1, 0.06], [0.95, 0.13], [0.84, 0.18], [0, 0.18],
  ].map(([radius, height]) => new THREE.Vector2(radius, height))
  const geometry = new THREE.LatheGeometry(profile, 24)
  geometry.rotateX(Math.PI / 2)
  geometry.setAttribute('nodeEnergy', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
  return geometry
}

/** Opaque body and self-emissive bevel share the instance color and one pass. */
export function createTaskTokenMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } },
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec2 nodeEnergy;
      varying vec3 vColor;
      varying vec2 vEnergy;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vColor = instanceColor;
        vEnergy = nodeEnergy;
        vNormal = normal;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uMotion;
      varying vec3 vColor;
      varying vec2 vEnergy;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        // Local light keeps tiny tokens legible without scene lights or extra passes.
        vec3 n = normalize(vNormal);
        float light = 0.56 + 0.24 * abs(n.z)
          + 0.12 * max(dot(n, normalize(vec3(-0.4, 0.6, 1.0))), 0.0);
        float rim = smoothstep(0.82, 0.96, length(vPosition.xy));
        // Keep the existing failure energy and reduced-motion pulse gate.
        float pulse = 1.0 + vEnergy.x * uMotion * (0.35 + 0.35 * sin(uTime * 3.0));
        vec3 body = vColor * light;
        vec3 emission = vColor * (0.08 + 0.30 * rim);
        gl_FragColor = vec4((body + emission) * vEnergy.y * pulse, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
