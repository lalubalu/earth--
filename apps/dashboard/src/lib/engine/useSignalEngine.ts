/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runEngine } from '@lalubalu/signal-engine';
import type { EngineInput, GeoEvent, SeriesPoint, Signal } from '@lalubalu/signal-engine';
import { DESCRIPTORS, ENGINE_CONFIG } from './descriptors';
import type { RunRequest, RunResponse } from './protocol';

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
const HEARTBEAT_MS = 30_000;

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
 * Runs the engine in a module Web Worker, falling back to the main thread if the worker
 * cannot be constructed. Previous signals are fed back for continuity and cooldown.
 */
export function useSignalEngine(
  series: SeriesPoint[],
  events: GeoEvent[],
  version: string,
): EngineState {
  const [state, setState] = useState<EngineState>(INITIAL);
  const workerRef = useRef<Worker | null>(null);
  const previousRef = useRef<Signal[]>([]);
  const seqRef = useRef(0);
  const latest = useRef({ series, events });
  useEffect(() => {
    latest.current = { series, events };
  }, [series, events]);

  const apply = useCallback((result: RunResponse) => {
    if (result.ok && result.result) {
      previousRef.current = result.result.signals;
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

  const run = useCallback(() => {
    const { series: s, events: e } = latest.current;
    if (s.length === 0 && e.length === 0) return;
    const id = ++seqRef.current;
    const input: EngineInput = {
      series: s,
      events: e,
      descriptors: [...DESCRIPTORS],
      now: Date.now(),
      previous: previousRef.current,
    };
    const worker = workerRef.current;
    if (worker) {
      setState((prev) => ({ ...prev, running: true }));
      const msg: RunRequest = { type: 'run', id, input, config: ENGINE_CONFIG };
      worker.postMessage(msg);
      return;
    }
    const started = performance.now();
    try {
      const result = runEngine(input, ENGINE_CONFIG);
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
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, [apply]);

  useEffect(() => {
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [version, run]);

  useEffect(() => {
    const id = setInterval(run, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [run]);

  return state;
}
