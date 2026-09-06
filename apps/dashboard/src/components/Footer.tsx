/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { FEED_CREDITS } from '@/lib/feeds/intervals';

export function Footer() {
  return (
    <footer className="mt-8 border-t border-line py-5 text-[12px] text-ink-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-[60ch] leading-relaxed">
          Every signal is a statistic over public data: a median, a control limit, a Poisson count.
          Nothing here is a forecast. Detectors and thresholds are documented in the open-source
          engine.
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Data credits">
          {FEED_CREDITS.map((c) => (
            <li key={c.href}>
              <a
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-2 underline-offset-2 hover:text-ink"
              >
                {c.label}
              </a>
              {c.note ? <span className="ml-1">({c.note})</span> : null}
            </li>
          ))}
          <li>
            <a
              href="https://github.com/lalubalu/earth--"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line-2 underline-offset-2 hover:text-ink"
            >
              Source on GitHub
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
