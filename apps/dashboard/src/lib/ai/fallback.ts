/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { AskAnswer, CompactSignal, SeriesSummary } from './schemas';

const DAY = 86_400_000;

function severityWord(s: number): string {
  return s >= 0.75 ? 'severe' : s >= 0.5 ? 'high' : s >= 0.25 ? 'moderate' : 'low';
}

/**
 * Zero-key brief: the engine's own templated summaries, ordered as ranked. Every sentence
 * already comes from evidence, so nothing here can claim more than the detectors did.
 */
export function fallbackBrief(signals: CompactSignal[]): string {
  const active = signals.filter((s) => s.status === 'active');
  if (active.length === 0) {
    return 'No detector is firing right now. Every series and event feed is inside its baseline.';
  }
  const bands = { severe: 0, high: 0, moderate: 0, low: 0 };
  for (const s of active) bands[severityWord(s.severity) as keyof typeof bands]++;
  const counts = Object.entries(bands)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  const top = active.slice(0, 4).map((s) => s.summary);
  return `${active.length} active signal${active.length === 1 ? '' : 's'} (${counts}). ${top.join(' ')}`;
}

const STOP = new Set(['the', 'what', 'is', 'are', 'in', 'of', 'a', 'an', 'how', 'show', 'me', 'and', 'to', 'for', 'on', 'at', 'last', 'this', 'that', 'with', 'about', 'any', 'there', 'now', 'today', 'right', 'plot', 'chart', 'graph']);

/**
 * Zero-key ask: match question words against series labels and answer from the current
 * signals. Says plainly that it is not a model.
 */
export function fallbackAsk(question: string, signals: CompactSignal[], series: SeriesSummary[], now: number): AskAnswer {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  const scored = series
    .map((s) => {
      const hay = `${s.label} ${s.id}`.toLowerCase();
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { s, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  // "london pressure" should not drag in every city's pressure: keep the best matches only.
  const best = scored[0]?.score ?? 0;
  const matches = scored.filter((m) => m.score === best).slice(0, 4);
  const windowMs = requestedWindow(question);

  const related = signals.filter(
    (sig) => matches.some((m) => m.s.id === sig.seriesId) || words.some((w) => sig.title.toLowerCase().includes(w)),
  );

  const parts: string[] = [
    'No model is configured (ANTHROPIC_API_KEY is unset), so this answer is assembled from the current evidence only.',
  ];
  if (matches.length > 0) {
    parts.push(
      `Matched series: ${matches
        .map((m) => `${m.s.label} is ${fmt(m.s.last)} ${m.s.unit} (7-day median ${fmt(m.s.median)}, range ${fmt(m.s.min)} to ${fmt(m.s.max)})`)
        .join('; ')}.`,
    );
  }
  if (related.length > 0) {
    parts.push(`Related signals: ${related.slice(0, 3).map((s) => s.summary).join(' ')}`);
  } else if (signals.length > 0) {
    parts.push(`Top signals right now: ${signals.slice(0, 3).map((s) => s.summary).join(' ')}`);
  } else {
    parts.push('No signals are active.');
  }

  const answer: AskAnswer = { answer: parts.join(' ') };
  if (matches.length > 0) {
    const wantsMap = /\b(map|where|globe)\b/.test(question.toLowerCase());
    const isMinuteFeed = matches.every((m) => m.s.id.startsWith('noaa.'));
    answer.chart = {
      seriesIds: matches.map((m) => m.s.id),
      from: now - (windowMs ?? (isMinuteFeed ? DAY : 7 * DAY)),
      to: now,
      kind: wantsMap ? 'map' : 'line',
    };
  }
  return answer;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** "last three days", "past 12 hours", "2d" -> milliseconds, capped at the 7-day history. */
function requestedWindow(question: string): number | null {
  const m = /(\d+|one|two|three|four|five|six|seven)\s*(hours?|hrs?|h|days?|d)\b/i.exec(question);
  if (!m) return null;
  const n = NUMBER_WORDS[m[1]!.toLowerCase()] ?? Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]!.toLowerCase().startsWith('d') ? DAY : 3_600_000;
  return Math.min(7 * DAY, n * unit);
}

function fmt(x: number): string {
  const abs = Math.abs(x);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return x.toFixed(digits).replace(/\.?0+$/, '');
}
