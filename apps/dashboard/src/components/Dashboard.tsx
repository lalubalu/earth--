/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Signal } from '@lalubalu/signal-engine';
import { useNow } from '@/hooks/useNow';
import { DataContext, indexEvents, indexSeries } from '@/lib/data';
import type { DashboardData } from '@/lib/data';
import { useSignalEngine } from '@/lib/engine/useSignalEngine';
import { useFeeds } from '@/lib/feeds/client';
import { AskBox } from './ai/AskBox';
import { BriefPanel } from './ai/BriefPanel';
import { ChartStrip } from './charts/ChartStrip';
import { Footer } from './Footer';
import { GlobePanel } from './globe/GlobePanel';
import { SignalDrawer } from './signals/SignalDrawer';
import { SignalFeed } from './signals/SignalFeed';
import { TopBar } from './TopBar';

export function Dashboard() {
  const now = useNow(10_000);
  const [heavyAllowed, setHeavyAllowed] = useState(false);
  const feeds = useFeeds(now, heavyAllowed);
  const engine = useSignalEngine(feeds);

  // First signals on screen, then the 30-day baseline; queued as a task, not mid-effect.
  const firstRunDone = engine.lastRunAt !== null;
  useEffect(() => {
    if (!firstRunDone || heavyAllowed) return;
    const t = setTimeout(() => setHeavyAllowed(true), 0);
    return () => clearTimeout(t);
  }, [firstRunDone, heavyAllowed]);

  const seriesById = useMemo(() => indexSeries(feeds.series), [feeds.series]);
  const eventsById = useMemo(() => indexEvents(feeds.events, feeds.iss), [feeds.events, feeds.iss]);
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
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] lg:gap-6">
          <BriefPanel />
          <AskBox />
        </div>
        <ChartStrip />
        <Footer />
      </div>
      <SignalDrawer />
    </DataContext.Provider>
  );
}
