import { initHome } from "./bubbles.js";
import { loadSite, projectUrl, asset, esc, statusLabel, byRecent, navOnScroll, reveal, footer, pubRow, researchItems } from "./data.js";

navOnScroll();

loadSite().then((site) => {
  const projects = site.projects.slice().sort(byRecent);

  document.querySelector("#cards").innerHTML = projects.map((p) => `
    <a class="card reveal" href="${projectUrl(p)}">
      <div class="thumb">${p.cover ? `<img src="${esc(asset(p.cover))}" alt="" loading="lazy">` : ""}</div>
      <div class="body">
        <div class="meta"><span>${esc(p.theme || "")}</span><span class="status ${p.status === "ongoing" ? "ongoing" : ""}">${esc(statusLabel(p))}</span></div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.tagline || "")}</p>
      </div>
    </a>`).join("");

  const { papers, projects: items } = researchItems(site);
  const latest = [...papers, ...items].slice(0, 4);
  document.querySelector("#latest").innerHTML = latest.map((x) => pubRow(x, site)).join("");

  footer(site);
  reveal();
});

initHome().catch((e) => {
  console.error(e);
  document.querySelector(".home-stage").classList.add("no-webgl");
});
