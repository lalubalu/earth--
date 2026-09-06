/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { compactSignal, summarizeSeries } from '@/lib/ai/compact';
import type { AskRequest, AskResponse } from '@/lib/ai/schemas';
import { useData } from '@/lib/data';
import { AnswerChart } from './AnswerChart';

const SUGGESTIONS = [
  'What is the solar wind doing right now?',
  'Which city has the worst air quality this week?',
  'Show London pressure over the last three days',
  'Where are the strongest signals?',
];

async function ask(body: AskRequest): Promise<AskResponse> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (AskResponse & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Ask failed with HTTP ${res.status}`);
  if (!data) throw new Error('Empty response');
  return data;
}

/**
 * Sends the question with the current signals and per-series summaries. The answer is
 * validated JSON; an optional chart spec is rendered locally from the data already in
 * memory, so the model never has to produce numbers the page cannot check.
 */
export function AskBox() {
  const { now, signals, seriesById, eventsById } = useData();
  const [question, setQuestion] = useState('');
  const inputId = useId();
  const mutation = useMutation({ mutationFn: ask });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3 || mutation.isPending) return;
    mutation.mutate({
      question: trimmed,
      signals: signals.slice(0, 40).map((s) => compactSignal(s, eventsById)),
      series: summarizeSeries(seriesById, now),
      now,
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(question);
  };

  const answer = mutation.data;
  return (
    <section
      aria-labelledby="ask-heading"
      className="flex flex-col rounded-card bg-surface/60 px-4 pb-4 pt-3 hairline"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ask-heading" className="font-display text-[22px] leading-none text-ink">
          Ask
        </h2>
        <p className="font-mono text-[11px] text-ink-3">
          answers come with the chart that backs them
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Question about the current signals
        </label>
        <input
          id={inputId}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about a series, a city, or a signal"
          maxLength={500}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-card bg-bg px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 hairline focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending || question.trim().length < 3}
          className="rounded-card bg-accent px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mutation.isPending ? 'asking' : 'ask'}
        </button>
      </form>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Example questions">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                setQuestion(s);
                submit(s);
              }}
              className="rounded-full px-2 py-0.5 text-[11px] text-ink-2 hairline hover:text-ink"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="mt-3">
        {mutation.error ? (
          <p className="text-[13px] text-down">{mutation.error.message}</p>
        ) : answer ? (
          <>
            <p className="text-[15px] leading-relaxed text-ink">{answer.answer}</p>
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              {answer.source === 'claude'
                ? `${answer.model ?? 'Claude'} · validated JSON`
                : `offline answer from evidence${answer.degraded ? ` · ${answer.degraded}` : ''}`}
            </p>
            {answer.chart ? <AnswerChart spec={answer.chart} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
