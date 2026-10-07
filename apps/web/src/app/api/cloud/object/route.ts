import { decodeRecord, encodeRecord } from '@/lib/cloud/codec';
import { clientFor, readCloudSettings } from '@/lib/cloud/config';
import { forbidden, isSyncRequest } from '@/lib/cloud/guard';
import { isAllowedPath, MARKER_PATH, parseRecordPath } from '@/lib/cloud/keys';
import { libraryKey, markerWritten } from '@/lib/cloud/probe';
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
  return {
    client: clientFor(settings),
    key: `${settings.prefix}${path}`,
    library: libraryKey(settings),
    marker: path === MARKER_PATH,
    // Records are JSON, stored compressed when large; files are kept byte for byte.
    record: parseRecordPath(path) !== null,
  };
}

export async function GET(request: Request) {
  const t = await target(request);
  if ('error' in t) return t.error;
  try {
    const object = await t.client.get(t.key);
    if (!object) return Response.json({ error: 'Not found' }, { status: 404 });
    return new Response((t.record ? decodeRecord(object.body) : object.body) as Uint8Array<ArrayBuffer>, {
      headers: {
        'content-type': t.record ? 'application/json' : object.contentType,
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
  const stored = t.record ? encodeRecord(body) : { body };
  try {
    const result = await t.client.put(t.key, stored.body, {
      contentType: t.record
        ? 'application/json'
        : (request.headers.get('content-type') ?? 'application/octet-stream'),
      contentEncoding: stored.contentEncoding,
      ifMatch: request.headers.get('x-opencanvas-if-match') ?? undefined,
      ifNoneMatch: request.headers.get('x-opencanvas-if-none-match') === '*',
    });
    if (!result.ok) return Response.json({ error: 'Precondition failed' }, { status: 412 });
    if (t.marker) markerWritten(t.library, result.etag);
    return Response.json({ etag: result.etag }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return cloudErrorResponse(error);
  }
}
