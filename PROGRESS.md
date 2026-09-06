# Earth Signals — progress log

Resume point for any fresh session. Read this before touching code.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Monorepo scaffold, tooling, CI, this file | done |
| 2 | `packages/signal-engine` with Vitest suite | done |
| 3 | Feed adapters + `/api/feeds/[source]` route handlers, verified live | done |
| 4 | Dashboard shell, Web Worker wiring, signal feed, D3 charts | done |
| 5 | WebGL globe and GSAP motion | done |
| 6 | AI layer (`/api/brief`, `/api/ask`) with keyless fallback | done |
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

- **Engine shape decisions:** `Signal` carries the spec'd fields plus `status` (`active`/`cooling`), `kind`, `rule`, `location`, `alsoDetectedBy`. `GeoEvent` gets an optional `label` (USGS place) for summaries. `SeriesDescriptor` carries `label`, `unit`, `lat/lon`, `minSigma` (floor on robust spread so a flat series cannot explode) and per-series `overrides` for the three series detectors. Detectors return `Candidate`s with a `ratio` so `reconcile` can apply hysteresis; domain rules outrank statistical detectors on the same series.
- **Statistical choices:** modified z uses MAD*1.4826 with mean-abs-dev fallback; EWMA alpha is derived per series from median sample spacing and a half-life (default 24 h) so the diurnal weather cycle does not fire; CUSUM k=0.5, h=5 in reference sigmas, evidence threshold = mu0 + (k + h/m) sigma; event rate and swarm use the Anscombe Poisson z with the recent window excluded from the baseline.

## Done

- Live responses captured for USGS hour/month, NOAA rtsw wind/mag, Kp 1m and 3h, Open-Meteo forecast and air quality, EONET, ISS.
- Phase 1: scaffold, CI (`.github/workflows/ci.yml`), release workflow (needs `NPM_TOKEN`), changesets, templates, MIT license.
- Phase 2: engine with six detectors, reconcile (dedupe/hysteresis/cooldown/rank), 50 Vitest tests (98% lines), tsup ESM+CJS+d.ts build, README.

- Phase 3: adapters for USGS (hour + month), NOAA (rtsw wind/mag, Kp 1m, Kp 3h), Open-Meteo forecast and air quality (batched, 12 cities), EONET, ISS. Route handler `/api/feeds/[source]` with module-scope memo + in-flight coalescing + CDN `s-maxage`; failures serve last-good data with `ok:false`. 16 Vitest tests over trimmed live fixtures in `apps/dashboard/test/fixtures`. All seven routes verified end-to-end through `next dev` on 2026-09-05 (usgs-month payload ~2 MB before gzip, fetched hourly).
- Engine descriptors and dashboard engine config live in `apps/dashboard/src/lib/engine/descriptors.ts` (labels, units, `minSigma`, per-cadence overrides, earthquake-only rate/swarm).

- Phase 4: shell with Instrument Serif via `next/font/local`, Tailwind 4 `@theme` tokens (one amber accent), TanStack Query polling (`useFeeds` with `combine`), engine in a module Web Worker (`engine.worker.ts`, main-thread fallback), ranked feed with roving tabindex + `aria-live`, `<dialog>` drawer with D3 evidence charts (series line + baseline/threshold/observed, event histogram vs expected rate, magnitude scale for rule hits), chart strip of small multiples. Verified in Chromium at 1440 and 375 px against live feeds: 77 series, ~11k events, engine ~40 ms in the worker.
- **Tuning after the first live run:** CUSUM severity is now the shift size in reference sigmas (not the accumulated sum), the dashboard uses `cusum { slack 0.75, decision 8 }` for autocorrelated hourly weather, and `minSigma` floors were raised to practical-significance levels (pressure 4 hPa, AQI 12, PM2.5 8, solar wind speed 20 km/s, density 1.5, Bz 2 nT, Kp 1). Signal count on live data went from the 50 cap to ~28.

- Phase 5: globe in `src/components/globe`: runtime canvas basemap from `world-atlas` land-110m through d3-geo (no binary texture), custom earth shader with a camera-relative terminator and rim, back-face fresnel atmosphere, one `InstancedMesh` of tangent quads with per-instance attributes (magnitude, phase, shape, tone, age, selected) and a GLSL ripple; kind is encoded as shape (ring / disc / diamond / dot) so colour is never the only cue. `frameloop="demand"` with a 24 fps ticker only while the panel is on screen, the tab visible, and motion allowed. GSAP fly-to slerps the camera direction; reduced motion jumps. Click-to-pick shows the event; card open flies there. GSAP card entrances, new-signal border flash, drawer slide, ticking numbers in the chart strip, all behind `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`. ESLint's `react-hooks/immutability` is off for `src/components/globe/**` because three.js objects are mutated by design.
- Marker filter: quakes from the last 24 h plus M4.5+ over 30 days, every EONET event, the ISS, and whatever the selected signal references (cap 4000).

- Phase 6: `/api/brief` (GET) reruns the engine over the server's own memoized feed payloads rather than trusting client-posted signals, because its result is cached for everyone for 10 minutes; a poisoned POST would have poisoned the brief. `/api/ask` (POST) takes the client's signals and per-series summaries (validated, capped) plus the question, forces a tool call named `answer`, validates the tool input with zod, then clamps chart series ids and time range to what the client actually has. Per-IP sliding-window limits (30 briefs / 12 asks per 10 min), 413 on bodies over 400 KB. No key: templated brief and a label-matching offline answer that says so. Model errors (verified against a 401 with a bogus key) degrade to the fallback with a `degraded` reason. `.env.example` documents `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `claude-sonnet-5`). The successful Claude path is unverified here: no key on this machine.

## Next

- Phase 7: root README with Mermaid architecture, CONTRIBUTING.md, Lighthouse pass, final accessibility check, final commit, push to GitHub.
