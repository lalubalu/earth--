/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function formatAgo(t: number, now: number): string {
  const d = Math.max(0, now - t);
  if (d < 45_000) return 'just now';
  if (d < HOUR) return `${Math.round(d / MINUTE)} min ago`;
  if (d < DAY) {
    const h = d / HOUR;
    return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h ago`;
  }
  return `${(d / DAY).toFixed(1).replace(/\.0$/, '')} d ago`;
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatClock(t: number): string {
  return clock.format(new Date(t));
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateTime(t: number): string {
  return dateTime.format(new Date(t));
}

export function formatDuration(ms: number): string {
  if (ms >= DAY) return `${(ms / DAY).toFixed(1).replace(/\.0$/, '')} d`;
  if (ms >= HOUR) return `${(ms / HOUR).toFixed(1).replace(/\.0$/, '')} h`;
  if (ms >= MINUTE) return `${Math.round(ms / MINUTE)} min`;
  return `${Math.round(ms / 1000)} s`;
}

export function formatMs(ms: number): string {
  return ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`;
}
