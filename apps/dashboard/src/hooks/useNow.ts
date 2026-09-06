/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { useEffect, useState } from 'react';

/** A clock that ticks at `intervalMs`, for relative timestamps and health checks. */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
