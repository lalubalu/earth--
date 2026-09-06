/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { createContext, useContext } from 'react';
import type { SeriesPoint, Signal } from '@lalubalu/signal-engine';
import type { EngineState } from './engine/useSignalEngine';
import type { FeedsSnapshot } from './feeds/client';
import type { FeedEvent } from './feeds/types';

export interface DashboardData {
  now: number;
  feeds: FeedsSnapshot;
  engine: EngineState;
  signals: Signal[];
  seriesById: ReadonlyMap<string, SeriesPoint[]>;
  eventsById: ReadonlyMap<string, FeedEvent>;
  signalById: ReadonlyMap<string, Signal>;
}

export const DataContext = createContext<DashboardData | null>(null);

export function useData(): DashboardData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <Dashboard>');
  return ctx;
}

/** Group, sort, and dedupe timestamps once per snapshot; every chart reads from this. */
export function indexSeries(points: readonly SeriesPoint[]): Map<string, SeriesPoint[]> {
  const map = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) continue;
    const list = map.get(p.seriesId);
    if (list) list.push(p);
    else map.set(p.seriesId, [p]);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => a.t - b.t);
    const out: SeriesPoint[] = [];
    for (const p of list) {
      if (out.length > 0 && out[out.length - 1]!.t === p.t) out[out.length - 1] = p;
      else out.push(p);
    }
    map.set(id, out);
  }
  return map;
}

export function indexEvents(events: readonly FeedEvent[], extra: FeedEvent | null = null): Map<string, FeedEvent> {
  const map = new Map<string, FeedEvent>();
  for (const e of events) map.set(e.id, e);
  if (extra) map.set(extra.id, extra);
  return map;
}
