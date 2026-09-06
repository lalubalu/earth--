# Earth Signals — progress log

Resume point for any fresh session. Read this before touching code.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo scaffold, tooling, CI, this file | in progress |
| 2 | `packages/signal-engine` with Vitest suite | todo |
| 3 | Feed adapters + `/api/feeds/[source]` route handlers, verified live | todo |
| 4 | Dashboard shell, Web Worker wiring, signal feed, D3 charts | todo |
| 5 | WebGL globe and GSAP motion | todo |
| 6 | AI layer (`/api/brief`, `/api/ask`) with keyless fallback | todo |
| 7 | README, docs, performance and accessibility pass | todo |

## Decisions

- **Toolchain:** pnpm 12 workspaces, Node 20+, TypeScript 5.9 (typescript-eslint does not yet support TS 7), Vitest 4 (5.0.0 shipped days ago; staying one major back), Next 16 (App Router, Turbopack), React 19, Tailwind 4, three 0.185 with r3f 9 / drei 10, GSAP 3.15 (all plugins are free now), d3 sub-packages only (`d3-array`, `d3-scale`, `d3-shape`, `d3-geo`) to keep the bundle small.
- **npm name:** `@lalubalu/signal-engine` is unclaimed (404 on the registry on 2026-09-05).
- **NOAA feeds changed.** `services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json` and `mag-7-day.json` return 404 (verified 2026-09-05; the whole `/products/solar-wind/` directory is gone). Replacements, verified live:
  - `json/rtsw/rtsw_wind_1m.json` (proton_speed, proton_density, ~24 h, rows from several spacecraft; `active: true` marks the primary source)
  - `json/rtsw/rtsw_mag_1m.json` (bz_gsm, ~24 h, same shape)
  - `json/planetary_k_index_1m.json` only covers ~6 h, so `products/noaa-planetary-k-index.json` (3-hour Kp, 7 days) is fetched as the Kp baseline.
  - Consequence: solar-wind baselines are 24 h, not 7 days. The UI says so.
- **USGS `all_month.geojson` is ~8 MB / 11k events.** Too big for Next's 2 MB data-cache entry limit, so the route handler fetches it with `cache: 'no-store'`, reduces it to a compact event list (~1 MB), and memoizes that in module scope for 1 h. CDN caching via `Cache-Control: s-maxage` bounds upstream calls on Vercel. Non-earthquake USGS types (quarry blast, explosion, ice quake, landslide) keep their own `kind` so they never pollute earthquake rate baselines.
- **Open-Meteo call budget:** one batched forecast call and one batched air-quality call every 15 min for 12 anchor cities with `past_days=7&forecast_days=1` ≈ 192 requests/day, weighted at most ~20 call-units each ≈ 4k/day worst case, under the 10k/day free tier.
- **EONET:** only `wildfires`, `severeStorms`, `volcanoes`, `seaLakeIce` are kept; the latest geometry point is used (Polygon centroid if a polygon ever appears). `magnitudeValue` is nullable and units vary, so `magnitude` is set to 1 when missing.
- **Display face:** Instrument Serif (SIL OFL 1.1), self-hosted through `next/font/local`. Body/UI text uses the system sans stack with tabular numerals; numbers and code use the system monospace stack.
- **Globe basemap:** generated at runtime on a 2D canvas from `world-atlas` land TopoJSON (Natural Earth, public domain) through `d3-geo`, so there is no binary texture in the repo and the map matches the palette.
- **Headers:** every `.ts/.tsx/.js/.mjs/.css/.glsl` file starts with `/* Programmer: Lalith Satheesh / Date: MM/DD/YYYY */` using its creation date.

## Done

- Live responses captured for USGS hour/month, NOAA rtsw wind/mag, Kp 1m and 3h, Open-Meteo forecast and air quality, EONET, ISS.

## Next

- Phase 1 scaffold commit.
