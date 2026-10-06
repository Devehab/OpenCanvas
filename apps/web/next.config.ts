import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const config: NextConfig = {
  output: 'standalone',
  // Trace workspace packages from the monorepo root into the standalone build.
  outputFileTracingRoot: path.join(dirname, '../../'),
  transpilePackages: ['@opencanvas/core', '@opencanvas/renderer', '@opencanvas/editor', '@opencanvas/export'],
  reactStrictMode: true,
  poweredByHeader: false,
  // Contributor guidance lives in the repository docs; don't generate per-app agent files.
  agentRules: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The plugin sandbox is framed by the editor (and only by it: see its CSP).
      { source: '/plugin-sandbox', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

export default config;
