/** @type {import('next').NextConfig} */
export default {
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ['pg', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  // pdfjs-dist loads its optional canvas package dynamically, which Next's file tracing cannot see; ship it with the
  // one route that reads PDFs (the rate-card import) so PDF parsing works on Vercel.
  outputFileTracingIncludes: {
    '/media/settings/import-rate-card': ['./node_modules/@napi-rs/canvas/**/*', './node_modules/@napi-rs/canvas-*/**/*'],
  },
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
