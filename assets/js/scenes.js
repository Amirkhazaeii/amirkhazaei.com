// Three.js hero scenes for project pages. Each takes the hero element and returns { dispose }.
// Pick one per project with "scene" in data/site.json: sun | terrain | rollers | plankton.
import * as THREE from "three";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shared boilerplate: renderer sized to the hero, render loop that pauses off-screen.
function stage(host, { camera, fov = 40, near = 0.1, far = 2000, shadows = false } = {}) {
  const canvas = document.createElement("canvas");
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const cam = camera || new THREE.PerspectiveCamera(fov, 1, near, far);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    if (cam.isPerspectiveCamera) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  }
  resize();
  new ResizeObserver(resize).observe(host);

  let running = true, raf = 0, t0 = performance.now(), update = () => {};
  const loop = (now) => {
    if (!running) return;
    const t = REDUCED ? 6 : (now - t0) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    update(t, pointer);
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); }
    else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); }
  }).observe(host);
  return {
    renderer, scene, camera: cam,
    start(fn) { update = fn; raf = requestAnimationFrame(loop); },
  };
}

// Small deterministic noise helpers.
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 6) { let f = 0, a = 0.5, fr = 1; for (let i = 0; i < oct; i++) { f += a * vnoise(x * fr, y * fr); fr *= 2.03; a *= 0.5; } return f; }

/* ------------------------------------------------------------------ */
/* Unbaking the Sun: a block city lit by a sun you can move. "Baked"  */
/* keeps the capture-day shadows; "Unbaked" removes them.             */
/* ------------------------------------------------------------------ */
export function sunScene(host) {
  const { scene, camera, start, renderer } = stage(host, { fov: 32, shadows: true });
  renderer.toneMappingExposure = 1.35;
  scene.fog = new THREE.Fog(0x000000, 230, 420);
  camera.position.set(150, 120, 150);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x202024, 0.7));

  const mkSun = (intensity) => {
    const l = new THREE.DirectionalLight(0xffffff, intensity);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera; c.left = -120; c.right = 120; c.top = 120; c.bottom = -120; c.near = 1; c.far = 500;
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.4;
    scene.add(l, l.target);
    return l;
  };
  const baked = mkSun(2.4);     // capture-day sun, fixed
  const sun = mkSun(4.2);       // the sun you choose
  const placeSun = (light, azDeg, elDeg) => {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg), R = 200;
    light.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R);
  };
  placeSun(baked, 135, 48);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xbdbdc2, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // instanced blocks on a jittered grid
  const R = rand(7);
  const blocks = [];
  for (let gx = -6; gx <= 6; gx++) for (let gz = -6; gz <= 6; gz++) {
    if (R() < 0.18) continue;
    const w = 6 + R() * 9, d = 6 + R() * 9;
    const h = 4 + Math.pow(R(), 2.2) * 46 * (1 - Math.hypot(gx, gz) / 11);
    blocks.push({ x: gx * 17 + (R() - 0.5) * 4, z: gz * 17 + (R() - 0.5) * 4, w, d, h: Math.max(3, h), ry: (R() - 0.5) * 0.3 });
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.7 }), blocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  blocks.forEach((b, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry);
    m.compose(p.set(b.x, b.h / 2, b.z), q, s.set(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  // controls
  const ctl = document.createElement("div");
  ctl.className = "hero-ctl";
  ctl.innerHTML = `
    <label for="az">Sun azimuth <output id="azOut">220°</output></label>
    <input id="az" type="range" min="0" max="360" value="220">
    <div class="seg" role="group" aria-label="Texture">
      <button type="button" data-m="baked" aria-pressed="true">Baked</button>
      <button type="button" data-m="unbaked" aria-pressed="false">Unbaked</button>
    </div>`;
  host.appendChild(ctl);
  let az = 220, auto = !REDUCED, mode = "baked";
  const azIn = ctl.querySelector("#az"), azOut = ctl.querySelector("#azOut");
  azIn.addEventListener("input", () => { az = +azIn.value; auto = false; });
  ctl.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    mode = b.dataset.m;
    ctl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });

  let bakedI = 2.4;
  start((t, ptr) => {
    if (auto) { az = (220 + t * 9) % 360; azIn.value = az; }
    azOut.textContent = Math.round(az) + "°";
    placeSun(sun, az, 38);
    bakedI += ((mode === "baked" ? 2.4 : 0) - bakedI) * 0.08;
    baked.intensity = bakedI;
    baked.castShadow = bakedI > 0.02;
    const a = 0.785 + ptr.x * 0.15 + (REDUCED ? 0 : t * 0.01);
    camera.position.set(Math.sin(a) * 250, 175 - ptr.y * 20, Math.cos(a) * 250);
    camera.lookAt(0, 6, 0);
  });
}

