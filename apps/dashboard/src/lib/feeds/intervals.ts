/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { HOUR, MINUTE, SECOND } from './types';
import type { FeedSource } from './types';

/** Poll cadence per source, shared by the server memo, the CDN TTL, and the client. */
export const FEED_INTERVALS: Record<FeedSource, number> = {
  'usgs-hour': MINUTE,
  'usgs-month': HOUR,
  noaa: MINUTE,
  'open-meteo': 15 * MINUTE,
  'air-quality': 15 * MINUTE,
  eonet: 10 * MINUTE,
  iss: 10 * SECOND,
};

export const FEED_LABELS: Record<FeedSource, string> = {
  'usgs-hour': 'USGS quakes',
  'usgs-month': 'USGS 30-day',
  noaa: 'NOAA SWPC',
  'open-meteo': 'Open-Meteo',
  'air-quality': 'Air quality',
  eonet: 'NASA EONET',
  iss: 'ISS',
};

/** Attribution lines for the footer, in display order. */
export const FEED_CREDITS: { label: string; href: string; note?: string }[] = [
  {
    label: 'USGS Earthquake Hazards Program',
    href: 'https://earthquake.usgs.gov/earthquakes/feed/',
  },
  { label: 'NOAA Space Weather Prediction Center', href: 'https://www.swpc.noaa.gov/' },
  { label: 'Weather data by Open-Meteo.com', href: 'https://open-meteo.com/', note: 'CC BY 4.0' },
  { label: 'NASA EONET', href: 'https://eonet.gsfc.nasa.gov/' },
  { label: 'Where the ISS at?', href: 'https://wheretheiss.at/' },
  { label: 'Natural Earth via world-atlas', href: 'https://github.com/topojson/world-atlas' },
];
