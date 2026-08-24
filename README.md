# Gaia Climate Lab

An exploratory reduced-order terrestrial-planet climate, atmosphere and
carbon-cycle simulator. WebGL2 planet rendering with a software fallback.

**Play it:** https://m1omg.github.io/gaia-climate-lab/

## Repository layout

| Path | What it is |
| --- | --- |
| `PLAY_OFFLINE/` | Double-clickable, no-build client bundle. Open `index.html` in a browser — no npm, server or internet needed. This is also what GitHub Pages serves. |
| `SOURCE/` | Exact source snapshot of the published v9 project (Vite + vinext + React 19 on Cloudflare Workers). |
| `VERSION.txt` | Build identity. |
| `README_FIRST.txt` | Original package notes shipped with v9. |

## Running the full source project

Requires Node.js 22.13 or newer.

```bash
cd SOURCE
npm ci
npm run dev     # http://localhost:5173
npm run build
npm run start
```

## GitHub Pages

`.github/workflows/deploy-pages.yml` publishes `PLAY_OFFLINE/` as a static site
on every push to the default branch. The `SOURCE/` project targets Cloudflare
Workers with server rendering, so it is not statically exportable — the client
bundle carries the same simulation, controls, renderer and presets.

One-time setup, required before the first deploy can succeed: **Settings →
Pages → Build and deployment → Source: GitHub Actions**, then re-run the
workflow. The workflow's own token is not allowed to create the Pages site, so
this switch cannot be automated from CI.

## Notes

This is an exploratory reduced-order climate model, not a general circulation
model or a substitute for a research-grade coupled atmosphere-ocean code.
Scientific-reference links need internet access; the simulation does not.
