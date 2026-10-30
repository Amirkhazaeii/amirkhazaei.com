// Publications hub: papers from site.publications plus every project, grouped and filterable.
import { loadSite, esc, navOnScroll, reveal, footer, pubRow, researchItems } from "./data.js";

navOnScroll();

loadSite().then((site) => {
  const { papers, projects } = researchItems(site);
  const ongoing = projects.filter((x) => x.status === "ongoing");
  const previous = projects.filter((x) => x.status !== "ongoing");
  const groups = [
    { id: "papers", title: "Papers & posters", items: papers, empty: "Papers from this research will be listed here as they are published." },
    { id: "ongoing", title: "Ongoing research", items: ongoing, empty: "Nothing here yet." },
    { id: "previous", title: "Previous research", items: previous, empty: "Nothing here yet." },
  ];
  const list = document.getElementById("hub");
  list.innerHTML = groups.map((g) => `
    <section class="pub-group" data-group="${g.id}">
      <h2>${esc(g.title)} <span class="count"></span></h2>
      <ul class="pubs">${g.items.map((x) => pubRow(x, site)).join("")}</ul>
      <p class="empty" hidden>${esc(g.empty)}</p>
    </section>`).join("");

  const themes = [...new Set(site.projects.map((p) => p.theme).filter(Boolean))];
  const chips = document.getElementById("themeChips");
  chips.innerHTML = ["All", ...themes].map((t, i) => `<button class="chip" type="button" aria-pressed="${i === 0}" data-theme="${esc(i ? t : "all")}">${esc(t)}</button>`).join("");

  let theme = "all", q = "";
  const apply = () => {
    list.querySelectorAll(".pub-group").forEach((g) => {
      let n = 0;
      g.querySelectorAll(".pub").forEach((row) => {
        const ok = (theme === "all" || row.dataset.theme === theme) && (!q || row.textContent.toLowerCase().includes(q));
        row.hidden = !ok;
        if (ok) n++;
      });
      g.querySelector(".count").textContent = String(n);
      g.querySelector(".empty").hidden = n > 0;
    });
  };
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    theme = b.dataset.theme;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    apply();
  });
  document.getElementById("search").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
  apply();
  footer(site);
  reveal();
});
