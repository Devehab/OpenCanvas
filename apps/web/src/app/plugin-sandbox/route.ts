/**
 * The document plugins run in. The editor frames it with
 * `sandbox="allow-scripts"` (an opaque origin: no access to the app's
 * storage, cookies or pages) and this response's own Content Security
 * Policy: no network except the hosts in `?net=` (from the manifest the
 * person approved), no plugins, forms or base URLs, and only the editor may
 * frame it.
 */
import { SANDBOX_BOOTSTRAP } from '@/lib/plugins/sandbox-bootstrap';

export const dynamic = 'force-dynamic';

const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function GET(request: Request): Response {
  const net = (new URL(request.url).searchParams.get('net') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => HOST.test(h))
    .slice(0, 20);
  const connect = ['blob:', 'data:', ...net.map((h) => `https://${h}`)].join(' ');
  const csp = [
    "default-src 'none'",
    // Plugin code arrives as a blob: module; WebAssembly is allowed for image work.
    "script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'",
    "style-src 'unsafe-inline' blob:",
    'img-src blob: data:',
    'font-src blob: data:',
    'media-src blob: data:',
    'worker-src blob:',
    `connect-src ${connect}`,
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:transparent}</style></head><body><script>${SANDBOX_BOOTSTRAP}</script></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
