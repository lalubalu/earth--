/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type {
  EngineConfigInput,
  EngineResult,
  GeoEvent,
  SeriesPoint,
} from '@lalubalu/signal-engine';
import type { FeedSource } from '@/lib/feeds/types';

/** One source's data, sent only when that source's payload changes. */
export interface DataMessage {
  type: 'data';
  source: FeedSource;
  series: SeriesPoint[];
  events: GeoEvent[];
}

/** Ask for a run over whatever the worker currently holds. */
export interface RunMessage {
  type: 'run';
  id: number;
  now: number;
  config?: EngineConfigInput;
}

export type WorkerRequest = DataMessage | RunMessage;

export interface RunResponse {
  type: 'result';
  id: number;
  ok: boolean;
  result?: EngineResult;
  error?: string;
  tookMs: number;
}