/* ------------------------------------------------------------------ */
/* Terrain: real elevation (project.terrain -> terrain.json with a    */
/* 16-bit RG heightmap and an aerial photo) drawn as photo-textured   */
/* relief with contour lines. Falls back to procedural ridges.        */
/* ------------------------------------------------------------------ */
async function loadHeights(url, n) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 65535;
  return out;
}

export async function terrainScene(host, { project, asset } = {}) {
  const { scene, camera, start, renderer } = stage(host, { fov: 38, far: 4000 });
  const S = 900, N = 255;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  let meta = null, heights = null, photo = null;
  if (project && project.terrain) {
    try {
      meta = await fetch(asset(project.terrain)).then((r) => r.json());
      const dir = project.terrain.replace(/[^/]+$/, "");
      heights = await loadHeights(asset(meta.heightmap || dir + "heightmap.png"), N + 1);
      if (meta.photo) photo = await new THREE.TextureLoader().loadAsync(asset(meta.photo));
    } catch (e) { console.warn("terrain data unavailable, using procedural relief", e); meta = heights = null; }
  }
  // vertical scale: true relief (mildly exaggerated) when real data is loaded
  const relief = meta ? ((meta.max_m - meta.min_m) / meta.size_m) * S * 1.25 : 190;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h;
    if (heights) {
      const gx = Math.round((x / S + 0.5) * N), gz = Math.round((z / S + 0.5) * N);
      h = heights[gz * (N + 1) + gx];
    } else {
      h = 1 - Math.abs(fbm(x * 0.0035 + 3.1, z * 0.0035 + 1.7) * 2 - 1);
      h = (h * h * 150 + fbm(x * 0.01, z * 0.01, 4) * 35) / 190;
      h *= 1 - 0.85 * Math.exp(-Math.pow((x + Math.sin(z * 0.006) * 80) / 95, 2));
    }
    pos.setY(i, h * relief - relief * 0.35);
  }
  geo.computeVertexNormals();
  if (photo) { photo.colorSpace = THREE.SRGBColorSpace; photo.anisotropy = renderer.capabilities.getMaxAnisotropy(); }

  // contour bands every 100 m for real data
  const spacing = meta ? (100 / (meta.max_m - meta.min_m)) * relief : 7;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, photo: { value: photo }, hasPhoto: { value: photo ? 1 : 0 },
      spacing: { value: spacing }, fogDensity: { value: 0.0011 },
    },
    vertexShader: `
      varying float vH; varying vec3 vN; varying float vDepth; varying vec2 vUv;
      void main(){ vH = position.y; vN = normal; vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float time; uniform float fogDensity; uniform float spacing; uniform sampler2D photo; uniform float hasPhoto;
      varying float vH; varying vec3 vN; varying float vDepth; varying vec2 vUv;
      float iso(float f, float w){ return 1.0 - smoothstep(0.0, w * 1.2, abs(fract(f) - 0.5) * 2.0 - (1.0 - w * 1.5)); }
      void main(){
        float f = vH / spacing;
        float w = fwidth(f);
        float line = iso(f, w);
        float major = iso(f / 5.0, w / 5.0);
        float lambert = clamp(dot(normalize(vN), normalize(vec3(-0.45, 0.75, 0.35))), 0.0, 1.0);
        vec3 base = vec3(0.05 + 0.1 * lambert);
        if (hasPhoto > 0.5) {
          vec3 ph = texture2D(photo, vUv).rgb;
          float g = dot(ph, vec3(0.299, 0.587, 0.114));
          base = mix(vec3(g), ph, 0.85) * (0.7 + 0.75 * lambert) * 1.15;
        }
        float scan = smoothstep(0.0, 1.0, 1.0 - abs(fract(vDepth * 0.0016 - time * 0.05) - 0.5) * 2.0);
        float lineAmt = hasPhoto > 0.5 ? 0.16 : 0.32;
        vec3 col = base + vec3(lineAmt) * line + vec3(lineAmt + 0.08) * major + vec3(0.16, 0.6, 1.0) * line * scan * 0.35;
        float fog = 1.0 - exp(-pow(fogDensity * vDepth, 2.0));
        gl_FragColor = vec4(mix(col, vec3(0.0), fog), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));

  if (meta && meta.label) {
    const tag = document.createElement("div");
    tag.className = "hero-ctl";
    tag.innerHTML = `<label><span>${meta.label}</span></label><div style="margin-top:6px;font-family:var(--mono);color:var(--text)">${(meta.size_m / 1000).toFixed(1)} km · ${Math.round(meta.min_m).toLocaleString()}–${Math.round(meta.max_m).toLocaleString()} m</div><div style="margin-top:4px">${meta.source || ""}</div>`;
    host.appendChild(tag);
  }

  // slow orbit around the centre, a little above the ridgeline
  start((t, ptr) => {
    mat.uniforms.time.value = t;
    const a = t * 0.025 + 0.6 + ptr.x * 0.25;
    const r = 620 - ptr.y * 40;
    camera.position.set(Math.sin(a) * r, relief * 1.4 + 360 - ptr.y * 50, Math.cos(a) * r);
    camera.lookAt(0, -relief * 0.15, 40);
  });
}

/* ------------------------------------------------------------------ */
/* Rollers: a two-high rolling stand thinning a glowing steel strip.  */
/* ------------------------------------------------------------------ */
export function rollersScene(host) {
  const { scene, camera, start, renderer } = stage(host, { fov: 30 });
  renderer.toneMappingExposure = 1.1;
  camera.position.set(9, 4.5, 11);
  camera.lookAt(0, 0, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const panel = (x, y, z, w, h, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(0, 10, 0, 14, 4, 4); panel(-10, 4, 6, 6, 8, 1.6); panel(10, 2, -6, 6, 6, 0.8);
  scene.environment = pm.fromScene(env, 0.04).texture;

  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.5 });
  const R = 1.25, L = 5.2;
  const rollGeo = new THREE.CylinderGeometry(R, R, L, 96, 1);
  rollGeo.rotateX(Math.PI / 2);
  const top = new THREE.Mesh(rollGeo, steel), bot = new THREE.Mesh(rollGeo, steel);
  const gap = 0.18;
  top.position.y = R + gap / 2; bot.position.y = -R - gap / 2;
  // grooves so rotation reads
  const ringGeo = new THREE.TorusGeometry(R + 0.005, 0.012, 8, 96);
  [top, bot].forEach((roll) => {
    for (let k = -2; k <= 2; k++) { const ring = new THREE.Mesh(ringGeo, dark); ring.position.z = k * 1.05; roll.add(ring); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, L * 0.98), dark);
    stripe.position.y = R; roll.add(stripe);
    scene.add(roll);
  });
  // housings
  const housing = new THREE.BoxGeometry(1.2, 6.4, 0.5);
  [-1, 1].forEach((sgn) => { const h = new THREE.Mesh(housing, dark); h.position.set(0, 0, sgn * (L / 2 + 0.3)); scene.add(h); });

  // strip: bare aluminium enters thick (-x) and leaves thin (+x), painted with the peak
  // pressure each point felt in the bite (the twin's heat map), which moves with the metal
  const surf = R * 1.3;
  const stripMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, speed: { value: surf } },
    vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float time; uniform float speed; varying vec3 vP; varying vec3 vN;
      vec3 cmap(float t){
        t = clamp(t, 0.0, 1.0);
        vec3 a = vec3(0.106, 0.043, 0.227), b = vec3(0.55, 0.12, 0.62), c = vec3(0.93, 0.36, 0.16), d = vec3(1.0, 0.86, 0.32);
        return t < 0.4 ? mix(a, b, t / 0.4) : t < 0.75 ? mix(b, c, (t - 0.4) / 0.35) : mix(c, d, (t - 0.75) / 0.25);
      }
      void main(){
        float lambert = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(0.3, 1.0, 0.45))), 0.0);
        float spec = pow(max(dot(normalize(vN), normalize(vec3(-0.2, 1.0, 0.2))), 0.0), 40.0);
        vec3 alu = vec3(0.72, 0.74, 0.77) * lambert + spec * 0.5;
        float u = vP.x - time * speed;                       // material coordinate
        float edge = pow(abs(vP.z) / 2.1, 4.0);
        float p = 0.82 - 0.3 * edge + 0.07 * sin(u * 2.3) + 0.04 * sin(u * 5.1 + vP.z * 2.0);
        float painted = smoothstep(-0.2, 0.5, vP.x);
        float hill = exp(-vP.x * vP.x / 0.06);               // friction hill in the bite
        vec3 heat = cmap(p) * (0.75 + 0.35 * lambert) + spec * 0.2;
        vec3 col = mix(alu, heat, painted);
        col += cmap(0.95) * hill * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const stripGeo = new THREE.BoxGeometry(18, 1, 4.2, 160, 1, 8);
  const sp = stripGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    const th = THREE.MathUtils.lerp(0.42, gap, THREE.MathUtils.smoothstep(x, -0.6, 0.6));
    sp.setY(i, y * th);
  }
  stripGeo.computeVertexNormals();
  const strip = new THREE.Mesh(stripGeo, stripMat);
  scene.add(strip);

  start((t, ptr) => {
    top.rotation.z = t * 1.3; bot.rotation.z = -t * 1.3;
    stripMat.uniforms.time.value = t;
    const a = 0.65 + ptr.x * 0.25 + Math.sin(t * 0.1) * 0.12;
    const d = 14 / Math.min(1, camera.aspect * 0.75);   // back off on tall screens
    camera.position.set(Math.sin(a) * d, 4.2 - ptr.y * 1.5, Math.cos(a) * d);
    camera.lookAt(0, -0.3, 0);
  });
}

/* ------------------------------------------------------------------ */
/* Plankton: a drifting field of luminous cells. If project.models    */
/* lists GLB files (Amir's own diatom exports), they float in front   */
/* as slowly turning glass-like specimens.                            */
/* ------------------------------------------------------------------ */
export async function planktonScene(host, { project, asset } = {}) {
  const { scene, camera, start, renderer } = stage(host, { fov: 45, far: 600 });
  renderer.toneMappingExposure = 1.1;
  camera.position.set(0, 0, 90);
  const COUNT = 9000;
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(COUNT * 3), S = new Float32Array(COUNT), K = new Float32Array(COUNT);
  const r = rand(11);
  for (let i = 0; i < COUNT; i++) {
    P[i * 3] = (r() - 0.5) * 220; P[i * 3 + 1] = (r() - 0.5) * 130; P[i * 3 + 2] = (r() - 0.5) * 140 - 20;
    S[i] = Math.pow(r(), 6) * 9 + 1.2; K[i] = r();
  }
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setAttribute("size", new THREE.BufferAttribute(S, 1));
  g.setAttribute("kind", new THREE.BufferAttribute(K, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, dpr: { value: renderer.getPixelRatio() } },
    vertexShader: `
      uniform float time; uniform float dpr; attribute float size; attribute float kind; varying float vK; varying float vA;
      vec3 flow(vec3 p){
        return vec3(sin(p.y*0.035+time*0.21)+cos(p.z*0.03+time*0.17), sin(p.z*0.03+time*0.19)+cos(p.x*0.025-time*0.15), sin(p.x*0.03+time*0.13));
      }
      void main(){
        vec3 p = position;
        p.x = mod(p.x + time * 2.2 + 110.0, 220.0) - 110.0;
        p += flow(p) * 6.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * dpr * (90.0 / -mv.z);
        vK = kind;
        vA = smoothstep(260.0, 40.0, -mv.z) * (0.6 + 0.4 * sin(time * (0.5 + kind) + kind * 40.0));
      }`,
    fragmentShader: `
      varying float vK; varying float vA;
      void main(){
        vec2 c = gl_PointCoord * 2.0 - 1.0; float d = length(c);
        if (d > 1.0) discard;
        float core = smoothstep(1.0, 0.0, d);
        float ring = smoothstep(0.75, 0.9, d) * smoothstep(1.0, 0.92, d);
        vec3 col = mix(vec3(0.45, 0.95, 0.75), vec3(0.55, 0.8, 1.0), vK);
        gl_FragColor = vec4(col * (core * core * 0.7 + ring * 0.6), vA * 0.9);
      }`,
  });
  scene.add(new THREE.Points(g, mat));

  // optional specimens
  const specimens = [];
  const models = (project && project.models) || [];
  if (models.length) {
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.add(new THREE.DirectionalLight(0xbff6ff, 2.5).translateX(-30).translateY(40).translateZ(60));
      // silica-like shell: bright, slightly translucent, iridescent; no transmission pass
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0xd6f8ff, metalness: 0.05, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15,
        iridescence: 0.6, iridescenceIOR: 1.4, sheen: 0.8, sheenColor: new THREE.Color(0x7fffe0),
        emissive: new THREE.Color(0x2aa6a0), emissiveIntensity: 0.35, transparent: true, opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const loader = new GLTFLoader();
      const layout = [[-34, 6, 10], [30, -8, 0], [6, 14, -30]];
      const loaded = await Promise.all(models.slice(0, 3).map((m) => loader.loadAsync(asset(m)).catch(() => null)));
      loaded.forEach((gltf, i) => {
        if (!gltf) return;
        const obj = gltf.scene;
        // drop the exporter's glow helper shells; everything else becomes glass
        const helpers = [];
        obj.traverse((o) => { if (o.isMesh) { if (/glow|fresnel/i.test(o.name + " " + (o.material && o.material.name))) helpers.push(o); else o.material = glass; } });
        helpers.forEach((h) => h.removeFromParent());
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);
        const pivot = new THREE.Group();
        pivot.add(obj);
        const s = (i === 0 ? 34 : 24) / size;
        pivot.scale.setScalar(s);
        pivot.position.fromArray(layout[i]);
        pivot.userData.base = pivot.position.clone();
        pivot.userData.seed = i * 1.7;
        scene.add(pivot);
        specimens.push(pivot);
      });
    } catch (e) { console.warn("diatom models unavailable", e); }
  }

  start((t, ptr) => {
    mat.uniforms.time.value = t;
    for (const p of specimens) {
      const s = p.userData.seed;
      p.rotation.x = t * 0.11 + s; p.rotation.y = t * 0.17 + s * 2.0;
      p.position.y = p.userData.base.y + Math.sin(t * 0.4 + s) * 2.5;
    }
    camera.position.x = ptr.x * 10; camera.position.y = -ptr.y * 6;
    camera.lookAt(0, 0, 0);
  });
}

export const SCENES = { sun: sunScene, terrain: terrainScene, rollers: rollersScene, plankton: planktonScene };
