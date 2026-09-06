/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

export const EARTH_RADIUS_KM = 6371.0088;

const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Mean position on the unit sphere, so clusters straddling the antimeridian stay put. */
export function centroid(points: readonly LatLon[]): LatLon {
  if (points.length === 0) return { lat: NaN, lon: NaN };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const lat = p.lat * DEG;
    const lon = p.lon * DEG;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  const n = points.length;
  x /= n;
  y /= n;
  z /= n;
  const hyp = Math.sqrt(x * x + y * y);
  if (hyp === 0 && z === 0) return { lat: NaN, lon: NaN };
  return { lat: Math.atan2(z, hyp) / DEG, lon: Math.atan2(y, x) / DEG };
}

export const NOISE = -1;

/**
 * Plain DBSCAN over great-circle distance. Returns a cluster label per input index,
 * NOISE for unclustered points. O(n^2) distance evaluations; fine for a few thousand events.
 */
export function dbscan(points: readonly LatLon[], epsKm: number, minPoints: number): number[] {
  const n = points.length;
  const labels = new Array<number>(n).fill(NOISE);
  if (n === 0) return labels;

  const neighbours: number[][] = [];
  for (let i = 0; i < n; i++) neighbours.push([i]);
  for (let i = 0; i < n; i++) {
    const pi = points[i] as LatLon;
    for (let j = i + 1; j < n; j++) {
      if (haversineKm(pi, points[j] as LatLon) <= epsKm) {
        (neighbours[i] as number[]).push(j);
        (neighbours[j] as number[]).push(i);
      }
    }
  }

  const visited = new Array<boolean>(n).fill(false);
  let cluster = 0;
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const seed = neighbours[i] as number[];
    if (seed.length < minPoints) continue;

    labels[i] = cluster;
    const queue = [...seed];
    let head = 0;
    while (head < queue.length) {
      const q = queue[head++] as number;
      if (!visited[q]) {
        visited[q] = true;
        const qn = neighbours[q] as number[];
        if (qn.length >= minPoints) {
          for (const r of qn) queue.push(r);
        }
      }
      if (labels[q] === NOISE) labels[q] = cluster;
    }
    cluster++;
  }
  return labels;
}
