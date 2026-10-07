import { createHash } from 'node:crypto';
import { clientFor, readCloudSettings } from '@/lib/cloud/config';
import { forbidden, isSyncRequest } from '@/lib/cloud/guard';
import { S3Error } from '@/lib/cloud/s3';

export const dynamic = 'force-dynamic';

let probe: { at: number; key: string; online: boolean; error: string | null } | null = null;

/** Whether cloud sync is set up and the bucket can be reached right now. */
export async function GET(request: Request) {
  if (!isSyncRequest(request.headers)) return forbidden();
  const settings = await readCloudSettings();
  if (!settings.enabled)
    return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
  const key = `${settings.endpoint}/${settings.bucket}/${settings.prefix}`;
  if (!probe || probe.key !== key || Date.now() - probe.at > 4000) {
    let online = true;
    let error: string | null = null;
    try {
      await clientFor(settings, 5000).head(`${settings.prefix}space.json`);
    } catch (e) {
      online = false;
      error = e instanceof S3Error ? e.code : 'Error';
    }
    probe = { at: Date.now(), key, online, error };
  }
  return Response.json(
    {
      enabled: true,
      provider: settings.provider,
      bucket: settings.bucket,
      deviceId: settings.deviceId,
      // Identifies the library (endpoint, bucket and folder): sync starts afresh when it changes.
      target: createHash('sha256').update(key).digest('hex').slice(0, 16),
      online: probe.online,
      error: probe.error,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
