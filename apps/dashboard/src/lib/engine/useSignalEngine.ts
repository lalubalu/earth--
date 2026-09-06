/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runEngine } from '@lalubalu/signal-engine';
import type { GeoEvent, SeriesPoint, Signal } from '@lalubalu/signal-engine';
import type { FeedsSnapshot } from '@/lib/feeds/client';
import { FEED_SOURCES } from '@/lib/feeds/types';
import type { FeedPayload, FeedSource } from '@/lib/feeds/types';
import { DESCRIPTORS, ENGINE_CONFIG } from './descriptors';
import type { DataMessage, RunMessage, RunResponse } from './protocol';

export interface EngineState {
  signals: Signal[];
  lastRunAt: number | null;
  tookMs: number | null;
  error: string | null;
  running: boolean;
  mode: 'worker' | 'main' | 'idle';
  evaluatedSeries: number;
  evaluatedEvents: number;
}

const DEBOUNCE_MS = 250;
/** Re-run without new data so cooldowns expire and "ago" text in summaries stays honest. */
const HEARTBEAT_MS = 60_000;
/** The ISS is a marker, not a measurement; it must not trigger engine runs every 10 s. */
const ENGINE_SOURCES = FEED_SOURCES.filter((s) => s !== 'iss');

const INITIAL: EngineState = {
  signals: [],
  lastRunAt: null,
  tookMs: null,
  error: null,
  running: false,
  mode: 'idle',
  evaluatedSeries: 0,
  evaluatedEvents: 0,
};

/**
 * Runs the engine in a module Web Worker that owns the feed data: each source is posted
 * only when its payload changes, and a run is a tiny message. Falls back to the main
 * thread if the worker cannot be constructed.
 */
export function useSignalEngine(feeds: FeedsSnapshot): EngineState {
  const [state, setState] = useState<EngineState>(INITIAL);
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const sentRef = useRef(new Map<FeedSource, FeedPayload>());
  const heldRef = useRef(new Map<FeedSource, { series: SeriesPoint[]; events: GeoEvent[] }>());
  const previousRef = useRef<Signal[]>([]);
  const feedsRef = useRef(feeds);

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  const apply = useCallback((result: RunResponse) => {
    if (result.ok && result.result) {
      setState({
        signals: result.result.signals,
        lastRunAt: Date.now(),
        tookMs: result.tookMs,
        error: null,
        running: false,
        mode: workerRef.current ? 'worker' : 'main',
        evaluatedSeries: result.result.evaluatedSeries,
        evaluatedEvents: result.result.evaluatedEvents,
      });
    } else {
      setState((s) => ({ ...s, error: result.error ?? 'engine failed', running: false }));
    }
  }, []);

  /** Push changed payloads to whoever holds the data, then run. */
  const run = useCallback(() => {
    const worker = workerRef.current;
    let anyData = false;
    for (const source of ENGINE_SOURCES) {
      const payload = feedsRef.current.feeds[source].payload;
      if (!payload) continue;
      anyData = true;
      if (sentRef.current.get(source) === payload) continue;
      sentRef.current.set(source, payload);
      if (worker) {
        const msg: DataMessage = {
          type: 'data',
          source,
          series: payload.series,
          events: payload.events,
        };
        worker.postMessage(msg);
      } else {
        heldRef.current.set(source, { series: payload.series, events: payload.events });
      }
    }
    if (!anyData) return;

    const id = ++seqRef.current;
    const now = Date.now();
    if (worker) {
      setState((prev) => ({ ...prev, running: true }));
      const msg: RunMessage = { type: 'run', id, now, config: ENGINE_CONFIG };
      worker.postMessage(msg);
      return;
    }
    const started = performance.now();
    try {
      const series: SeriesPoint[] = [];
      const events: GeoEvent[] = [];
      for (const h of heldRef.current.values()) {
        series.push(...h.series);
        events.push(...h.events);
      }
      const result = runEngine(
        { series, events, descriptors: [...DESCRIPTORS], now, previous: previousRef.current },
        ENGINE_CONFIG,
      );
      previousRef.current = result.signals;
      apply({ type: 'result', id, ok: true, result, tookMs: performance.now() - started });
    } catch (err) {
      apply({
        type: 'result',
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        tookMs: performance.now() - started,
      });
    }
  }, [apply]);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
    if (!worker) return;
    worker.onmessage = (event: MessageEvent<RunResponse>) => {
      // A newer run superseded this one; its result would overwrite fresher signals.
      if (event.data.id !== seqRef.current) return;
      apply(event.data);
    };
    worker.onerror = (event) => {
      setState((s) => ({ ...s, error: event.message || 'worker error', running: false }));
    };
    workerRef.current = worker;
    const sent = sentRef.current;
    return () => {
      worker?.terminate();
      workerRef.current = null;
      sent.clear();
    };
  }, [apply]);

  useEffect(() => {
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [feeds.version, run]);

  useEffect(() => {
    const id = setInterval(run, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [run]);

  return state;
}
