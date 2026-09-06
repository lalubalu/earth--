/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { BriefResponse } from '@/lib/ai/schemas';
import { useData } from '@/lib/data';
import { formatAgo } from '@/lib/format';

const REFRESH_MS = 10 * 60_000;

async function fetchBrief(): Promise<BriefResponse> {
  const res = await fetch('/api/brief', { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Brief request failed with HTTP ${res.status}`);
  }
  return (await res.json()) as BriefResponse;
}

/** Server-generated summary of the current signals; the server caches it for ten minutes. */
export function BriefPanel() {
  const { now } = useData();
  const { data, error, isPending } = useQuery({
    queryKey: ['brief'],
    queryFn: fetchBrief,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });

  return (
    <section aria-labelledby="brief-heading" className="flex flex-col rounded-card bg-surface/60 px-4 pb-4 pt-3 hairline">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="brief-heading" className="font-display text-[22px] leading-none text-ink">
          Brief
        </h2>
        <p className="font-mono text-[11px] text-ink-3">
          {data
            ? data.source === 'claude'
              ? `${data.model ?? 'Claude'} · ${formatAgo(data.generatedAt, now)} · refreshes every 10 min`
              : `templated from evidence · no API key${data.degraded ? ` · ${data.degraded}` : ''}`
            : error
              ? 'unavailable'
              : 'generating'}
        </p>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-ink" aria-live="polite">
        {isPending
          ? 'Reading the current signals.'
          : error
            ? `The brief could not be generated: ${error.message}`
            : data?.brief}
      </p>
      {data?.source === 'claude' ? (
        <p className="mt-3 font-mono text-[11px] text-ink-3">
          The model only sees the signal list above and is told to quote its evidence. Check any number against the cards.
        </p>
      ) : null}
    </section>
  );
}
