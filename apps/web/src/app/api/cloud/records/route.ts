import { clientFor, readCloudSettings } from '@/lib/cloud/config';
import { forbidden, isSyncRequest } from '@/lib/cloud/guard';
import { cloudErrorResponse } from '@/lib/cloud/responses';

export const dynamic = 'force-dynamic';

/** Every record in the library with its version (ETag): what sync compares against. */
export async function GET(request: Request) {
  if (!isSyncRequest(request.headers)) return forbidden();
  const settings = await readCloudSettings();
  if (!settings.enabled) return Response.json({ enabled: false }, { status: 409 });
  try {
    const objects = await clientFor(settings).listAll(`${settings.prefix}records/`);
    return Response.json(
      {
        records: objects.map((o) => ({
          path: o.key.slice(settings.prefix.length),
          etag: o.etag,
          size: o.size,
        })),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return cloudErrorResponse(error);
  }
}
