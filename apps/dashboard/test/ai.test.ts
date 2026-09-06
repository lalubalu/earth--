/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackAsk, fallbackBrief } from '../src/lib/ai/fallback';
import { rateLimit, resetRateLimits } from '../src/lib/ai/rateLimit';
import { askAnswerSchema, askRequestSchema } from '../src/lib/ai/schemas';
import type { CompactSignal, SeriesSummary } from '../src/lib/ai/schemas';

vi.mock('server-only', () => ({}));

const NOW = Date.UTC(2026, 8, 6, 3, 0);
const DAY = 86_400_000;

const signal: CompactSignal = {
  id: 'threshold:major-quake:q1',
  title: 'M6.1 earthquake near Honshu',
  detector: 'threshold',
  severity: 0.62,
  status: 'active',
  startedAt: NOW - 3_600_000,
  summary: 'Earthquake of magnitude 6.1 near Honshu is at or above the major earthquake threshold of 5.5.',
  evidence: { baseline: 1.5, observed: 6.1, threshold: 5.5, window: DAY, sampleSize: 900 },
  location: { lat: 36, lon: 140 },
};

const series: SeriesSummary[] = [
  { id: 'noaa.speed', label: 'Solar wind speed', unit: 'km/s', count: 1400, from: NOW - DAY, to: NOW, last: 412, min: 330, max: 450, median: 380 },
  { id: 'meteo.lon.pressure', label: 'London sea-level pressure', unit: 'hPa', count: 168, from: NOW - 7 * DAY, to: NOW, last: 1009, min: 998, max: 1024, median: 1014 },
];

function askRequest(question: string, extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ question, signals: [signal], series, now: NOW, ...extra }),
  });
}

describe('rate limit', () => {
  afterEach(resetRateLimits);

  it('allows up to the limit inside the window, then refuses with a retry hint', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, NOW + i).ok).toBe(true);
    const refused = rateLimit('k', 3, 60_000, NOW + 10);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit('k', 3, 60_000, NOW + 61_000).ok).toBe(true);
  });
});

describe('fallbacks', () => {
  it('brief with no signals says so, with signals counts bands and quotes summaries', () => {
    expect(fallbackBrief([])).toMatch(/inside its baseline/);
    const text = fallbackBrief([signal, { ...signal, id: 'x', severity: 0.1, status: 'cooling' }]);
    expect(text).toMatch(/^1 active signal \(1 high\)/);
    expect(text).toContain(signal.summary);
  });

  it('ask matches series by label words and proposes a chart in the right window', () => {
    const out = fallbackAsk('show me london pressure', [signal], series, NOW);
    expect(out.answer).toMatch(/ANTHROPIC_API_KEY is unset/);
    expect(out.answer).toContain('London sea-level pressure is 1009 hPa');
    expect(out.chart).toEqual({ seriesIds: ['meteo.lon.pressure'], from: NOW - 7 * DAY, to: NOW, kind: 'line' });
    const map = fallbackAsk('where is solar wind measured on the map', [signal], series, NOW);
    expect(map.chart?.kind).toBe('map');
    expect(map.chart?.from).toBe(NOW - DAY);
    const three = fallbackAsk('london pressure over the last three days', [signal], series, NOW);
    expect(three.chart?.from).toBe(NOW - 3 * DAY);
    const only = fallbackAsk('london pressure', [signal], [...series, { ...series[1]!, id: 'meteo.nyc.pressure', label: 'New York sea-level pressure' }], NOW);
    expect(only.chart?.seriesIds).toEqual(['meteo.lon.pressure']);
  });

  it('ask without matches still reports the top signals', () => {
    const out = fallbackAsk('anything interesting?', [signal], series, NOW);
    expect(out.chart).toBeUndefined();
    expect(out.answer).toContain('magnitude 6.1');
  });
});

describe('schemas', () => {
  it('rejects oversized or malformed asks and model output', () => {
    expect(askRequestSchema.safeParse({ question: 'hi', signals: [], series: [], now: NOW }).success).toBe(false);
    expect(askRequestSchema.safeParse({ question: 'what now', signals: [signal], series, now: NOW }).success).toBe(true);
    expect(askAnswerSchema.safeParse({ answer: '', chart: undefined }).success).toBe(false);
    expect(askAnswerSchema.safeParse({ answer: 'ok', chart: { seriesIds: [], from: 0, to: 1, kind: 'line' } }).success).toBe(false);
    expect(askAnswerSchema.safeParse({ answer: 'ok', chart: { seriesIds: ['a'], from: 0, to: 1, kind: 'pie' } }).success).toBe(false);
  });
});

describe('/api/ask route', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    resetRateLimits();
    vi.resetModules();
  });
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.doUnmock('../src/lib/ai/anthropic');
  });

  it('falls back without a key and never claims to be the model', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const { POST } = await import('../src/app/api/ask/route');
    const res = await POST(askRequest('show london pressure'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('fallback');
    expect(body.chart.seriesIds).toEqual(['meteo.lon.pressure']);
  });

  it('returns 400 on invalid bodies and 429 past the limit', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const { POST } = await import('../src/app/api/ask/route');
    const bad = await POST(new Request('http://localhost/api/ask', { method: 'POST', body: '{"question":"x"}' }));
    expect(bad.status).toBe(400);
    let last = 200;
    for (let i = 0; i < 13; i++) last = (await POST(askRequest('what is happening'))).status;
    expect(last).toBe(429);
  });

  it('validates and clamps a mocked model answer', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.doMock('../src/lib/ai/anthropic', () => ({
      hasApiKey: () => true,
      modelName: () => 'mock-model',
      describeError: (e: unknown) => String(e),
      anthropic: () => ({
        messages: {
          create: async () => ({
            content: [
              {
                type: 'tool_use',
                id: 't1',
                name: 'answer',
                input: {
                  answer: 'Solar wind speed is 412 km/s against a 7-day median of 380.',
                  chart: { seriesIds: ['noaa.speed', 'made.up'], from: NOW - 30 * DAY, to: NOW + DAY, kind: 'line' },
                },
              },
            ],
          }),
        },
      }),
    }));
    const { POST } = await import('../src/app/api/ask/route');
    const res = await POST(askRequest('how fast is the solar wind'));
    const body = await res.json();
    expect(body.source).toBe('claude');
    expect(body.model).toBe('mock-model');
    expect(body.chart.seriesIds).toEqual(['noaa.speed']);
    expect(body.chart.to).toBe(NOW);
    expect(body.chart.from).toBe(NOW - DAY);
  });

  it('falls back when the model output fails validation', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.doMock('../src/lib/ai/anthropic', () => ({
      hasApiKey: () => true,
      modelName: () => 'mock-model',
      describeError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      anthropic: () => ({
        messages: { create: async () => ({ content: [{ type: 'text', text: 'not a tool call' }] }) },
      }),
    }));
    const { POST } = await import('../src/app/api/ask/route');
    const body = await (await POST(askRequest('how fast is the solar wind'))).json();
    expect(body.source).toBe('fallback');
    expect(body.degraded).toMatch(/no tool call/);
  });
});
