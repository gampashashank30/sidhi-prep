import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Keep puppeteer/sharp/mammoth as server-only (not bundled for client)
  serverExternalPackages: ['puppeteer', 'sharp', 'mammoth'],
};

export default nextConfig;
