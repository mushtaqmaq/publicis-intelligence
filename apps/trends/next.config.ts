import type { NextConfig } from 'next';

// The prefix is compiled into the build, so it is the same in every environment.
// LEGACY_ORIGIN is for local work only: everything outside /media/trends is passed to the existing app, so one local
// address behaves like the real site (legacy pages, its stylesheet and its /api). In production the direction is the
// reverse: the existing site rewrites /media/trends to this service (see docs/trends/MEDIA_INTEGRATION.md).
// Only in local development, and only for a real address: a deployed build must never proxy the rest of the site.
const legacy = process.env.NODE_ENV !== 'production' && /^https?:\/\//.test(process.env.LEGACY_ORIGIN ?? '') ? process.env.LEGACY_ORIGIN : undefined;
const config: NextConfig = {
  basePath: '/media/trends',
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: legacy ? [{ source: '/:path*', destination: `${legacy}/:path*`, basePath: false as const }] : [] };
  },
};
export default config;
