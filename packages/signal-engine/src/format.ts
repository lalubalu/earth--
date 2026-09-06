/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { DAY, HOUR, MINUTE } from './config.js';
import type { EngineConfig, EventLabel, SeriesDescriptor } from './types.js';

/** Precision that reads naturally: 1015 hPa, 12.4 mm, 0.31 nT. */
export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return 'n/a';
  const abs = Math.abs(x);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const s = x.toFixed(digits);
  const trimmed = digits > 0 ? s.replace(/\.?0+$/, '') : s;
  return trimmed === '-0' ? '0' : trimmed;
}

export function fmtValue(x: number, unit?: string): string {
  const n = fmtNum(x);
  if (!unit) return n;
  // Symbols hug the number; words get a space.
  return /^[°%]/.test(unit) ? `${n}${unit}` : `${n} ${unit}`;
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  if (ms >= DAY) {
    const d = ms / DAY;
    return `${fmtNum(d)} ${d === 1 ? 'day' : 'days'}`;
  }
  if (ms >= HOUR) return `${fmtNum(ms / HOUR)} h`;
  return `${Math.round(ms / MINUTE)} min`;
}

export function fmtAgo(t: number, now: number): string {
  const delta = now - t;
  if (delta < MINUTE) return 'just now';
  return `${fmtDuration(delta)} ago`;
}

export function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export function seriesLabel(seriesId: string, descriptor?: SeriesDescriptor): string {
  return descriptor?.label ?? seriesId;
}

export function eventLabel(kind: string, config: EngineConfig, count: number): string {
  const label: EventLabel = config.eventLabels[kind] ?? {
    singular: `${kind} event`,
    plural: `${kind} events`,
  };
  return count === 1 ? label.singular : label.plural;
}
