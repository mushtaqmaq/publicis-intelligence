import type { NextConfig } from 'next';

// The prefix is compiled into the build, so it is the same in every environment.
// LEGACY_ORIGIN is for local work only: everything outside /media/trends is passed to the existing app, so one local
// address behaves like the real site (legacy pages, its stylesheet and its /api). In production the direction is the
// reverse: the existing site rewrites /media/trends to this service (see docs/trends/MEDIA_INTEGRATION.md).
const legacy = process.env.LEGACY_ORIGIN;
const config: NextConfig = {
  basePath: '/media/trends',
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: legacy ? [{ source: '/:path*', destination: `${legacy}/:path*`, basePath: false as const }] : [] };
  },
};
export default config;
