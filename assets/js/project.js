// Renders projects/<slug>/index.html from data/site.json. The page only sets data-slug.
import { loadSite, projectUrl, asset, esc, statusLabel, byRecent, navOnScroll, reveal, footer, pubRow, KIND_LABELS, STATUS_LABELS } from "./data.js";

navOnScroll();

const slug = document.documentElement.dataset.slug;

function media(m, eager) {
  if (!m) return "";
  if (m.video) {
    return `<figure class="figure"><video src="${esc(asset(m.video))}" ${m.poster ? `poster="${esc(asset(m.poster))}"` : ""} autoplay muted loop playsinline preload="metadata"></video>${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ""}</figure>`;
  }
  return `<figure class="figure"><img src="${esc(asset(m.image || m.src))}" alt="${esc(m.alt || m.caption || "")}" ${eager ? "" : 'loading="lazy"'}>${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ""}</figure>`;
}

// body may be a string (trusted HTML from site.json) or a list of paragraphs
const prose = (body) => (Array.isArray(body) ? body.map((p) => (p.startsWith("<") ? p : `<p>${p}</p>`)).join("") : body || "");

loadSite().then(async (site) => {
  const all = site.projects.slice().sort(byRecent);
  const p = all.find((x) => x.slug === slug);
  const app = document.getElementById("app");
  if (!p) { app.innerHTML = `<div class="wrap page-head"><h1>Not found</h1><p class="lead"><a href="../../">Back to all projects</a></p></div>`; return; }

  const facts = [
    ["Status", `<span class="status ${p.status === "ongoing" ? "ongoing" : ""}">${esc(statusLabel(p))}</span>`],
    ["Year", esc(p.period || p.year || "")],
    ["Theme", esc(p.theme || "")],
    [p.role ? "Role" : "Tools", esc(p.role || (p.tags || []).slice(0, 3).join(", "))],
  ];

  const sections = (p.sections || []).map((s, i) => {
    const hasMedia = s.image || s.video;
    if (s.layout === "wide" && hasMedia) {
      return `<section class="wide-figure reveal"><div class="wrap">${s.heading ? `<div class="prose" style="max-width:70ch;margin-bottom:28px"><h2 class="h2" style="font-size:clamp(28px,3.4vw,40px)">${esc(s.heading)}</h2>${prose(s.body)}</div>` : ""}${media(s)}</div></section>`;
    }
    return `<section class="p-section ${i % 2 ? "flip" : ""}"><div class="wrap row">
      <div class="prose reveal">${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}${prose(s.body)}</div>
      <div class="reveal">${hasMedia ? media(s) : ""}</div>
    </div></section>`;
  }).join("");

  const gallery = (p.gallery || []).length
    ? `<section class="wide-figure"><div class="wrap gallery">${p.gallery.map((g) => `<div class="reveal">${media(g)}</div>`).join("")}</div></section>` : "";

  const pubs = (site.publications || []).filter((x) => x.project === p.slug);
  const pubsHtml = pubs.length
    ? `<section class="p-section"><div class="wrap"><h2 class="reveal">Publications</h2><ul class="pubs reveal">${pubs.map((x) => pubRow({ ...x, kindLabel: x.kindLabel || KIND_LABELS[x.kind] || x.kind, statusLabel: x.statusLabel || STATUS_LABELS[x.status] || x.status }, site)).join("")}</ul></div></section>` : "";

  const links = (p.links || []).filter((l) => l.url);
  const next = all[(all.indexOf(p) + 1) % all.length];

  app.innerHTML = `
    <header class="p-hero" id="hero">
      ${p.scene ? "" : p.cover ? `<img class="p-hero-img" src="${esc(asset(p.heroImage || p.cover))}" alt="">` : ""}
      <div class="wrap">
        <p class="kicker">${esc(p.theme || "")}</p>
        <h1>${esc(p.title)}</h1>
        <p class="tagline">${esc(p.tagline || "")}</p>
      </div>
    </header>
    <div class="wrap">
      <div class="p-facts">${facts.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("")}</div>
      <div class="p-intro">
        <div class="reveal"><p class="kicker">Overview</p>${p.credits ? `<p class="credits">${esc(p.credits)}</p>` : ""}${(p.tags || []).length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
          ${links.length ? `<div class="p-links">${links.map((l, i) => `<a class="btn ${i ? "" : "fill"}" href="${esc(asset(l.url))}">${esc(l.label)}</a>`).join("")}</div>` : ""}</div>
        <div class="reveal"><p class="lead">${p.summary || ""}</p></div>
      </div>
      ${(p.stats || []).length ? `<div class="stats reveal">${p.stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
    </div>
    ${sections}
    ${gallery}
    ${pubsHtml}
    ${next && next !== p ? `<a class="next" href="${projectUrl(next)}"><div class="wrap"><p class="kicker">Next project</p><h2>${esc(next.title)}</h2></div></a>` : ""}
  `;
  document.title = `${p.title} · Amir Khazaei`;
  footer(site);
  reveal();

  if (p.scene) {
    try {
      const { SCENES } = await import("./scenes.js");
      const fn = SCENES[p.scene];
      if (fn) await fn(document.getElementById("hero"), { project: p, asset });
    } catch (e) {
      console.error(e);
      if (p.cover) document.getElementById("hero").insertAdjacentHTML("afterbegin", `<img class="p-hero-img" src="${esc(asset(p.heroImage || p.cover))}" alt="">`);
    }
  }
});
