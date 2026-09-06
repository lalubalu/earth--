/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useMemo } from 'react';
import type { Signal } from '@lalubalu/signal-engine';
import { useNow } from '@/hooks/useNow';
import { DataContext, indexEvents, indexSeries } from '@/lib/data';
import type { DashboardData } from '@/lib/data';
import { useSignalEngine } from '@/lib/engine/useSignalEngine';
import { useFeeds } from '@/lib/feeds/client';
import { ChartStrip } from './charts/ChartStrip';
import { Footer } from './Footer';
import { GlobePanel } from './globe/GlobePanel';
import { SignalDrawer } from './signals/SignalDrawer';
import { SignalFeed } from './signals/SignalFeed';
import { TopBar } from './TopBar';

export function Dashboard() {
  const now = useNow(10_000);
  const feeds = useFeeds(now);
  const engine = useSignalEngine(feeds.series, feeds.events, feeds.version);

  const seriesById = useMemo(() => indexSeries(feeds.series), [feeds.series]);
  const eventsById = useMemo(() => indexEvents(feeds.events), [feeds.events]);
  const signalById = useMemo(
    () => new Map<string, Signal>(engine.signals.map((s) => [s.id, s])),
    [engine.signals],
  );

  const value = useMemo<DashboardData>(
    () => ({ now, feeds, engine, signals: engine.signals, seriesById, eventsById, signalById }),
    [now, feeds, engine, seriesById, eventsById, signalById],
  );

  return (
    <DataContext.Provider value={value}>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 sm:px-6 lg:px-8">
        <TopBar />
        <main className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] lg:gap-6">
          <GlobePanel />
          <SignalFeed />
        </main>
        <ChartStrip />
        <Footer />
      </div>
      <SignalDrawer />
    </DataContext.Provider>
  );
}
