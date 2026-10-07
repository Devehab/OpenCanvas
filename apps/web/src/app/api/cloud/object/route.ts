import { clientFor, readCloudSettings } from '@/lib/cloud/config';
import { forbidden, isSyncRequest } from '@/lib/cloud/guard';
import { isAllowedPath } from '@/lib/cloud/keys';
import { cloudErrorResponse } from '@/lib/cloud/responses';

export const dynamic = 'force-dynamic';

/** Largest file sync moves in one request. */
const MAX_BYTES = 100 * 1024 * 1024;

async function target(request: Request) {
  if (!isSyncRequest(request.headers)) return { error: forbidden() };
  const settings = await readCloudSettings();
  if (!settings.enabled) return { error: Response.json({ enabled: false }, { status: 409 }) };
  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!isAllowedPath(path)) return { error: Response.json({ error: 'Bad path' }, { status: 400 }) };
  return { client: clientFor(settings), key: `${settings.prefix}${path}` };
}

export async function GET(request: Request) {
  const t = await target(request);
  if ('error' in t) return t.error;
  try {
    const object = await t.client.get(t.key);
    if (!object) return Response.json({ error: 'Not found' }, { status: 404 });
    return new Response(object.body as Uint8Array<ArrayBuffer>, {
      headers: {
        'content-type': object.contentType,
        'x-opencanvas-etag': object.etag,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return cloudErrorResponse(error);
  }
}

export async function HEAD(request: Request) {
  const t = await target(request);
  if ('error' in t) return t.error;
  try {
    const object = await t.client.head(t.key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(null, { headers: { 'x-opencanvas-etag': object.etag, 'cache-control': 'no-store' } });
  } catch (error) {
    return cloudErrorResponse(error, true);
  }
}

/**
 * Writes an object. X-OpenCanvas-If-Match: <etag> only replaces that version;
 * X-OpenCanvas-If-None-Match: * only creates. 412 when someone else wrote first.
 */
export async function PUT(request: Request) {
  const t = await target(request);
  if ('error' in t) return t.error;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return Response.json({ error: 'Too large' }, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return Response.json({ error: 'Too large' }, { status: 413 });
  try {
    const result = await t.client.put(t.key, body, {
      contentType: request.headers.get('content-type') ?? 'application/octet-stream',
      ifMatch: request.headers.get('x-opencanvas-if-match') ?? undefined,
      ifNoneMatch: request.headers.get('x-opencanvas-if-none-match') === '*',
    });
    if (!result.ok) return Response.json({ error: 'Precondition failed' }, { status: 412 });
    return Response.json({ etag: result.etag }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return cloudErrorResponse(error);
  }
}
