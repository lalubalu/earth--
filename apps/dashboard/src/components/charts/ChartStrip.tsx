/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useMemo } from 'react';
import { median as d3median } from 'd3-array';
import { fmtValue } from '@lalubalu/signal-engine';
import type { SeriesPoint } from '@lalubalu/signal-engine';
import { useData } from '@/lib/data';
import { DESCRIPTOR_BY_ID } from '@/lib/engine/descriptors';
import { NOAA_SERIES } from '@/lib/feeds/noaa';
import { formatAgo } from '@/lib/format';
import { useUi } from '@/store/ui';
import { TickingNumber } from '../motion/TickingNumber';
import { Sparkline } from './Sparkline';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const PINNED = [NOAA_SERIES.speed, NOAA_SERIES.density, NOAA_SERIES.bz, NOAA_SERIES.kp1m];
const QUIET_FILL = ['meteo.lon.temp', 'meteo.tyo.temp', 'meteo.nyc.pressure', 'aq.pek.pm25'];
const TILE_COUNT = 8;

interface Tile {
  id: string;
  label: string;
  unit: string;
  points: SeriesPoint[];
  windowMs: number;
  last: SeriesPoint | null;
  median: number | null;
  signalId?: string;
  lat?: number;
  lon?: number;
}

function windowFor(id: string): number {
  return id.startsWith('noaa.') ? DAY : 7 * DAY;
}

/**
 * Space weather is always pinned; the remaining tiles follow the strongest series
 * signals so the strip explains the feed instead of decorating it.
 */
export function ChartStrip() {
  const { now, seriesById, signals } = useData();
  const flyTo = useUi((s) => s.flyTo);

  const tiles = useMemo<Tile[]>(() => {
    const ids: { id: string; signalId?: string }[] = PINNED.map((id) => ({ id }));
    for (const s of signals) {
      if (ids.length >= TILE_COUNT) break;
      if (s.seriesId && !ids.some((t) => t.id === s.seriesId)) ids.push({ id: s.seriesId, signalId: s.id });
    }
    for (const id of QUIET_FILL) {
      if (ids.length >= TILE_COUNT) break;
      if (!ids.some((t) => t.id === id)) ids.push({ id });
    }
    return ids.map(({ id, signalId }) => {
      const d = DESCRIPTOR_BY_ID.get(id);
      const points = seriesById.get(id) ?? [];
      const windowMs = windowFor(id);
      const recent = points.filter((p) => p.t >= now - windowMs);
      const last = points.length > 0 ? points[points.length - 1]! : null;
      const tile: Tile = {
        id,
        label: d?.label ?? id,
        unit: d?.unit ?? '',
        points,
        windowMs,
        last,
        median: recent.length > 1 ? (d3median(recent, (p) => p.v) ?? null) : null,
      };
      if (signalId) tile.signalId = signalId;
      if (d && typeof d.lat === 'number' && typeof d.lon === 'number') {
        tile.lat = d.lat;
        tile.lon = d.lon;
      }
      return tile;
    });
  }, [signals, seriesById, now]);

  return (
    <section aria-labelledby="strip-heading" className="mt-4 lg:mt-6">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 id="strip-heading" className="font-display text-[22px] leading-none text-ink">
          Series
        </h2>
        <p className="font-mono text-[11px] text-ink-3">
          dashed line is the window median · space weather 24 h, weather and air 7 d
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        {tiles.map((tile) => {
          const delta = tile.last && tile.median !== null ? tile.last.v - tile.median : null;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] leading-tight text-ink-2">{tile.label}</span>
                {tile.signalId ? (
                  <span className="rounded-full px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent hairline">
                    signal
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                {tile.last ? (
                  <TickingNumber
                    value={tile.last.v}
                    format={(v) => fmtValue(v, tile.unit)}
                    className="font-display text-[26px] leading-none text-ink"
                  />
                ) : (
                  <span className="font-display text-[26px] leading-none text-ink">—</span>
                )}
                {delta !== null ? (
                  <span className="font-mono text-[11px] text-ink-3" title="difference from the window median">
                    {delta >= 0 ? '+' : ''}
                    {fmtValue(delta, tile.unit)}
                  </span>
                ) : null}
              </div>
              <div className="mt-1">
                <Sparkline points={tile.points} windowMs={tile.windowMs} now={now} label={tile.label} />
              </div>
              <p className="font-mono text-[10px] text-ink-3">
                {tile.last ? formatAgo(tile.last.t, now) : 'no data'}
                {tile.windowMs === DAY ? ' · 24 h' : ' · 7 d'}
                {tile.points.length > 0 && tile.points.length < 30 ? ` · ${tile.points.length} pts` : ''}
              </p>
            </>
          );
          return (
            <li key={tile.id} className="rounded-card bg-surface/60 hairline">
              {tile.lat !== undefined && tile.lon !== undefined ? (
                <button
                  type="button"
                  onClick={() => flyTo(tile.lat!, tile.lon!)}
                  className="block w-full px-3 pb-2 pt-2.5 text-left transition-colors duration-200 hover:bg-surface-2"
                  title="Fly the globe to this city"
                >
                  {body}
                  <span className="sr-only">, fly the globe there</span>
                </button>
              ) : (
                <div className="px-3 pb-2 pt-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 font-mono text-[10px] text-ink-3">
        {seriesById.size} series in memory · one-minute solar-wind files cover about {Math.round(DAY / HOUR)} h, so their baselines are a day, not a week
      </p>
    </section>
  );
}
