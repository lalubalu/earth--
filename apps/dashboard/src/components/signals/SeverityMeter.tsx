/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { SEVERITY_LABELS, severityBand } from '@/lib/signals';

/**
 * Severity as a filled bar plus a word, never colour alone. The bar is one accent at
 * varying fill so the feed stays calm; the label carries the meaning.
 */
export function SeverityMeter({ severity, compact = false }: { severity: number; compact?: boolean }) {
  const band = severityBand(severity);
  const pct = Math.round(Math.max(0.04, Math.min(1, severity)) * 100);
  return (
    <div className="flex items-center gap-2" aria-label={`Severity ${SEVERITY_LABELS[band]}, ${pct} percent`}>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.14em] ${band === 'severe' || band === 'high' ? 'text-accent' : 'text-ink-2'}`}
      >
        {SEVERITY_LABELS[band]}
      </span>
      <span
        className={`relative inline-block h-1 overflow-hidden rounded-full bg-line-2 ${compact ? 'w-12' : 'w-20'}`}
        aria-hidden
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          data-severity-fill
        />
      </span>
    </div>
  );
}
