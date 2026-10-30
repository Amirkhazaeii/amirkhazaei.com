// Shared helpers: load data/site.json and build URLs relative to the current page.
// Pages set <html data-base="">, or data-base="../../" for projects/<slug>/index.html.
export const BASE = document.documentElement.dataset.base || "";

let cache = null;
export async function loadSite() {
  if (!cache) cache = fetch(BASE + "data/site.json", { cache: "no-cache" }).then((r) => r.json());
  return cache;
}

export const projectUrl = (p) => `${BASE}projects/${p.slug}/`;
export const asset = (path) => (/^(https?:)?\/\//.test(path) ? path : BASE + path);

export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const statusLabel = (p) => (p.status === "ongoing" ? "Ongoing" : "Completed");

// Most recent first: ongoing before completed, then by year.
export const byRecent = (a, b) =>
  (a.status === "ongoing" ? 0 : 1) - (b.status === "ongoing" ? 0 : 1) || (b.year || 0) - (a.year || 0);

export function footer(site) {
  const el = document.querySelector("footer .year");
  if (el) el.textContent = new Date().getFullYear();
}

// Navigation bar turns solid once the page scrolls.
export function navOnScroll() {
  const nav = document.querySelector(".nav");
  if (!nav || nav.classList.contains("always")) return;
  const set = () => nav.classList.toggle("solid", window.scrollY > 40);
  set();
  window.addEventListener("scroll", set, { passive: true });
}

// Fade elements in as they enter the viewport.
export function reveal(root = document) {
  const els = root.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  els.forEach((e) => io.observe(e));
}

// One publication / research row, shared by the home page, project pages and the hub.
export function pubRow(item, site) {
  const proj = item.project && site.projects.find((p) => p.slug === item.project);
  const thumb = item.image || (proj && proj.cover);
  const titleLink = item.url || (proj ? projectUrl(proj) : null);
  const links = (item.links || []).map((l) => `<a class="pill" href="${esc(asset(l.url))}">${esc(l.label)}</a>`).join("");
  let authors = esc(item.authors || "");
  const me = (site.profile.authorNames || [site.profile.name]).find((n) => authors.includes(esc(n)));
  if (me) authors = authors.replace(esc(me), `<b>${esc(me)}</b>`);
  return `<li class="pub" data-kind="${esc(item.kind)}" data-status="${esc(item.status)}" data-theme="${esc(item.theme || (proj && proj.theme) || "")}">
    <a class="pthumb" href="${esc(titleLink || "#")}" tabindex="-1" aria-hidden="true">${thumb ? `<img src="${esc(asset(thumb))}" alt="" loading="lazy">` : ""}</a>
    <div>
      <p class="ptitle">${titleLink ? `<a href="${esc(titleLink)}">${esc(item.title)}</a>` : esc(item.title)}</p>
      ${authors ? `<p class="pmeta">${authors}</p>` : ""}
      ${item.venue ? `<p class="pmeta">${esc(item.venue)}</p>` : ""}
      <div class="pinfo"><span>${esc(item.year || "")}</span><span>${esc(item.kindLabel || item.kind)}</span><span class="status ${item.status === "ongoing" ? "ongoing" : ""}">${esc(item.statusLabel || item.status)}</span></div>
    </div>
    <div class="plinks">${links}</div>
  </li>`;
}

export const KIND_LABELS = { paper: "Paper", poster: "Poster", talk: "Talk", thesis: "Thesis", report: "Report", preprint: "Working paper" };
export const STATUS_LABELS = { published: "Published", presented: "Presented", review: "Under review", preparation: "In preparation", ongoing: "Ongoing" };

// The hub lists every project as a research entry, plus any papers from site.publications.
export function researchItems(site) {
  const fromProjects = site.projects.slice().sort(byRecent).map((p) => ({
    title: p.title,
    project: p.slug,
    year: p.year,
    kind: "project",
    kindLabel: "Research project",
    status: p.status === "ongoing" ? "ongoing" : "completed",
    statusLabel: statusLabel(p),
    theme: p.theme,
    venue: p.tagline,
    links: (p.links || []).filter((l) => l.url),
  }));
  const papers = (site.publications || []).map((x) => ({
    ...x,
    kindLabel: x.kindLabel || KIND_LABELS[x.kind] || x.kind,
    statusLabel: x.statusLabel || STATUS_LABELS[x.status] || x.status,
  }));
  return { papers, projects: fromProjects };
}
