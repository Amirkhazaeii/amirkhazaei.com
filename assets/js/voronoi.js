// Home page: a floating Voronoi field drawn by one Three.js shader.
// Every project is a cell filled with its cover image; dark cells tile the rest of the
// screen. Seeds drift and push each other apart, so the cells keep reshaping. Cells are
// weighted (a power diagram), so a project's cell is larger than the filler cells around
// it, and a hovered cell grows into its neighbours. Adding a project adds a cell.
import * as THREE from "three";
import { loadSite, projectUrl, asset, esc, statusLabel, byRecent } from "./data.js";

const MAX_CELLS = 96;           // must match the shader arrays
// Share of each seed's radius used as its power-diagram weight. Lower = straighter,
// more angular Voronoi cells; 1.0 would make big cells nearly round.
const POWER = 0.72;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const fieldFrag = /* glsl */ `
  precision highp float;
  uniform vec3 cells[${MAX_CELLS}];   // x, y (device px, origin bottom-left), weight radius
  uniform vec4 info[${MAX_CELLS}];    // atlas tile (-1 = filler), hover, dim, appear
  uniform int count;
  uniform sampler2D atlas;
  uniform vec2 grid;                  // atlas columns, rows
  uniform vec2 mouse;
  uniform vec2 res;
  uniform float dpr;
  uniform float time;

  vec3 sampleTile(float tile, vec2 uv) {
    float col = mod(tile, grid.x);
    float row = floor(tile / grid.x);
    uv = clamp(uv, 0.002, 0.998);
    return texture2D(atlas, vec2((col + uv.x) / grid.x, 1.0 - (row + 1.0 - uv.y) / grid.y)).rgb;
  }

  void main() {
    vec2 x = gl_FragCoord.xy;
    float p1 = 1e20, p2 = 1e20;
    vec3 c1 = vec3(0.0), c2 = vec3(0.0);
    vec4 i1 = vec4(-1.0, 0.0, 0.0, 0.0);
    for (int i = 0; i < ${MAX_CELLS}; i++) {
      if (i >= count) break;
      vec3 c = cells[i];
      vec2 dv = x - c.xy;
      float pd = dot(dv, dv) - c.z * c.z;
      if (pd < p1) { p2 = p1; c2 = c1; p1 = pd; c1 = c; i1 = info[i]; }
      else if (pd < p2) { p2 = pd; c2 = c; }
    }
    // distance (px) from this pixel to the edge shared with the nearest neighbour
    float edge = (p2 - p1) / (2.0 * max(length(c2.xy - c1.xy), 1.0));
    float gap = 2.0 * dpr;
    float inside = smoothstep(gap, gap + 1.2 * dpr, edge);

    float m = length(x - mouse) / (460.0 * dpr);
    float glow = exp(-m * m * 2.2);
    vec2 uv0 = x / res;

    vec3 col;
    float hover = i1.y, dim = i1.z, appear = i1.w;
    if (i1.x >= 0.0) {
      // project cell: the cover image, centred on the seed and scaled to the cell
      vec2 local = (x - c1.xy) / (c1.z * 3.4) * (1.0 - 0.06 * hover);
      local += vec2(sin(time * 0.2 + i1.x), cos(time * 0.17 + i1.x * 1.3)) * 0.01;
      vec3 img = sampleTile(i1.x, local + 0.5);
      float g = dot(img, vec3(0.299, 0.587, 0.114));
      vec3 mono = vec3(g);
      img = mix(mono, img, mix(0.5, 1.05, hover)) * mix(0.95, 1.12, hover);
      // shade toward the cell edge for depth, and behind the label
      img *= mix(0.55, 1.0, smoothstep(0.0, 60.0 * dpr, edge));
      img *= mix(1.0, 0.72, exp(-pow(length(x - c1.xy) / (c1.z * 0.75), 2.0)) * (1.0 - 0.5 * hover));
      vec3 empty = vec3(0.06);
      col = mix(empty, img, appear);
      col *= mix(1.0, 0.22, dim);
      // inner rim
      float rim = 1.0 - smoothstep(gap, gap + 2.5 * dpr, edge);
      col += rim * mix(0.12, 0.6, hover) * appear;
    } else {
      // filler cell: dark glass, lit faintly toward its seed and by the cursor
      float d = length(x - c1.xy) / max(c1.z, 1.0);
      col = mix(vec3(0.055), vec3(0.028), smoothstep(0.0, 1.6, d));
      col += vec3(0.05) * glow;
      float rim = 1.0 - smoothstep(gap, gap + 2.0 * dpr, edge);
      col += rim * (0.05 + 0.18 * glow);
      col *= mix(1.0, 0.7, smoothstep(0.35, 1.0, length(uv0 - vec2(0.5, 0.55)) * 1.2));
    }
    col = mix(vec3(0.0), col, inside);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

// Pack every project cover into one square-tiled texture (shaders can't index a sampler array).
function buildAtlas(projects, onUpdate) {
  const n = Math.max(1, projects.length);
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const T = Math.min(768, Math.floor(4096 / Math.max(cols, rows)));
  const canvas = document.createElement("canvas");
  canvas.width = cols * T; canvas.height = rows * T;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f0f10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  projects.forEach((p, i) => {
    if (!p.cover) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, (i % cols) * T, Math.floor(i / cols) * T, T, T);
      tex.needsUpdate = true;
      onUpdate(i);
    };
    img.src = asset(p.cover);
  });
  return { tex, cols, rows };
}

export async function initHome() {
  const site = await loadSite();
  const projects = site.projects.slice().sort(byRecent);
  const stage = document.querySelector(".home-stage");
  const canvas = document.getElementById("field");
  const labelsEl = document.querySelector(".labels");
  const card = document.querySelector(".hover-card");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch (e) {
    stage.classList.add("no-webgl");
    return;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const loaded = new Set();
  const atlas = buildAtlas(projects, (i) => loaded.add(i));
  const cellsU = Array.from({ length: MAX_CELLS }, () => new THREE.Vector3());
  const infoU = Array.from({ length: MAX_CELLS }, () => new THREE.Vector4(-1, 0, 0, 0));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: fieldFrag,
    uniforms: {
      cells: { value: cellsU }, info: { value: infoU }, count: { value: 0 },
      atlas: { value: atlas.tex }, grid: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
      mouse: { value: new THREE.Vector2(-1e4, -1e4) }, res: { value: new THREE.Vector2(1, 1) },
      dpr: { value: 1 }, time: { value: 0 },
    },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);

  // ---------- seeds ----------
  const nProj = projects.length;
  const seeds = [];
  projects.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "blabel";
    el.innerHTML = `<span class="t">${esc(p.short || p.title)}</span><span class="s">${esc(p.theme || "")}</span>`;
    labelsEl.appendChild(el);
    seeds.push({ project: p, tile: i, label: el, x: 0, y: 0, vx: 0, vy: 0, r: 0, rBase: 0, hover: 0, dim: 0, appear: 0,
      delay: 0.2 + i * 0.15, phase: hash(i * 7.1) * 6.28, phase2: hash(i * 2.9) * 6.28 });
  });
  for (let k = 0; k < MAX_CELLS - nProj; k++) {
    seeds.push({ project: null, x: 0, y: 0, vx: 0, vy: 0, r: 0, rBase: 0, hover: 0, dim: 0, appear: 1,
      phase: hash((k + 40) * 7.1) * 6.28, phase2: hash((k + 40) * 2.9) * 6.28, active: false });
  }

  // ---------- layout ----------
  let W = 1, H = 1, dpr = 1, region = { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 }, fillerR = 40;
  function layout(initial) {
    W = stage.clientWidth; H = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    mat.uniforms.res.value.set(W * dpr, H * dpr);
    mat.uniforms.dpr.value = dpr;

    // projects float above the intro text; filler cells cover the whole screen
    const intro = stage.querySelector(".home-intro .wrap");
    const top = 80, bottom = (intro ? intro.offsetHeight : 120) + 40;
    region = { x: 20, y: top, w: W - 40, h: Math.max(220, H - top - bottom) };
    region.cx = region.x + region.w / 2;
    region.cy = region.y + region.h / 2;

    const weights = projects.map((p) => p.weight || 1);
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const area = region.w * region.h;
    const fill = W < 700 ? 0.5 : 0.46;
    const rMax = Math.min(region.w, region.h) * (nProj <= 2 ? 0.36 : 0.3);
    projects.forEach((p, i) => {
      seeds[i].rBase = Math.min(rMax, Math.sqrt((fill * area * weights[i]) / (wsum * Math.PI)));
    });
    const rMean = seeds.slice(0, nProj).reduce((a, s) => a + s.rBase, 0) / Math.max(1, nProj) || 120;

    // enough filler cells to tile the screen at roughly a third of a project cell's size
    fillerR = Math.max(34, rMean * 0.55);
    const want = Math.round((W * H * 0.9) / (Math.PI * fillerR * fillerR * 1.6));
    const nFill = Math.max(8, Math.min(MAX_CELLS - nProj, want));
    for (let k = nProj; k < seeds.length; k++) {
      const s = seeds[k];
      s.active = k - nProj < nFill;
      s.rBase = fillerR * (0.75 + 0.5 * hash(k * 5.7));
      if (initial || (s.active && s.x === 0 && s.y === 0)) {
        s.x = 10 + hash(k * 3.1) * (W - 20);
        s.y = 10 + hash(k * 9.7) * (H - 20);
      }
    }
    for (let k = 0; k < nProj; k++) seeds[k].active = true;

    if (initial) {
      const ga = Math.PI * (3 - Math.sqrt(5));
      seeds.slice(0, nProj).forEach((s, j) => {
        const rr = Math.sqrt(j + 0.5) * rMean * 0.9;
        s.x = region.cx + Math.cos(j * ga) * rr * (region.w / region.h > 1 ? 1.4 : 0.8);
        s.y = region.cy + Math.sin(j * ga) * rr * 0.8;
      });
    }
  }

  // ---------- interaction ----------
  const mouse = { x: -1e4, y: -1e4, inside: false };
  let hovered = null, filter = "all";

  // the cell under a point: smallest power distance, same rule as the shader
  function pick(x, y) {
    let best = null, bd = Infinity;
    for (const s of seeds) {
      if (!s.active) continue;
      const d = (x - s.x) ** 2 + (y - s.y) ** 2 - (s.r * POWER) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best && best.project && best.dim < 0.5 && best.appear > 0.5 ? best : null;
  }
  function setHover(s) {
    if (s === hovered) return;
    hovered = s;
    canvas.style.cursor = s ? "pointer" : "default";
    if (!card) return;
    if (s) {
      const p = s.project;
      card.querySelector(".meta").innerHTML = `<span>${esc(p.theme || "")}</span><span class="status ${p.status === "ongoing" ? "ongoing" : ""}">${esc(statusLabel(p))} · ${esc(p.year || "")}</span>`;
      card.querySelector("h3").textContent = p.title;
      card.querySelector("p").textContent = p.tagline || "";
    }
    card.classList.toggle("on", !!s);
  }
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointermove", (e) => {
    [mouse.x, mouse.y] = local(e); mouse.inside = true;
    if (e.pointerType === "mouse") setHover(pick(mouse.x, mouse.y));
  });
  canvas.addEventListener("pointerleave", () => { mouse.inside = false; mouse.x = mouse.y = -1e4; setHover(null); });
  canvas.addEventListener("click", (e) => {
    const s = pick(...local(e));
    if (s) window.location.href = projectUrl(s.project);
  });

  const filtersEl = document.querySelector(".filters");
  if (filtersEl) {
    const themes = [...new Set(projects.map((p) => p.theme).filter(Boolean))];
    filtersEl.innerHTML = ["All", ...themes]
      .map((t, i) => `<button class="chip" type="button" aria-pressed="${i === 0}" data-theme="${esc(i === 0 ? "all" : t)}">${esc(t)}</button>`)
      .join("");
    filtersEl.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      filter = b.dataset.theme;
      filtersEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    });
  }

  // ---------- simulation ----------
  function step(dt, t) {
    const k = dt * 60;
    const active = seeds.filter((s) => s.active);
    const drift = REDUCED ? 0 : 0.03;
    for (const s of active) {
      if (s.project) {
        s.hover += ((s === hovered ? 1 : 0) - s.hover) * Math.min(1, dt * 7);
        const dimT = filter !== "all" && s.project.theme !== filter ? 1 : 0;
        s.dim += (dimT - s.dim) * Math.min(1, dt * 6);
        const target = s.rBase * (1 + 0.16 * s.hover - 0.15 * s.dim);
        s.r += (target - s.r) * Math.min(1, dt * 5);
        const aspect = region.w / region.h;
        s.vx += (region.cx - s.x) * (0.0014 / Math.max(1, aspect * 0.8)) * k;
        s.vy += (region.cy - s.y) * 0.002 * k;
      } else {
        s.r += (s.rBase * (hovered ? 0.92 : 1) - s.r) * Math.min(1, dt * 4);
        // gentle pull toward the middle keeps fillers spread without drifting off-screen
        s.vx += (W / 2 - s.x) * 0.00006 * k;
        s.vy += (H / 2 - s.y) * 0.00006 * k;
      }
      s.vx += Math.sin(t * 0.29 + s.phase) * drift * k;
      s.vy += Math.cos(t * 0.23 + s.phase2) * drift * k;
      if (mouse.inside && !REDUCED && !s.project) {
        const dx = s.x - mouse.x, dy = s.y - mouse.y, d2 = dx * dx + dy * dy, R = 160;
        if (d2 < R * R && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / R) * 0.5; s.vx += (dx / d) * f; s.vy += (dy / d) * f; }
      }
    }
    for (const s of active) {
      s.vx *= Math.pow(0.9, k); s.vy *= Math.pow(0.9, k);
      s.x += s.vx * k; s.y += s.vy * k;
    }
    // keep seeds apart (circles of radius r) so every cell keeps a sensible size
    for (let it = 0; it < 3; it++) {
      for (let a = 0; a < active.length; a++) {
        const A = active[a];
        for (let b = a + 1; b < active.length; b++) {
          const B = active[b];
          const dx = B.x - A.x, dy = B.y - A.y;
          const min = (A.r || A.rBase) + (B.r || B.rBase) + 4;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01, over = (min - d) / d;
          const mA = A.project ? 4 : 1, mB = B.project ? 4 : 1;
          const wA = mB / (mA + mB), wB = mA / (mA + mB);
          A.x -= dx * over * wA * 0.5; A.y -= dy * over * wA * 0.5;
          B.x += dx * over * wB * 0.5; B.y += dy * over * wB * 0.5;
        }
      }
    }
    for (const s of active) {
      const b = s.project ? region : { x: -fillerR * 0.5, y: -fillerR * 0.5, w: W + fillerR, h: H + fillerR };
      const rr = s.project ? s.r * 0.85 : 0;
      const l = b.x + rr, r = b.x + b.w - rr, tp = b.y + rr, bt = b.y + b.h - rr;
      if (s.x < l) s.vx += (l - s.x) * 0.03; if (s.x > r) s.vx -= (s.x - r) * 0.03;
      if (s.y < tp) s.vy += (tp - s.y) * 0.03; if (s.y > bt) s.vy -= (s.y - bt) * 0.03;
    }
  }

  const easeOut = (v) => 1 - Math.pow(1 - v, 3);
  function draw(t) {
    let n = 0;
    for (const s of seeds) {
      if (!s.active || n >= MAX_CELLS) continue;
      if (s.project) {
        const ready = t > s.delay && loaded.has(s.tile);
        s.appear += ((ready ? 1 : 0) - s.appear) * 0.05;
        infoU[n].set(s.tile, s.hover, s.dim, easeOut(s.appear));
        const big = s.r > 70;
        const fs = Math.max(15, Math.min(34, s.r * 0.15));
        s.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        s.label.style.width = `${s.r * 1.6}px`;
        s.label.querySelector(".t").style.fontSize = fs + "px";
        s.label.style.opacity = String(easeOut(s.appear) * (1 - s.dim * 0.85) * (big || s.hover > 0.5 ? 1 : 0));
      } else {
        infoU[n].set(-1, 0, 0, 1);
      }
      cellsU[n].set(s.x * dpr, (H - s.y) * dpr, s.r * POWER * dpr);
      n++;
    }
    mat.uniforms.count.value = n;
    mat.uniforms.time.value = t;
    mat.uniforms.mouse.value.set(mouse.x * dpr, (H - mouse.y) * dpr);
    renderer.render(scene, camera);
  }

  // ---------- loop ----------
  layout(true);
  for (const s of seeds) s.r = s.rBase;
  for (let i = 0; i < 200; i++) step(1 / 60, i / 60);   // settle before the first frame
  let last = performance.now(), t0 = last, running = true;
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
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(stage);
}
