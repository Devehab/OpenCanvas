import {
  buildConfig,
  checkConnection,
  clientFor,
  ensureSpace,
  explainS3Error,
  newDeviceId,
  readCloudSettings,
  SetupError,
  type SetupInput,
  writeCloudSettings,
} from '@/lib/cloud/config';
import { forbidden, isSetupRequest } from '@/lib/cloud/guard';

export const dynamic = 'force-dynamic';

/** The current choice, without the secret key (for `opencanvas cloud status`). */
export async function GET(request: Request) {
  if (!(await isSetupRequest(request.headers))) return forbidden();
  const settings = await readCloudSettings();
  if (!settings.enabled) return Response.json({ enabled: false });
  const { secretAccessKey: _secret, ...rest } = settings;
  return Response.json({ ...rest, accessKeyId: `${settings.accessKeyId.slice(0, 4)}…` });
}

/**
 * Used by the installer and `opencanvas cloud`:
 * - { mode: "local" } keeps everything on this computer;
 * - { mode: "cloud", provider, bucket, keys…, save } checks the bucket (write,
 *   read, delete a test file), reports a library left by a previous install,
 *   and with `save` stores the settings.
 */
export async function POST(request: Request) {
  if (!(await isSetupRequest(request.headers))) return forbidden();
  let body: (SetupInput & { mode?: string; save?: boolean }) | null = null;
  try {
    body = (await request.json()) as SetupInput & { mode?: string; save?: boolean };
  } catch {
    return Response.json(
      { ok: false, error: { code: 'BadRequest', message: 'Invalid JSON' } },
      { status: 400 },
    );
  }
  if (body.mode === 'local') {
    await writeCloudSettings({ enabled: false });
    return Response.json({ ok: true, mode: 'local' });
  }
  let config: ReturnType<typeof buildConfig>;
  try {
    config = buildConfig(body);
  } catch (error) {
    if (error instanceof SetupError) {
      return Response.json({
        ok: false,
        error: { code: 'Invalid', field: error.field, message: error.message },
      });
    }
    throw error;
  }
  try {
    const library = await checkConnection(config);
    if (body.save) {
      const previous = await readCloudSettings();
      // Keep this computer's identity when the same bucket is set up again.
      const deviceId = previous.enabled ? previous.deviceId : newDeviceId();
      await ensureSpace(clientFor(config), config.prefix);
      await writeCloudSettings({ ...config, deviceId, createdAt: Date.now() });
    }
    return Response.json({ ok: true, mode: 'cloud', library });
  } catch (error) {
    return Response.json({ ok: false, error: explainS3Error(error) });
  }
}
