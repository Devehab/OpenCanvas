import { createHash } from 'node:crypto';
import { clientFor, readCloudSettings } from '@/lib/cloud/config';
import { forbidden, isSyncRequest } from '@/lib/cloud/guard';
import { MARKER_PATH } from '@/lib/cloud/keys';
import { lastProbe, libraryKey, rememberProbe } from '@/lib/cloud/probe';
import { S3Error } from '@/lib/cloud/s3';

export const dynamic = 'force-dynamic';

/**
 * Whether cloud sync is set up and the bucket can be reached right now, and
 * the version of the change marker: one small request that tells the browser
 * both whether it is online and whether another computer uploaded anything.
 */
export async function GET(request: Request) {
  if (!isSyncRequest(request.headers)) return forbidden();
  const settings = await readCloudSettings();
  if (!settings.enabled)
    return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
  const key = libraryKey(settings);
  let probe = lastProbe();
  // Tabs asking at the same moment share one check.
  if (!probe || probe.key !== key || Date.now() - probe.at > 1500) {
    let online = true;
    let marker: string | null = null;
    let error: string | null = null;
    try {
      marker = (await clientFor(settings, 5000).head(`${settings.prefix}${MARKER_PATH}`))?.etag ?? null;
    } catch (e) {
      online = false;
      error = e instanceof S3Error ? e.code : 'Error';
    }
    probe = { at: Date.now(), key, online, marker, error };
    rememberProbe(probe);
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
      marker: probe.marker,
      error: probe.error,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
