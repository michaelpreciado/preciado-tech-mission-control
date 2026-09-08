import * as THREE from 'three'

export type OrbNode = { hue: number; phase: number; scale: number; selected?: boolean }
const vertexShader = `
  uniform float time; uniform float orbit;
  attribute vec3 tint; attribute vec3 node;
  varying vec3 vTint; varying vec3 vNormal; varying vec3 vEye;
  mat3 turn(float a) { return mat3(cos(a),0.,-sin(a), 0.,1.,0., sin(a),0.,cos(a)); }
  void main() {
    float phase = node.x + time * .12 * orbit;
    float pulse = 1. + .035 * sin(time * 1.35 + node.x);
    mat3 rotation = turn(time * .18 + node.x);
    vec3 p = rotation * position * node.y * pulse;
    p += orbit * vec3(cos(phase)*2.55, sin(phase)*.8, sin(phase)*.7);
    vec4 mv = modelViewMatrix * vec4(p,1.);
    vNormal = normalize(normalMatrix * rotation * normal);
    vEye = normalize(-mv.xyz); vTint = tint * node.z;
    gl_Position = projectionMatrix * mv;
  }`

/** Every orb core is batched into one mesh; all wire shells and halos into one line set. */
export function createOrbArt(nodes: OrbNode[], orbit = false, intensity = 1) {
  const core = new THREE.IcosahedronGeometry(.66, 1)
  const shellSource = new THREE.IcosahedronGeometry(.87, 1)
  const shell = new THREE.EdgesGeometry(shellSource)
  const corePositions: number[] = [], coreNormals: number[] = [], coreTints: number[] = [], coreNodes: number[] = []
  const linePositions: number[] = [], lineNormals: number[] = [], lineTints: number[] = [], lineNodes: number[] = []
  const append = (p: number[], n: number[], tint: number[], attrs: number[], point: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, node: OrbNode) => {
    p.push(point.x, point.y, point.z); n.push(normal.x, normal.y, normal.z)
    tint.push(color.r, color.g, color.b); attrs.push(node.phase, node.scale, node.selected ? 1.7 : 1)
  }
  nodes.forEach(node => {
    const color = new THREE.Color().setHSL(((node.hue % 360) + 360) % 360 / 360, .95, .58)
    const p = core.getAttribute('position'), n = core.getAttribute('normal')
    for (let i = 0; i < p.count; i++) append(corePositions, coreNormals, coreTints, coreNodes, new THREE.Vector3().fromBufferAttribute(p, i), new THREE.Vector3().fromBufferAttribute(n, i), color, node)
    const edge = shell.getAttribute('position')
    for (let i = 0; i < edge.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(edge, i)
      append(linePositions, lineNormals, lineTints, lineNodes, point, point.clone().normalize(), color, node)
    }
    for (let ring = 0; ring < 3; ring++) {
      const radius = 1.02 + ring * .14
      for (let i = 0; i < 128; i++) for (const step of [i, i + 1]) {
        const a = step / 128 * Math.PI * 2
        const point = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)
        point.applyAxisAngle(new THREE.Vector3(1, 0, 0), .65 + ring * .8)
        point.applyAxisAngle(new THREE.Vector3(0, 0, 1), ring * .6)
        append(linePositions, lineNormals, lineTints, lineNodes, point, point.clone().normalize(), color, node)
      }
    }
  })
  core.dispose(); shell.dispose(); shellSource.dispose()
  const geometry = (p: number[], n: number[], c: number[], a: number[]) => {
    const g = new THREE.BufferGeometry()
    for (const [key, values] of [['position', p], ['normal', n], ['tint', c], ['node', a]] as const) g.setAttribute(key, new THREE.Float32BufferAttribute(values, 3))
    return g
  }
  const uniforms = { time: { value: 0 }, orbit: { value: orbit ? 1 : 0 }, intensity: { value: Math.max(0, Math.min(intensity, 4)) } }
  const coreMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: `
    uniform float intensity; varying vec3 vTint; varying vec3 vNormal; varying vec3 vEye;
    void main() {
      float fresnel = pow(1. - abs(dot(normalize(vNormal), normalize(vEye))), 2.);
      float light = .24 + .55 * max(0., dot(normalize(vNormal), normalize(vec3(-.5,1.,2.))));
      gl_FragColor = vec4(vTint * (light + fresnel * 1.8) * intensity, .92);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, transparent: true })
  const lineMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: `
    uniform float intensity; varying vec3 vTint;
    void main() { gl_FragColor = vec4(vTint * intensity, .48);
    #include <colorspace_fragment>
    }`, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(geometry(corePositions, coreNormals, coreTints, coreNodes), coreMaterial)
  const lines = new THREE.LineSegments(geometry(linePositions, lineNormals, lineTints, lineNodes), lineMaterial)
  mesh.frustumCulled = lines.frustumCulled = false // Positions are animated in the vertex shader.
  group.add(mesh, lines)
  return { group, update: (time: number) => { uniforms.time.value = time } }
}
