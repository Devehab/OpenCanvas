/**
 * The last reachability check of the bucket (local server only), shared by
 * the API routes through globalThis, so a marker the server just wrote is
 * never reported in its old version.
 */
export interface Probe {
  at: number;
  /** endpoint/bucket/prefix the check was for. */
  key: string;
  online: boolean;
  /** Version of changes.json (null: absent). */
  marker: string | null;
  error: string | null;
}

const holder = globalThis as typeof globalThis & { __opencanvasCloudProbe?: Probe | null };

export function lastProbe(): Probe | null {
  return holder.__opencanvasCloudProbe ?? null;
}

export function rememberProbe(probe: Probe): void {
  holder.__opencanvasCloudProbe = probe;
}

/** The marker was just rewritten by this server. */
export function markerWritten(key: string, etag: string): void {
  const probe = lastProbe();
  if (probe?.key === key) holder.__opencanvasCloudProbe = { ...probe, marker: etag, online: true };
}

export function libraryKey(settings: { endpoint: string; bucket: string; prefix: string }): string {
  return `${settings.endpoint}/${settings.bucket}/${settings.prefix}`;
}
