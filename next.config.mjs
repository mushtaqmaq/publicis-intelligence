/** @type {import('next').NextConfig} */
export default {
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ['pg'],
  async redirects() {
    return [{ source: '/planning/:path*', destination: '/media/:path*', permanent: false }, { source: '/planning', destination: '/media', permanent: false }];
  },
  async rewrites() {
    return {
      // The existing single-page app and its login screen are static files in /public.
      beforeFiles: [
        { source: '/', destination: '/index.html' },
        { source: '/login', destination: '/login.html' },
        { source: '/files/:path*', destination: '/api/files/:path*' }
      ]
    };
  }
};
