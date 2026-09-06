/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { runEngine } from '@lalubalu/signal-engine';
import type { GeoEvent, SeriesPoint, Signal } from '@lalubalu/signal-engine';
import { DESCRIPTORS } from './descriptors';
import type { RunResponse, WorkerRequest } from './protocol';

interface Held {
  series: SeriesPoint[];
  events: GeoEvent[];
}

// The worker owns the data. The main thread posts a source only when its payload changed,
// so a heartbeat run costs one small message instead of cloning 25k records.
const held = new Map<string, Held>();
let previous: Signal[] = [];

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === 'data') {
    held.set(msg.source, { series: msg.series, events: msg.events });
    return;
  }
  if (msg.type !== 'run') return;

  const started = performance.now();
  let response: RunResponse;
  try {
    const series: SeriesPoint[] = [];
    const events: GeoEvent[] = [];
    for (const h of held.values()) {
      for (const p of h.series) series.push(p);
      for (const e of h.events) events.push(e);
    }
    const result = runEngine(
      { series, events, descriptors: [...DESCRIPTORS], now: msg.now, previous },
      msg.config,
    );
    previous = result.signals;
    response = { type: 'result', id: msg.id, ok: true, result, tookMs: performance.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    response = { type: 'result', id: msg.id, ok: false, error, tookMs: performance.now() - started };
  }
  self.postMessage(response);
};
