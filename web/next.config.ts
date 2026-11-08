import type { NextConfig } from 'next';

// Static export: plain files that any static host can serve. No middleware, server actions or API routes.
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
