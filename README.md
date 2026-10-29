# amirkhazaei.com

Personal academic website. Plain HTML/CSS/JS, with no build step, hosted on GitHub Pages.

```
index.html                    home: hero, about, research, publications, CV, contact
projects/unbaking-the-sun.html
projects/thermal-ir.html
assets/style.css, main.js, favicon.svg
assets/img/                   figures exported from the UnbakingTheSun and ThermalIR projects
assets/cv.pdf                 <- add your CV here (the "Download CV" buttons point to it)
CNAME                         tells GitHub Pages to serve the site at amirkhazaei.com
```

## Before you publish: fill in your details

Search the HTML for `EDIT:` comments. They mark:

- the bio paragraph and your program/degree (index.html, About)
- your education/experience timeline (index.html, CV)
- GitHub / LinkedIn / Google Scholar links (index.html, Contact)
- a template for adding papers (index.html, Publications)

Also add your CV PDF as `assets/cv.pdf`.

## Preview locally

```bash
python -m http.server 8931
```

Then open http://127.0.0.1:8931/

## 1. Put it on GitHub Pages

1. On GitHub, create a new **public** repository, e.g. `amirkhazaei.com`.
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "First version of my site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/amirkhazaei.com.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch*, then pick branch `main` and folder `/ (root)`.
4. Under **Custom domain**, enter `amirkhazaei.com` and save. The `CNAME` file in this folder already contains it.

## 2. Point the domain at GitHub (Namecheap)

Namecheap → **Domain List → amirkhazaei.com → Manage → Advanced DNS**.

1. Delete Namecheap's default records: the `CNAME www → parkingpage.namecheap.com` and any `URL Redirect` record for `@`.
2. Add these records:

| Type | Host | Value |
|---|---|---|
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME Record | `www` | `YOUR-USERNAME.github.io.` |

Optional IPv6: AAAA records for `@` pointing to `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153` and `2606:50c0:8003::153`.

3. DNS changes take anywhere from a few minutes to a few hours. When GitHub's Pages settings show the DNS check passed, tick **Enforce HTTPS**. The certificate is free and automatic.
4. Recommended: in your GitHub account (not the repo), go to **Settings → Pages → Add a verified domain** and verify `amirkhazaei.com`. This stops anyone else from claiming it on GitHub Pages.

## Updating the site later

Edit the files, then:

```bash
git add .
git commit -m "Update site"
git push
```

GitHub Pages republishes within a minute or two.
