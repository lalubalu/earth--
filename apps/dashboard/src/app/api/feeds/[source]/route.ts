/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { NextResponse } from 'next/server';
import { FEEDS, getFeed } from '@/lib/feeds/registry';
import { isFeedSource } from '@/lib/feeds/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ source: string }> }) {
  const { source } = await ctx.params;
  if (!isFeedSource(source)) {
    return NextResponse.json({ error: `Unknown feed "${source}"` }, { status: 404 });
  }
  const payload = await getFeed(source, Date.now());
  const ttl = Math.max(1, Math.round(FEEDS[source].intervalMs / 1000));
  // Successful payloads are cached at the CDN for one poll interval; failures are not, so a
  // recovered upstream shows up on the next poll rather than after the TTL.
  const cacheControl = payload.ok
    ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
    : 'no-store';
  return NextResponse.json(payload, { headers: { 'Cache-Control': cacheControl } });
}
