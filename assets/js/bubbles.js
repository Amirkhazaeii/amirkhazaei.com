// Home page: a floating circle packing of projects, drawn with Three.js.
// Each project is a bubble textured with its cover image. Small empty "foam" cells fill the
// leftover space, so the field looks full with 3 projects or 30. A power-diagram (weighted
// Voronoi) of every bubble is drawn faintly behind them and moves as they float.
import * as THREE from "three";
import { loadSite, projectUrl, asset, esc, statusLabel, byRecent } from "./data.js";

const MAX_CELLS = 72;           // must match the shader array size
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const bubbleVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const bubbleFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map;
  uniform float hasMap;
  uniform vec2 cover;        // scales uv so the image covers the circle without stretching
  uniform float hover;       // 0..1
  uniform float dim;         // 0..1, filtered out
  uniform float appear;      // 0..1 intro
  uniform float isFoam;
  uniform float time;
  uniform float seed;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float aa = fwidth(d) * 1.4;
    float mask = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    if (mask <= 0.0) discard;

    float z = sqrt(max(0.0, 1.0 - d * d));
    vec3 col;
    if (isFoam > 0.5) {
      // dark glass cell
      col = mix(vec3(0.075), vec3(0.025), smoothstep(-0.6, 1.0, d));
      col += vec3(0.04) * pow(1.0 - z, 3.0);
    } else {
      // slight lens bulge, zoom a touch on hover
      vec2 q = p * mix(0.86, 1.0, z) * (1.0 - 0.07 * hover);
      q += vec2(sin(time * 0.25 + seed), cos(time * 0.21 + seed * 1.7)) * 0.015;
      vec2 uv = q * 0.5 * cover + 0.5;
      uv.y = 1.0 - uv.y;          // the y-down camera mirrors the quad vertically
      vec3 img = hasMap > 0.5 ? texture2D(map, uv).rgb : vec3(0.12);
      float g = dot(img, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(g), img, mix(0.55, 1.05, hover));
      col *= mix(1.0, 1.12, hover);
      // darken toward the rim and behind the title so it stays legible
      col *= mix(1.0, 0.55, smoothstep(0.55, 1.0, d));
      col *= mix(1.0, 0.78, exp(-pow(p.y * 2.4, 2.0)) * (1.0 - hover * 0.5));
    }
    // fresnel rim and a soft specular highlight
    float rim = smoothstep(0.93, 1.0, d);
    col += rim * mix(isFoam > 0.5 ? 0.06 : 0.14, 0.55, hover);
    col += exp(-7.0 * length(p - vec2(-0.38, -0.46))) * (isFoam > 0.5 ? 0.025 : 0.06);
    col *= mix(1.0, 0.22, dim);
    gl_FragColor = vec4(col, mask * appear);
  }
