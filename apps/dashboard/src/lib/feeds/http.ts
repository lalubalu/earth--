/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

const USER_AGENT = 'earth-signals/0.1 (+https://github.com/lalubalu/earth--)';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface FetchJsonOptions {
  /** Seconds for Next's data cache. Omit for responses over ~2 MB; that cache refuses them. */
  revalidateSeconds?: number;
  timeoutMs?: number;
}

export class UpstreamError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: controller.signal,
    };
    if (opts.revalidateSeconds !== undefined) init.next = { revalidate: opts.revalidateSeconds };
    else init.cache = 'no-store';
    const res = await fetch(url, init);
    if (!res.ok) throw new UpstreamError(url, res.status, `HTTP ${res.status} from ${url}`);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(url, null, `${reason} (${url})`);
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

export function str(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null;
}

/** NOAA time tags come without a zone designator but are UTC. */
export function parseUtc(x: unknown): number | null {
  const s = str(x);
  if (!s) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}
