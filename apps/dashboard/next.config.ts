/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lalubalu/signal-engine'],
  poweredByHeader: false,
};

export default nextConfig;
