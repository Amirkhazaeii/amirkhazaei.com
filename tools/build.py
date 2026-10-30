"""Generate one page per project from data/site.json.

    python tools/build.py

Writes projects/<slug>/index.html for every project (with its own title, description and
preview image for search engines and link previews) and removes pages for projects that
are no longer listed. The page content itself is rendered in the browser by
assets/js/project.js, so after editing site.json you only need to re-run this when you
add, remove or rename a project.
"""
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://amirkhazaei.com/"

TEMPLATE = """<!doctype html>
<html lang="en" data-base="../../" data-slug="{slug}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title} · Amir Khazaei</title>
  <meta name="description" content="{desc}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{image}">
  <meta name="theme-color" content="#000000">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../assets/css/site.css">
  <script type="importmap">{{ "imports": {{ "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" }} }}</script>
</head>
<body>

<nav class="nav" aria-label="Main">
  <div class="wrap">
    <a class="brand" href="../../">Amir Khazaei</a>
    <ul>
      <li class="opt"><a href="../../#research" aria-current="page">Research</a></li>
      <li><a href="../../publications.html">Publications</a></li>
      <li><a href="../../about.html">About</a></li>
    </ul>
  </div>
</nav>

<main id="app">
  <noscript><div class="wrap page-head"><h1>{title}</h1><p class="lead">{desc}</p></div></noscript>
</main>

<footer>
  <div class="wrap">
    <span>© <span class="year">2026</span> Amir Khazaei · Texas A&amp;M University</span>
    <span class="links"><a href="../../">Home</a><a href="../../publications.html">Publications</a><a href="mailto:amirkhazaei@tamu.edu">Email</a></span>
  </div>
</footer>

<script type="module" src="../../assets/js/project.js"></script>
</body>
</html>
"""


def main():
    site = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
    out = ROOT / "projects"
    out.mkdir(exist_ok=True)
    slugs = set()
    for p in site["projects"]:
        slug = p["slug"]
        slugs.add(slug)
        url = f"{SITE_URL}projects/{slug}/"
        page = TEMPLATE.format(
            slug=html.escape(slug),
            title=html.escape(p["title"]),
            desc=html.escape(p.get("tagline", "")),
            url=url,
            image=SITE_URL + p.get("cover", "assets/img/og.jpg"),
        )
        (out / slug).mkdir(exist_ok=True)
        (out / slug / "index.html").write_text(page, encoding="utf-8")
        print(f"projects/{slug}/index.html")
    for d in out.iterdir():
        if d.is_dir() and d.name not in slugs:
            shutil.rmtree(d)
            print(f"removed projects/{d.name}/")
    for f in out.glob("*.html"):
        f.unlink()
        print(f"removed projects/{f.name}")


if __name__ == "__main__":
    main()
