/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { NextResponse } from 'next/server';
import { anthropic, describeError, hasApiKey, modelName } from '@/lib/ai/anthropic';
import { fallbackAsk } from '@/lib/ai/fallback';
import { clientIp, rateLimit } from '@/lib/ai/rateLimit';
import { askAnswerSchema, askRequestSchema } from '@/lib/ai/schemas';
import type { AskRequest, AskResponse } from '@/lib/ai/schemas';

export const dynamic = 'force-dynamic';

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 10 * 60_000;
const DAY = 86_400_000;
const MAX_BODY_BYTES = 400_000;

const SYSTEM = `You answer questions about Earth Signals, a dashboard that runs statistical anomaly detectors over public planetary feeds.
You are given the current ranked signals (with evidence) and a summary of every time series (id, label, unit, last value, 7-day min/max/median, time range in epoch ms).
Rules:
- Answer in plain English, at most 150 words, no markdown.
- Use only the numbers provided. If the data cannot answer the question, say what is missing. Never invent values, causes, forecasts, or impacts.
- When a chart would help, request one with series ids taken verbatim from the summaries: kind "line" for values over time, "bar" for hourly or daily aggregates, "map" to show where those series are measured. Use from/to in epoch milliseconds within each series' time range.
- Return the answer through the tool only.`;

const ANSWER_TOOL = {
  name: 'answer',
  description: 'Deliver the final answer and, optionally, one chart to render.',
  input_schema: {
    type: 'object' as const,
    properties: {
      answer: { type: 'string', description: 'Plain English, at most 150 words.' },
      chart: {
        type: 'object',
        properties: {
          seriesIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
          from: { type: 'number', description: 'epoch milliseconds' },
          to: { type: 'number', description: 'epoch milliseconds' },
          kind: { type: 'string', enum: ['line', 'bar', 'map'] },
        },
        required: ['seriesIds', 'from', 'to', 'kind'],
      },
    },
    required: ['answer'],
  },
};

/** Clamp what the model asked for to series that exist and a window the client has. */
function sanitize(answer: AskResponse, req: AskRequest): AskResponse {
  if (!answer.chart) return answer;
  const known = new Set(req.series.map((s) => s.id));
  const seriesIds = answer.chart.seriesIds.filter((id) => known.has(id));
  if (seriesIds.length === 0) {
    const { chart: _chart, ...rest } = answer;
    void _chart;
    return rest;
  }
  const earliest = Math.max(req.now - 8 * DAY, Math.min(...req.series.filter((s) => seriesIds.includes(s.id)).map((s) => s.from)));
  const to = Math.min(req.now, Math.max(answer.chart.to, earliest + 60_000));
  const from = Math.max(earliest, Math.min(answer.chart.from, to - 60_000));
  return { ...answer, chart: { ...answer.chart, seriesIds, from, to } };
}

async function askModel(req: AskRequest): Promise<AskResponse> {
  const model = modelName();
  const message = await anthropic().messages.create({
    model,
    max_tokens: 700,
    system: SYSTEM,
    tools: [ANSWER_TOOL],
    tool_choice: { type: 'tool', name: 'answer' },
    messages: [
      {
        role: 'user',
        content:
          `Current time: ${new Date(req.now).toISOString()} (${req.now})\n` +
          `Signals:\n${JSON.stringify(req.signals)}\n` +
          `Series summaries:\n${JSON.stringify(req.series)}\n` +
          `Question: ${req.question}`,
      },
    ],
  });
  const tool = message.content.find((block) => block.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') throw new Error('model returned no tool call');
  const parsed = askAnswerSchema.safeParse(tool.input);
  if (!parsed.success) throw new Error(`model output failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  return sanitize({ ...parsed.data, source: 'claude', model }, req);
}

export async function POST(req: Request) {
  const now = Date.now();
  const limit = rateLimit(`ask:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS, now);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT} questions per 10 minutes. Try again in ${limit.retryAfterSeconds} s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const request = parsed.data;

  if (!hasApiKey()) {
    const fallback = fallbackAsk(request.question, request.signals, request.series, request.now);
    return NextResponse.json({ ...sanitize({ ...fallback, source: 'fallback' }, request) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const answer = await askModel(request);
    return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const fallback = fallbackAsk(request.question, request.signals, request.series, request.now);
    const response: AskResponse = { ...sanitize({ ...fallback, source: 'fallback' }, request), degraded: describeError(err) };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  }
}
