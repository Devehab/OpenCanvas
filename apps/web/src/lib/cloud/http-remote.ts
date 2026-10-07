/**
 * The sync engine's view of the bucket, through this computer's OpenCanvas
 * server (/api/cloud/*), which holds the keys and signs the requests.
 */
import { type CloudDoc, OfflineError, type RemoteSide } from './engine';
import { blobPath } from './keys';

export const SYNC_HEADERS = { 'x-opencanvas-sync': '1' };

export class CloudError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

async function call(input: string, init: RequestInit = {}): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new OfflineError('No internet connection');
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { ...SYNC_HEADERS, ...(init.headers as Record<string, string> | undefined) },
      cache: 'no-store',
    });
  } catch {
    throw new OfflineError('OpenCanvas could not be reached');
  }
  if (res.status === 503) {
    await res.body?.cancel();
    throw new OfflineError();
  }
  if (res.status === 409) {
    await res.body?.cancel();
    throw new CloudError('Cloud sync is turned off', 'Disabled');
  }
  return res;
}

async function failure(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  throw new CloudError(
    body.error ?? `Cloud request failed (${res.status})`,
    body.code ?? `HTTP${res.status}`,
  );
}

const objectUrl = (path: string) => `/api/cloud/object?path=${encodeURIComponent(path)}`;

export class HttpRemote implements RemoteSide {
  async list(): Promise<Map<string, string>> {
    const res = await call('/api/cloud/records');
    if (!res.ok) return failure(res);
    const body = (await res.json()) as { records: { path: string; etag: string }[] };
    return new Map(body.records.map((r) => [r.path, r.etag]));
  }

  async get(path: string): Promise<{ doc: CloudDoc; etag: string } | null> {
    const res = await call(objectUrl(path));
    if (res.status === 404) return null;
    if (!res.ok) return failure(res);
    return { doc: (await res.json()) as CloudDoc, etag: res.headers.get('x-opencanvas-etag') ?? '' };
  }

  async put(path: string, doc: CloudDoc, condition: { ifMatch?: string; ifNoneMatch?: boolean }) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (condition.ifMatch) headers['x-opencanvas-if-match'] = condition.ifMatch;
    if (condition.ifNoneMatch) headers['x-opencanvas-if-none-match'] = '*';
    const res = await call(objectUrl(path), { method: 'PUT', headers, body: JSON.stringify(doc) });
    if (res.status === 412) return { ok: false as const };
    if (!res.ok) return failure(res);
    return { ok: true as const, etag: ((await res.json()) as { etag: string }).etag };
  }

  async hasBlob(hash: string): Promise<boolean> {
    const res = await call(objectUrl(blobPath(hash)), { method: 'HEAD' });
    if (res.status === 404) return false;
    if (!res.ok) return failure(res);
    return true;
  }

  async putBlob(hash: string, blob: Blob): Promise<void> {
    const res = await call(objectUrl(blobPath(hash)), {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) return failure(res);
  }

  async getBlob(hash: string, type: string): Promise<Blob> {
    const res = await call(objectUrl(blobPath(hash)));
    if (!res.ok) return failure(res);
    const bytes = await res.arrayBuffer();
    return new Blob([bytes], { type });
  }
}
