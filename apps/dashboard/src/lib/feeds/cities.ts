/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Twelve anchors, two per inhabited continent. Both Open-Meteo calls batch all of them into
 * one request, so adding a city costs nothing in request count and a little in call weight.
 */
export const CITIES: readonly City[] = [
  { id: 'nyc', name: 'New York', lat: 40.71, lon: -74.01 },
  { id: 'mex', name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { id: 'sao', name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { id: 'lon', name: 'London', lat: 51.51, lon: -0.13 },
  { id: 'lag', name: 'Lagos', lat: 6.52, lon: 3.38 },
  { id: 'cai', name: 'Cairo', lat: 30.04, lon: 31.24 },
  { id: 'nbo', name: 'Nairobi', lat: -1.29, lon: 36.82 },
  { id: 'bom', name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { id: 'pek', name: 'Beijing', lat: 39.9, lon: 116.4 },
  { id: 'tyo', name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { id: 'jkt', name: 'Jakarta', lat: -6.21, lon: 106.85 },
  { id: 'syd', name: 'Sydney', lat: -33.87, lon: 151.21 },
];

export const CITY_BY_ID: ReadonlyMap<string, City> = new Map(CITIES.map((c) => [c.id, c]));
