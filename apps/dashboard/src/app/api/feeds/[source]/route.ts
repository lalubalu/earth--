/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { gzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { FEEDS, getFeed } from '@/lib/feeds/registry';
import { isFeedSource } from '@/lib/feeds/types';
import type { FeedPayload, FeedSource } from '@/lib/feeds/types';

export const dynamic = 'force-dynamic';

interface Encoded {
  fetchedAt: number;
  json: Buffer;
  gzip: Buffer;
}

// next start gzips HTML but not route handler bodies, and the month feed is ~2 MB raw.
// Bodies are encoded once per payload and reused until the memo refreshes.
const encoded = new Map<FeedSource, Encoded>();

function encode(source: FeedSource, payload: FeedPayload): Encoded {
  const hit = encoded.get(source);
  if (hit && hit.fetchedAt === payload.fetchedAt) return hit;
  const json = Buffer.from(JSON.stringify(payload));
  const entry: Encoded = { fetchedAt: payload.fetchedAt, json, gzip: gzipSync(json, { level: 6 }) };
  encoded.set(source, entry);
  return entry;
}

export async function GET(req: Request, ctx: { params: Promise<{ source: string }> }) {
  const { source } = await ctx.params;
  if (!isFeedSource(source)) {
    return NextResponse.json({ error: `Unknown feed "${source}"` }, { status: 404 });
  }
  const payload = await getFeed(source, Date.now());
  const ttl = Math.max(1, Math.round(FEEDS[source].intervalMs / 1000));
  const body = encode(source, payload);
  const wantsGzip = /\bgzip\b/i.test(req.headers.get('accept-encoding') ?? '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Accept-Encoding',
    // Successful payloads are cached at the CDN for one poll interval; failures are not, so a
    // recovered upstream shows up on the next poll rather than after the TTL.
    'Cache-Control': payload.ok ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}` : 'no-store',
  };
  if (wantsGzip) headers['Content-Encoding'] = 'gzip';
  const bytes = wantsGzip ? body.gzip : body.json;
  headers['Content-Length'] = String(bytes.byteLength);
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
