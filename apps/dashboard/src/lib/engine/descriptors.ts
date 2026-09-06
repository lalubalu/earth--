/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { DAY, HOUR, MINUTE } from '@lalubalu/signal-engine';
import type { EngineConfigInput, SeriesDescriptor, SeriesOverrides } from '@lalubalu/signal-engine';
import { CITIES } from '@/lib/feeds/cities';
import { NOAA_SERIES } from '@/lib/feeds/noaa';
import { AIR_VARS, FORECAST_VARS, seriesId } from '@/lib/feeds/openMeteo';

/**
 * The RTSW files hold ~24 h of 1-minute samples, so the 7-day defaults would never have a
 * window to work with. Half the window (12 h) is the reference period. CUSUM needs an hour
 * of 1-sigma shift rather than five minutes of it at this cadence.
 */
const ONE_MINUTE_FEED: SeriesOverrides = {
  robustZ: { windowMs: DAY, recentMs: 5 * MINUTE },
  ewma: { windowMs: DAY, halfLifeMs: 3 * HOUR },
  cusum: { windowMs: DAY, slack: 0.5, decision: 60 },
};

/** ~6 h of 1-minute estimated Kp. */
const KP_1M: SeriesOverrides = {
  robustZ: { windowMs: 6 * HOUR, recentMs: 5 * MINUTE },
  ewma: { windowMs: 6 * HOUR, halfLifeMs: HOUR },
  cusum: { windowMs: 6 * HOUR, slack: 0.5, decision: 60 },
};

/** 56 three-hour values over 7 days. */
const KP_3H: SeriesOverrides = {
  robustZ: { minSamples: 16 },
  ewma: { minSamples: 20, halfLifeMs: 12 * HOUR },
  cusum: { minSamples: 20, slack: 0.5, decision: 5 },
};

interface CityVar {
  suffix: string;
  label: string;
  unit: string;
  minSigma: number;
}

const FORECAST_META: Record<(typeof FORECAST_VARS)[keyof typeof FORECAST_VARS], CityVar> = {
  temp: { suffix: 'temp', label: 'temperature', unit: '°C', minSigma: 1.5 },
  pressure: { suffix: 'pressure', label: 'sea-level pressure', unit: 'hPa', minSigma: 4 },
  gust: { suffix: 'gust', label: 'wind gusts', unit: 'km/h', minSigma: 8 },
  precip: { suffix: 'precip', label: 'precipitation', unit: 'mm', minSigma: 1 },
};

const AIR_META: Record<(typeof AIR_VARS)[keyof typeof AIR_VARS], CityVar> = {
  pm25: { suffix: 'pm25', label: 'PM2.5', unit: 'μg/m³', minSigma: 8 },
  aqi: { suffix: 'aqi', label: 'US AQI', unit: '', minSigma: 12 },
};

function cityDescriptors(): SeriesDescriptor[] {
  const out: SeriesDescriptor[] = [];
  for (const city of CITIES) {
    for (const meta of Object.values(FORECAST_META)) {
      out.push({
        id: seriesId('meteo', city.id, meta.suffix),
        label: `${city.name} ${meta.label}`,
        unit: meta.unit,
        lat: city.lat,
        lon: city.lon,
        minSigma: meta.minSigma,
      });
    }
    for (const meta of Object.values(AIR_META)) {
      out.push({
        id: seriesId('aq', city.id, meta.suffix),
        label: `${city.name} ${meta.label}`,
        unit: meta.unit,
        lat: city.lat,
        lon: city.lon,
        minSigma: meta.minSigma,
      });
    }
  }
  return out;
}

export const DESCRIPTORS: readonly SeriesDescriptor[] = [
  { id: NOAA_SERIES.speed, label: 'Solar wind speed', unit: 'km/s', minSigma: 20, overrides: ONE_MINUTE_FEED },
  { id: NOAA_SERIES.density, label: 'Solar wind density', unit: 'p/cm³', minSigma: 1.5, overrides: ONE_MINUTE_FEED },
  { id: NOAA_SERIES.bz, label: 'Bz (GSM)', unit: 'nT', minSigma: 2, overrides: ONE_MINUTE_FEED },
  { id: NOAA_SERIES.kp1m, label: 'Kp (1-min estimate)', unit: '', minSigma: 1, overrides: KP_1M },
  { id: NOAA_SERIES.kp3h, label: 'Kp (3-hour)', unit: '', minSigma: 1, overrides: KP_3H },
  ...cityDescriptors(),
];

export const DESCRIPTOR_BY_ID: ReadonlyMap<string, SeriesDescriptor> = new Map(
  DESCRIPTORS.map((d) => [d.id, d]),
);

/**
 * Only earthquakes feed the rate and swarm detectors. EONET events carry the time of their
 * last position update rather than an onset, so counting them would measure NASA's
 * editing cadence, not the planet.
 *
 * `minSigma` on the city series is the practical-significance floor: a 3-point AQI shift
 * is real but not news. CUSUM gets a wider decision interval because hourly weather is
 * autocorrelated and the textbook h = 5 fires on ordinary regime changes.
 */
export const ENGINE_CONFIG: EngineConfigInput = {
  cusum: { slack: 0.75, decision: 8 },
  eventRate: { kinds: ['earthquake'], minMagnitude: { earthquake: 2.5 } },
  swarm: { kinds: ['earthquake'] },
  eventLabels: {
    earthquake: { singular: 'earthquake', plural: 'earthquakes' },
    wildfire: { singular: 'wildfire', plural: 'wildfires' },
    storm: { singular: 'severe storm', plural: 'severe storms' },
    volcano: { singular: 'volcanic event', plural: 'volcanic events' },
    'sea-ice': { singular: 'sea or lake ice event', plural: 'sea or lake ice events' },
  },
};
