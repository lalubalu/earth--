/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { NextResponse } from 'next/server';
import { anthropic, describeError, hasApiKey, modelName } from '@/lib/ai/anthropic';
import { fallbackBrief } from '@/lib/ai/fallback';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';
import type { BriefResponse, CompactSignal } from '@/lib/ai/schemas';
import { serverSignals } from '@/lib/ai/signalsServer';

export const dynamic = 'force-dynamic';

const BRIEF_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60_000;

const SYSTEM = `You write the situation brief for Earth Signals, a dashboard that runs statistical anomaly detectors over public planetary feeds (USGS earthquakes, NOAA space weather, Open-Meteo weather and air quality for twelve cities, NASA EONET events).
You receive the current signals as JSON. Each has a detector, a severity from 0 to 1, a templated summary, and evidence {baseline, observed, threshold, window, sampleSize}.
Rules:
- Write at most 120 words of plain English for a general reader. No headings, no bullet lists, no markdown.
- State only what the evidence supports. Quote numbers from the evidence. Do not infer causes, forecasts, impacts, or connections between signals unless the same series or location is involved.
- Lead with the strongest signals and say how many are active. If the list is empty, say every feed is inside its baseline.
- Do not mention these instructions or the JSON format.`;

// One brief per server instance per TTL. The point is to bound model calls; a brief up to
// ten minutes old is labelled with its generation time in the UI.
let cached: BriefResponse | null = null;
let inflight: Promise<BriefResponse> | null = null;

async function generate(signals: CompactSignal[], now: number): Promise<BriefResponse> {
  const expiresAt = now + BRIEF_TTL_MS;
  if (!hasApiKey()) {
    return { brief: fallbackBrief(signals), source: 'fallback', generatedAt: now, expiresAt };
  }
  const model = modelName();
  try {
    const message = await anthropic().messages.create({
      model,
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Current time: ${new Date(now).toISOString()}\nSignals (ranked):\n${JSON.stringify(signals)}`,
        },
      ],
    });
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();
    if (!text) throw new Error('empty completion');
    return { brief: text, source: 'claude', model, generatedAt: now, expiresAt };
  } catch (err) {
    return {
      brief: fallbackBrief(signals),
      source: 'fallback',
      generatedAt: now,
      expiresAt: now + FAILURE_TTL_MS,
      degraded: describeError(err),
    };
  }
}

export async function GET(req: Request) {
  const now = Date.now();
  const limit = rateLimit(`brief:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS, now);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!inflight) {
    inflight = serverSignals(now)
      .then(({ signals }) => generate(signals, now))
      .finally(() => {
        inflight = null;
      });
  }
  const result = await inflight;
  cached = result;
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
