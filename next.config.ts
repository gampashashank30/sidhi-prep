import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Keep puppeteer/sharp/mammoth/bcryptjs as server-only (not bundled for client)
  serverExternalPackages: ['puppeteer', 'sharp', 'mammoth', 'bcryptjs'],
};

export default nextConfig;
