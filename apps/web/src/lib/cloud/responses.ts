import { S3Error } from './s3';

/**
 * How a failed S3 call is reported to the browser: 503 when the cloud cannot
 * be reached (offline: keep working locally), 502 for other cloud errors.
 */
export function cloudErrorResponse(error: unknown, headOnly = false): Response {
  const offline = error instanceof S3Error && (error.code === 'NetworkError' || error.code === 'Timeout');
  const status = offline ? 503 : 502;
  if (headOnly) return new Response(null, { status });
  return Response.json(
    {
      error: error instanceof Error ? error.message : 'Cloud error',
      code: error instanceof S3Error ? error.code : 'Error',
      offline,
    },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}
