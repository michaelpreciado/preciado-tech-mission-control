import * as THREE from 'three'

/** Extruded rounded plate; its grid, brackets, emblem, and scan are analytic shader ink. */
export function createPlate(width: number, height: number, consolePanel = false) {
  const r = .16, x = -width / 2, y = -height / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y); shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelThickness: .035, bevelSize: .025, bevelSegments: 2, steps: 1, curveSegments: 10 })
  geometry.clearGroups()
  const uniforms = { time: { value: 0 }, energy: { value: 1 }, dimensions: { value: new THREE.Vector2(width, height) }, consolePanel: { value: consolePanel ? 1 : 0 } }
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, side: THREE.FrontSide,
    vertexShader: `varying vec3 p; varying vec3 n; void main(){p=position; n=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform float time; uniform float energy; uniform vec2 dimensions; uniform float consolePanel;
      varying vec3 p; varying vec3 n;
      float stripe(float x, float w) { return 1.-smoothstep(w,w+.015,abs(x)); }
      void main(){
        vec2 uv=p.xy/dimensions+.5;
        vec2 inset=dimensions*.5-abs(p.xy);
        float rim=1.-smoothstep(.015,.055,min(inset.x,inset.y));
        float front=step(.9,n.z);
        float bracket= max(stripe(inset.x-.12,.012)*step(inset.y,.42),stripe(inset.y-.12,.012)*step(inset.x,.42));
        vec2 g=abs(fract(p.xy*4.+.5)-.5)/fwidth(p.xy*4.);
        float grid=(1.-min(min(g.x,g.y),1.))*.10;
        float scan=exp(-pow((uv.y-fract(time*.13))*35.,2.))*.3;
        vec2 e=p.xy-vec2(dimensions.x*.31,dimensions.y*.25);
        float a=time*.55; e=mat2(cos(a),-sin(a),sin(a),cos(a))*e;
        float emblem=stripe(abs(e.x)+abs(e.y)-.19,.012);
        float ink=consolePanel*(grid+scan+bracket*.85+emblem*.8)*front;
        float sheen=pow(max(0.,1.-abs(uv.x+uv.y-1.1)),8.)*.13;
        vec3 color=vec3(.00335,.00402,.00605)+vec3(.33716,.45641,.83880)*(rim*.8+ink+sheen)*energy;
        color+=vec3(.33716,.45641,.83880)*.16*(1.-front);
        gl_FragColor=vec4(color,.93);
        #include <colorspace_fragment>
      }` })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, material))
  const edges = new THREE.EdgesGeometry(geometry, 30)
  group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#9db4ec', transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })))
  return { group, uniforms }
}
