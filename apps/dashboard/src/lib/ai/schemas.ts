/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { z } from 'zod';

const DETECTORS = ['robust-z', 'ewma', 'cusum', 'event-rate', 'swarm', 'threshold'] as const;

/** What the client sends about each signal: enough to reason with, nothing derived. */
export const compactSignalSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(200),
  detector: z.enum(DETECTORS),
  severity: z.number().min(0).max(1),
  status: z.enum(['active', 'cooling']),
  seriesId: z.string().max(120).optional(),
  unit: z.string().max(20).optional(),
  startedAt: z.number(),
  summary: z.string().max(600),
  evidence: z.object({
    baseline: z.number(),
    observed: z.number(),
    threshold: z.number(),
    window: z.number(),
    sampleSize: z.number(),
  }),
  location: z.object({ lat: z.number(), lon: z.number() }).optional(),
});
export type CompactSignal = z.infer<typeof compactSignalSchema>;

export const briefRequestSchema = z.object({
  signals: z.array(compactSignalSchema).max(60),
  generatedAt: z.number(),
});
export type BriefRequest = z.infer<typeof briefRequestSchema>;

export const seriesSummarySchema = z.object({
  id: z.string().max(120),
  label: z.string().max(120),
  unit: z.string().max(20),
  count: z.number().int().nonnegative(),
  from: z.number(),
  to: z.number(),
  last: z.number(),
  min: z.number(),
  max: z.number(),
  median: z.number(),
});
export type SeriesSummary = z.infer<typeof seriesSummarySchema>;

export const askRequestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  signals: z.array(compactSignalSchema).max(60),
  series: z.array(seriesSummarySchema).max(200),
  now: z.number(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

export const chartSpecSchema = z.object({
  seriesIds: z.array(z.string().max(120)).min(1).max(6),
  from: z.number(),
  to: z.number(),
  kind: z.enum(['line', 'bar', 'map']),
});
export type ChartSpec = z.infer<typeof chartSpecSchema>;

/** The strict shape the model must return; validated before anything reaches the UI. */
export const askAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  chart: chartSpecSchema.optional(),
});
export type AskAnswer = z.infer<typeof askAnswerSchema>;

export interface BriefResponse {
  brief: string;
  source: 'claude' | 'fallback';
  model?: string;
  generatedAt: number;
  expiresAt: number;
  /** Why the fallback was used, when it was not by choice. */
  degraded?: string;
}

export interface AskResponse extends AskAnswer {
  source: 'claude' | 'fallback';
  model?: string;
  degraded?: string;
}
