/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const instrument = localFont({
  src: [
    { path: '../fonts/InstrumentSerif-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/InstrumentSerif-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Earth Signals',
  description:
    'Live planetary feeds, statistical anomaly detection in the browser, and a ranked, explained signal feed.',
  applicationName: 'Earth Signals',
  openGraph: {
    title: 'Earth Signals',
    description: 'Live planetary feeds turned into a ranked, explained signal feed.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={instrument.variable}>
      <body className="grain min-h-screen bg-bg text-ink">
        <a
          href="#signals"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-bg"
        >
          Skip to signal feed
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
