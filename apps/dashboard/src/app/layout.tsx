/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Earth Signals',
  description: 'Live planetary feeds, in-browser anomaly detection, and a ranked, explained signal feed.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
