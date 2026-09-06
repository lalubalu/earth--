/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { Vector3 } from 'three';

const DEG = Math.PI / 180;

/**
 * Matches three's SphereGeometry UV layout: u = 0 sits on the -X axis, u = 0.5 on +X,
 * v = 1 at the north pole. An equirectangular texture whose left edge is longitude -180
 * therefore lands where it should, and this is the one place lat/lon becomes a position.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius = 1,
  out = new Vector3(),
): Vector3 {
  const theta = (90 - lat) * DEG;
  const phi = (lon + 180) * DEG;
  const sinTheta = Math.sin(theta);
  return out.set(
    -radius * Math.cos(phi) * sinTheta,
    radius * Math.cos(theta),
    radius * Math.sin(phi) * sinTheta,
  );
}