`;

const voronoiFrag = /* glsl */ `
  precision highp float;
  uniform vec3 cells[${MAX_CELLS}];   // x, y (device px, origin bottom-left), radius
  uniform int count;
  uniform vec2 mouse;
  uniform vec2 res;
  uniform float dpr;
  void main() {
    vec2 x = gl_FragCoord.xy;
    float p1 = 1e20, p2 = 1e20;
    vec2 c1 = vec2(0.0), c2 = vec2(0.0);
    for (int i = 0; i < ${MAX_CELLS}; i++) {
      if (i >= count) break;
      vec3 c = cells[i];
      vec2 dv = x - c.xy;
      float pd = dot(dv, dv) - c.z * c.z;       // power distance
      if (pd < p1) { p2 = p1; c2 = c1; p1 = pd; c1 = c.xy; }
      else if (pd < p2) { p2 = pd; c2 = c.xy; }
    }
    // exact distance to the power-diagram bisector between the two closest cells
    float edge = (p2 - p1) / (2.0 * max(length(c2 - c1), 1.0));
    float line = 1.0 - smoothstep(0.0, 1.1 * dpr, edge);
    float m = length(x - mouse) / (420.0 * dpr);
    float glow = exp(-m * m * 2.5);
    vec2 uv = x / res;
    vec3 bg = mix(vec3(0.0), vec3(0.035, 0.035, 0.04), exp(-pow(length(uv - vec2(0.5, 0.55)) * 1.6, 2.0)));
    vec3 col = bg + vec3(line) * (0.055 + 0.22 * glow) + vec3(0.02) * glow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

export async function initHome() {
  const site = await loadSite();
  const projects = site.projects.slice().sort(byRecent);
  const stage = document.querySelector(".home-stage");
  const canvas = document.getElementById("field");
  const labelsEl = document.querySelector(".labels");
  const card = document.querySelector(".hover-card");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    stage.classList.add("no-webgl");
    return;
  }
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

  // ---------- background power diagram ----------
  const cellsU = Array.from({ length: MAX_CELLS }, () => new THREE.Vector3());
  const bgMat = new THREE.ShaderMaterial({
    fragmentShader: voronoiFrag,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    uniforms: { cells: { value: cellsU }, count: { value: 0 }, mouse: { value: new THREE.Vector2(-1e4, -1e4) }, res: { value: new THREE.Vector2(1, 1) }, dpr: { value: 1 } },
    depthTest: false, depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);

  // ---------- bubbles ----------
  const loader = new THREE.TextureLoader();
  const geo = new THREE.PlaneGeometry(1, 1);
  const bubbles = [];

  function makeBubble(project, i) {
    const mat = new THREE.ShaderMaterial({
      // y-down ortho camera flips winding, so draw both sides
      vertexShader: bubbleVert, fragmentShader: bubbleFrag, transparent: true, depthTest: false, side: THREE.DoubleSide,
      uniforms: {
        map: { value: null }, hasMap: { value: 0 }, cover: { value: new THREE.Vector2(1, 1) },
        hover: { value: 0 }, dim: { value: 0 }, appear: { value: 0 }, isFoam: { value: project ? 0 : 1 },
        time: { value: 0 }, seed: { value: hash(i + 1) * 6.28 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // the y-down camera inverts the frustum planes
    scene.add(mesh);
    const b = {
      project, mesh, mat, i,
      x: 0, y: 0, vx: 0, vy: 0, r: 10, rBase: 10, rCur: 0,
      hover: 0, dim: 0, appear: 0, delay: project ? 0.15 + i * 0.12 : 0.5 + hash(i * 3.3) * 0.9,
      phase: hash(i * 7.1) * 6.28, phase2: hash(i * 2.9) * 6.28, label: null,
    };
    if (project && project.cover) {
      loader.load(asset(project.cover), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const a = tex.image.width / tex.image.height;
        mat.uniforms.cover.value.set(a > 1 ? 1 / a : 1, a > 1 ? 1 : a);
        mat.uniforms.map.value = tex;
        mat.uniforms.hasMap.value = 1;
      });
    }
    if (project) {
      const el = document.createElement("div");
      el.className = "blabel";
      el.innerHTML = `<span class="t">${esc(project.short || project.title)}</span><span class="s">${esc(project.theme || "")}</span>`;
      labelsEl.appendChild(el);
      b.label = el;
    }
    return b;
  }

  projects.forEach((p, i) => bubbles.push(makeBubble(p, i)));
  const nProj = bubbles.length;
  // foam cells; how many are visible depends on the leftover space (see layout)
  const FOAM_MAX = Math.min(MAX_CELLS - nProj, 46);
  for (let k = 0; k < FOAM_MAX; k++) bubbles.push(makeBubble(null, nProj + k));

  // ---------- layout ----------
  let W = 1, H = 1, dpr = 1, region = { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 };
  function layout(initial) {
    W = stage.clientWidth; H = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;
    camera.updateProjectionMatrix();
    bgMat.uniforms.res.value.set(W * dpr, H * dpr);
    bgMat.uniforms.dpr.value = dpr;

    const mobile = W < 700;
    // keep the bubbles clear of the intro text at the bottom, whatever its height
    const intro = stage.querySelector(".home-intro .wrap");
    const top = 76, bottom = (intro ? intro.offsetHeight : 120) + 44;
    region = { x: 16, y: top, w: W - 32, h: Math.max(240, H - top - bottom) };
    region.cx = region.x + region.w / 2;
    region.cy = region.y + region.h / 2;
    const area = region.w * region.h;

    // project bubbles share ~40% of the area, weighted; never wider than ~60% of the short side
    const weights = projects.map((p) => p.weight || 1);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const fill = mobile ? 0.36 : 0.4;
    const rMax = Math.min(region.w, region.h) * (nProj <= 2 ? 0.34 : 0.3);
    projects.forEach((p, i) => {
      const r = Math.sqrt((fill * area * weights[i]) / (wsum * Math.PI));
      bubbles[i].rBase = Math.min(r, rMax);
    });
    const rMean = bubbles.slice(0, nProj).reduce((a, b) => a + b.rBase, 0) / Math.max(1, nProj);

    // foam fills the space up to ~70% coverage, smaller as projects get smaller
    let used = bubbles.slice(0, nProj).reduce((a, b) => a + Math.PI * b.rBase * b.rBase, 0);
    const target = area * (mobile ? 0.6 : 0.68);
    for (let k = nProj; k < bubbles.length; k++) {
      const b = bubbles[k];
      const r = rMean * (0.16 + 0.34 * Math.pow(hash(k * 5.7), 1.6));
      b.rBase = r;
      b.active = used < target;
      if (b.active) used += Math.PI * r * r;
    }
    for (let k = 0; k < nProj; k++) bubbles[k].active = true;

    if (initial) {
      // golden-angle spiral: biggest bubbles in the middle
      const order = bubbles.filter((b) => b.active).sort((a, b) => b.rBase - a.rBase);
      const ga = Math.PI * (3 - Math.sqrt(5));
      order.forEach((b, j) => {
        const rr = Math.sqrt(j + 0.5) * rMean * 0.9;
        b.x = region.cx + Math.cos(j * ga) * rr * (region.w / region.h > 1 ? 1.4 : 0.8);
        b.y = region.cy + Math.sin(j * ga) * rr * 0.8;
      });
    }
  }

  // ---------- interaction ----------
  let mouse = { x: -1e4, y: -1e4, inside: false };
  let hovered = null;
  let filter = "all";

  function pick(x, y) {
    for (let k = 0; k < nProj; k++) {
      const b = bubbles[k];
      if (b.dim > 0.5) continue;
      if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.rCur ** 2) return b;
    }
    return null;
  }
  function setHover(b) {
    if (b === hovered) return;
    hovered = b;
    canvas.style.cursor = b ? "pointer" : "default";
    if (card) {
      if (b) {
        const p = b.project;
        card.querySelector(".meta").innerHTML = `<span>${esc(p.theme || "")}</span><span class="status ${p.status === "ongoing" ? "ongoing" : ""}">${esc(statusLabel(p))} · ${esc(p.year || "")}</span>`;
        card.querySelector("h3").textContent = p.title;
        card.querySelector("p").textContent = p.tagline || "";
      }
      card.classList.toggle("on", !!b);
    }
  }
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
    if (e.pointerType === "mouse") setHover(pick(mouse.x, mouse.y));
  });
  canvas.addEventListener("pointerleave", () => { mouse.inside = false; mouse.x = mouse.y = -1e4; setHover(null); });
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const b = pick(e.clientX - r.left, e.clientY - r.top);
    if (b) window.location.href = projectUrl(b.project);
  });

  // theme filter chips
  const filtersEl = document.querySelector(".filters");
  if (filtersEl) {
    const themes = [...new Set(projects.map((p) => p.theme).filter(Boolean))];
    filtersEl.innerHTML = ["All", ...themes]
      .map((t, i) => `<button class="chip" type="button" aria-pressed="${i === 0}" data-theme="${esc(i === 0 ? "all" : t)}">${esc(t)}</button>`)
      .join("");
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      filter = btn.dataset.theme;
      filtersEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    });
  }

  // ---------- simulation ----------
  function step(dt, t) {
    const active = bubbles.filter((b) => b.active);
    const aspect = region.w / region.h;
    const kx = 0.0016 / Math.max(1, aspect * 0.8), ky = 0.0022 * Math.max(1, aspect * 0.55);
    const drift = REDUCED ? 0 : 0.035;

    for (const b of active) {
      const isP = !!b.project;
      const hoverTarget = b === hovered ? 1 : 0;
      b.hover += (hoverTarget - b.hover) * Math.min(1, dt * 8);
      const dimTarget = isP && filter !== "all" && b.project.theme !== filter ? 1 : 0;
      b.dim += (dimTarget - b.dim) * Math.min(1, dt * 6);
      const grow = isP ? 1 + 0.09 * b.hover - 0.12 * b.dim : (hovered ? 0.94 : 1);
      const rT = b.rBase * grow;
      b.rCur += (rT - b.rCur) * Math.min(1, dt * 6);

      const g = isP ? 1 : 0.7;
      b.vx += (region.cx - b.x) * kx * g * dt * 60;
      b.vy += (region.cy - b.y) * ky * g * dt * 60;
      b.vx += Math.sin(t * 0.31 + b.phase) * drift * dt * 60;
      b.vy += Math.cos(t * 0.27 + b.phase2) * drift * dt * 60;

      if (mouse.inside && !hovered && !REDUCED) {
        const dx = b.x - mouse.x, dy = b.y - mouse.y, d2 = dx * dx + dy * dy, R = 140;
        if (d2 < R * R && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / R) * 0.35;
          b.vx += (dx / d) * f; b.vy += (dy / d) * f;
        }
      }
    }
    for (const b of active) {
      b.vx *= Math.pow(0.9, dt * 60); b.vy *= Math.pow(0.9, dt * 60);
      b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
    }
    // collision relaxation
    const gap = 5;
    for (let it = 0; it < 3; it++) {
      for (let a = 0; a < active.length; a++) {
        const A = active[a];
        for (let c = a + 1; c < active.length; c++) {
          const B = active[c];
          const dx = B.x - A.x, dy = B.y - A.y;
          const min = A.rCur + B.rCur + gap;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const over = (min - d) / d;
          const mA = A.project ? 3 : 1, mB = B.project ? 3 : 1;
          const wA = mB / (mA + mB), wB = mA / (mA + mB);
          A.x -= dx * over * wA * 0.5; A.y -= dy * over * wA * 0.5;
          B.x += dx * over * wB * 0.5; B.y += dy * over * wB * 0.5;
        }
      }
    }
    // soft walls
    for (const b of active) {
      const l = region.x + b.rCur, r = region.x + region.w - b.rCur, tp = region.y + b.rCur, bt = region.y + region.h - b.rCur;
      if (b.x < l) b.vx += (l - b.x) * 0.02; if (b.x > r) b.vx -= (b.x - r) * 0.02;
      if (b.y < tp) b.vy += (tp - b.y) * 0.02; if (b.y > bt) b.vy -= (b.y - bt) * 0.02;
    }
  }

  function draw(t) {
    let n = 0;
    for (const b of bubbles) {
      const show = b.active && t > b.delay;
      b.appear += ((show ? 1 : 0) - b.appear) * 0.06;
      b.mesh.visible = b.appear > 0.003;
      const s = 2 * b.rCur * (0.6 + 0.4 * easeOut(b.appear));
      b.mesh.position.set(b.x, b.y, b.project ? 1 : 0);
      b.mesh.scale.set(s, s, 1);
      const u = b.mat.uniforms;
      u.hover.value = b.hover; u.dim.value = b.dim; u.appear.value = b.appear; u.time.value = t;
      if (b.active && n < MAX_CELLS) {
        cellsU[n++].set(b.x * dpr, (H - b.y) * dpr, b.rCur * dpr * (0.6 + 0.4 * b.appear));
      }
      if (b.label) {
        const big = b.rCur > 74;
        const fs = Math.max(15, Math.min(34, b.rCur * 0.15));
        b.label.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
        b.label.style.width = `${b.rCur * 1.5}px`;
        b.label.querySelector(".t").style.fontSize = fs + "px";
        b.label.style.opacity = String(b.appear * (1 - b.dim * 0.85) * (big || b.hover > 0.5 ? 1 : 0));
      }
    }
    bgMat.uniforms.count.value = n;
    bgMat.uniforms.mouse.value.set(mouse.x * dpr, (H - mouse.y) * dpr);
    renderer.render(scene, camera);
  }
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // ---------- loop ----------
  layout(true);
  let last = performance.now(), t0 = last, running = true;
  // let the packing settle before the first frame so bubbles don't fly in from overlap
  for (let i = 0; i < 160; i++) step(1 / 60, i / 60);
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    step(dt, t);
    draw(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  new ResizeObserver(() => layout(false)).observe(stage);
  // pause when the stage scrolls out of view
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(stage);
}
