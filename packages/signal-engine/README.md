# @lalubalu/signal-engine

Deterministic anomaly detection for time series and geo events. Zero runtime dependencies, pure functions, an injected clock, ESM and CJS builds with types. It is the engine behind [Earth Signals](https://github.com/lalubalu/earth--), but nothing in it knows about earthquakes or weather beyond three default threshold rules you can replace.

```sh
pnpm add @lalubalu/signal-engine
```

## Usage

```ts
import { runEngine, HOUR, DAY } from '@lalubalu/signal-engine';
import type { SeriesPoint, GeoEvent, Signal } from '@lalubalu/signal-engine';

const series: SeriesPoint[] = hourlyPressure.map((p) => ({ seriesId: 'lhr.pressure', t: p.time, v: p.hpa }));
const events: GeoEvent[] = quakes.map((q) => ({
  id: q.id, source: 'usgs', kind: 'earthquake', lat: q.lat, lon: q.lon, t: q.time, magnitude: q.mag, label: q.place,
}));

let previous: Signal[] = [];
function tick(now: number) {
  const { signals } = runEngine(
    { series, events, now, previous, descriptors: [{ id: 'lhr.pressure', label: 'London pressure', unit: 'hPa' }] },
    { robustZ: { windowMs: 3 * DAY }, eventRate: { recentWindowMs: 6 * HOUR } },
  );
  previous = signals; // keeps startedAt stable and lets cooldown work
  for (const s of signals) console.log(s.severity.toFixed(2), s.detector, s.summary);
}
tick(Date.now());
```

Every signal looks like this:

```ts
{
  id: 'cusum:lhr.pressure',
  seriesId: 'lhr.pressure',          // or eventIds: ['us7000abcd', ...] for event signals
  detector: 'cusum',
  severity: 0.62,                    // 0..1, comparable across detectors
  score: 2.24,                       // detector-native statistic
  startedAt: 1788660000000,
  updatedAt: 1788663600000,
  evidence: { baseline: 1015.2, observed: 1004.8, threshold: 1009.1, window: 604800000, sampleSize: 31 },
  summary: 'London pressure shifted down about 14 h ago: it has averaged 1005 hPa since then against a reference of 1015 hPa (needed 1009 hPa to fire; 31 samples).',
  status: 'active',                  // or 'cooling' for up to cooldownMs after it clears
  location: { lat: 51.5, lon: -0.1 } // when the descriptor or events have one
}
```

`summary` is templated from `evidence` and the descriptor label only. Nothing in it is inferred.

## Input shapes

- `SeriesPoint { seriesId, t, v }`, epoch milliseconds. Flat array; the engine groups, sorts, drops NaN and future points, and dedupes timestamps.
- `GeoEvent { id, source, kind, lat, lon, t, magnitude, label? }`.
- `SeriesDescriptor { id, label?, unit?, lat?, lon?, minSigma?, overrides? }`. `minSigma` floors the robust spread so a flat series cannot yield an infinite z-score. `overrides` layers per-series detector settings over the global config (a 1-minute feed and an hourly feed rarely want the same CUSUM decision interval).
- `now` is the only clock. Same input, same output, always.

## Detectors

**Robust z-score** (`robust-z`). The latest value against the median and MAD of the trailing window. MAD is scaled by 1.4826 to a sigma equivalent; when more than half the samples share a value it falls back to mean absolute deviation, then to `minSigma`. Fires at a modified z of 3.5 (the Iglewicz-Hoaglin cutoff). Good for one-off spikes: a pressure drop, a wind gust, a PM2.5 excursion. `recentMs` scores the median of the last few minutes instead of a single sample when the feed is glitchy.

**EWMA drift** (`ewma`). An exponentially weighted moving average control chart. The reference mean and sigma are robust estimates from the first half of the window so a late shift does not contaminate them. Alpha is derived from the series' own sample spacing and a half-life (default one day), so hourly and one-minute feeds get the same smoothing in wall-clock terms. Fires when the smoothed level leaves `meanLimit` sigmas, never narrower than `minShiftSigmas`, or when the EWMA of squared residuals exceeds `varianceRatio` times the reference variance. Good for slow trends: a warming week, a solar wind stream building.

**CUSUM change point** (`cusum`). Two-sided tabular CUSUM in reference-sigma units with slack `k` (0.5) and decision interval `h` (5). The change point is where the winning sum last left zero, and `startedAt` is that timestamp. The evidence threshold is the mean the post-change segment needed to reach, which falls out of `S = m(d - k) > h`. Good for step changes that persist: a pressure regime change, a Bz rotation.

**Event rate** (`event-rate`). Poisson burst detection per `source:kind`. Expected count for the recent window is the baseline rate with the recent window cut out, so a burst never inflates its own expectation. The statistic is the Anscombe-transformed z, `2(sqrt(k + 3/8) - sqrt(lambda + 3/8))`, which behaves for small lambda where the naive `(k - lambda)/sqrt(lambda)` does not. Only increases fire.

**Swarm** (`swarm`). Haversine DBSCAN over recent events, then each cluster is judged against the baseline rate inside its own footprint. A cluster in a region that is always active is not a swarm; six events where the last month had none is. A moving cluster keeps the id it had last run if its centroid stays within `epsKm`.

**Threshold rules** (`threshold`). Domain facts. Defaults: Kp at or above 5 on any series prefixed `noaa.kp` (G1 storm, severity rising to 1 at Kp 9), Bz at or below -10 nT sustained for 30 minutes on `noaa.bz`, and any `earthquake` event at or above magnitude 5.5 within the last day. Rules in the same `group` collapse to the strongest, so a G1 from the one-minute estimate and from the three-hour value do not appear twice. Domain rules outrank statistical detectors on the same series.

## Ranking, dedupe, cooldown

`reconcile` runs after every detector:

1. A candidate below threshold survives only if the same id was active last run and its statistic is still above `hysteresis` (0.8) times the threshold. That is what stops flapping at the boundary.
2. Grouped threshold rules collapse to the strongest.
3. One signal per series. A threshold rule wins; otherwise the higher severity, then score. The losers are listed in `alsoDetectedBy`.
4. `startedAt` is carried over from the previous run.
5. A signal that just cleared stays for `cooldownMs` (10 min) with `status: 'cooling'`.
6. Sort by severity, then recency, then id; cap at `maxSignals`.

## Configuration

Every number lives in `DEFAULT_CONFIG` with a comment in `types.ts`. Pass a partial to `runEngine` or `resolveConfig`; objects deep-merge, arrays replace. Time constants `MINUTE`, `HOUR`, `DAY` are exported.

## Determinism and testing

No `Date.now()`, no `Math.random()`, no I/O. The Vitest suite builds synthetic series and event fields from a seeded generator, injects spikes, ramps, steps, variance blow-ups, bursts and clusters, and checks the edge cases: short series, NaN, future points, constant series, empty baselines, antimeridian centroids.

## License

MIT
