/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useData } from '@/lib/data';

/** Phase 4 placeholder; the WebGL globe replaces this in phase 5. */
export function GlobePanel() {
  const { feeds } = useData();
  const events = feeds.events.length;
  return (
    <section
      aria-label="Globe"
      className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-card bg-surface/40 hairline lg:min-h-[calc(100vh-9rem)]"
    >
      <p className="font-mono text-[12px] text-ink-3">globe pending · {events} events loaded</p>
    </section>
  );
}
