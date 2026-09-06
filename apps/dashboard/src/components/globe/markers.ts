/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { Signal } from '@lalubalu/signal-engine';
import type { FeedEvent } from '@/lib/feeds/types';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const EARTH_RADIUS_KM = 6371;
const SURFACE_LIFT = 1.004;
const MAX_MARKERS = 4000;

export type MarkerShape = 0 | 1 | 2 | 3;

export interface Marker {
  id: string;
  lat: number;
  lon: number;
  radius: number;
  /** 0..1 size driver. */
  magnitude: number;
  shape: MarkerShape;
  /** 0 neutral tint, 1 full accent. */
  tone: number;
  /** 0 old, 1 fresh; drives opacity. */
  age: number;
  selected: boolean;
}

export interface KindStyle {
  shape: MarkerShape;
  tone: number;
  label: string;
  magnitude: (e: FeedEvent) => number;
}

export const KIND_STYLES: Record<string, KindStyle> = {
  earthquake: {
    shape: 0,
    tone: 1,
    label: 'earthquake',
    magnitude: (e) => clamp01(e.magnitude / 8),
  },
  wildfire: {
    shape: 1,
    tone: 0.9,
    label: 'wildfire',
    magnitude: (e) => 0.15 + 0.3 * clamp01(Math.log10(1 + Math.max(0, e.magnitude)) / 6),
  },
  volcano: { shape: 1, tone: 0.7, label: 'volcano', magnitude: () => 0.4 },
  storm: {
    shape: 2,
    tone: 0.5,
    label: 'severe storm',
    magnitude: (e) => 0.3 + 0.4 * clamp01(e.magnitude / 150),
  },
  'sea-ice': { shape: 2, tone: 0.25, label: 'sea or lake ice', magnitude: () => 0.35 },
  iss: { shape: 3, tone: 0, label: 'ISS', magnitude: () => 0.55 },
};

const FALLBACK_STYLE: KindStyle = { shape: 1, tone: 0.3, label: 'event', magnitude: () => 0.4 };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function styleFor(kind: string): KindStyle {
  return KIND_STYLES[kind] ?? FALLBACK_STYLE;
}

/**
 * Eleven thousand month-old micro-quakes would blanket the western US, so the globe shows:
 * everything from the last 24 h, M4.5+ from the last 30 days, every EONET event, the ISS,
 * and whatever the selected signal points at. Freshness drives opacity.
 */
export function buildMarkers(
  events: readonly FeedEvent[],
  iss: FeedEvent | null,
  now: number,
  selected: Signal | undefined,
): Marker[] {
  const wanted = new Set(selected?.eventIds ?? []);
  const out: Marker[] = [];
  const all = iss ? [...events, iss] : events;
  for (const e of all) {
    const isQuake = e.kind === 'earthquake';
    const ageMs = now - e.t;
    const keep =
      wanted.has(e.id) || !isQuake || ageMs <= DAY || (e.magnitude >= 4.5 && ageMs <= 30 * DAY);
    if (!keep) continue;
    const style = styleFor(e.kind);
    const freshness = isQuake ? clamp01(1 - ageMs / (7 * DAY)) : clamp01(1 - ageMs / (30 * DAY));
    const marker: Marker = {
      id: e.id,
      lat: e.lat,
      lon: e.lon,
      radius: e.kind === 'iss' ? 1 + e.magnitude / EARTH_RADIUS_KM : SURFACE_LIFT,
      magnitude: style.magnitude(e),
      shape: style.shape,
      tone: style.tone,
      age: e.kind === 'iss' ? 1 : 0.25 + 0.75 * freshness,
      selected: wanted.has(e.id),
    };
    out.push(marker);
  }
  // Selected and recent first so the cap, if hit, drops the least interesting.
  out.sort((a, b) => Number(b.selected) - Number(a.selected) || b.age - a.age);
  return out.slice(0, MAX_MARKERS);
}

export function countByKind(events: readonly FeedEvent[], now: number): Record<string, number> {
  const counts: Record<string, number> = { iss: 1 };
  for (const e of events) {
    if (e.kind === 'earthquake' && now - e.t > DAY) continue;
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  return counts;
}

export const RECENT_QUAKE_WINDOW_HOURS = DAY / HOUR;
