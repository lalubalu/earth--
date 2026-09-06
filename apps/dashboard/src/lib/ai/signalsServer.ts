/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import 'server-only';
import { runEngine } from '@lalubalu/signal-engine';
import { DESCRIPTORS, ENGINE_CONFIG } from '@/lib/engine/descriptors';
import { getFeed } from '@/lib/feeds/registry';
import { FEED_SOURCES } from '@/lib/feeds/types';
import type { FeedEvent } from '@/lib/feeds/types';
import { compactSignal } from './compact';
import type { CompactSignal } from './schemas';

/**
 * The brief is cached for everyone, so its input cannot be whatever a client posts. This
 * reruns the engine over the server's own memoized feed payloads instead. No run-to-run
 * continuity here, which only affects startedAt on statistical detectors.
 */
export async function serverSignals(now: number): Promise<{ signals: CompactSignal[]; feedsDown: string[] }> {
  const payloads = await Promise.all(FEED_SOURCES.map((s) => getFeed(s, now)));
  const series = payloads.flatMap((p) => p.series);
  const events = payloads.flatMap((p) => p.events);
  const eventsById = new Map<string, FeedEvent>(events.map((e) => [e.id, e]));
  const { signals } = runEngine({ series, events, descriptors: [...DESCRIPTORS], now }, ENGINE_CONFIG);
  return {
    signals: signals.map((s) => compactSignal(s, eventsById)),
    feedsDown: payloads.filter((p) => !p.ok).map((p) => p.source),
  };
}
