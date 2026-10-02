/** Liveness probe for Docker / Coolify health checks. */
export function GET() {
  return Response.json({
    status: 'ok',
    service: 'opencanvas-web',
    version: process.env.npm_package_version ?? '0.1.0',
  });
}
