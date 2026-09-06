/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { geoEquirectangular, geoGraticule, geoPath } from 'd3-geo';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

const OCEAN = '#0c1119';
const LAND = '#293244';
const COAST = '#3b4558';
const GRATICULE = 'rgba(233, 230, 223, 0.05)';

/**
 * Equirectangular basemap painted at runtime from Natural Earth land polygons, so the map
 * shares the palette and the repo carries no multi-megabyte texture. 110m resolution is
 * enough at the size the globe renders and keeps the chunk under 100 KB.
 */
export async function buildBasemap(width = 2048, height = 1024): Promise<CanvasTexture> {
  const topo = (await import('world-atlas/land-110m.json')).default as unknown as Topology;
  const land = feature(topo, topo.objects.land as GeometryCollection);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);
  const path = geoPath(projection, ctx);

  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  path(geoGraticule().step([30, 30])());
  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  path(land);
  ctx.fillStyle = LAND;
  ctx.fill();
  ctx.strokeStyle = COAST;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
