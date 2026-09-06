/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { runEngine } from '@lalubalu/signal-engine';
import type { RunRequest, RunResponse } from './protocol';

// Module worker: the engine is pure, so all it needs is the message loop.
self.onmessage = (event: MessageEvent<RunRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'run') return;
  const started = performance.now();
  let response: RunResponse;
  try {
    const result = runEngine(msg.input, msg.config);
    response = { type: 'result', id: msg.id, ok: true, result, tookMs: performance.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    response = { type: 'result', id: msg.id, ok: false, error, tookMs: performance.now() - started };
  }
  self.postMessage(response);
};
