/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; created lazily so SSR never shares state across requests.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
            refetchIntervalInBackground: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
