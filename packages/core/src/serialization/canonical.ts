/**
 * Canonical JSON: object keys sorted recursively, no insignificant whitespace
 * (unless pretty-printed). The same document always serializes to the same
 * bytes, which makes diffs, hashes and snapshot tests stable.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}

export function canonicalStringify(value: unknown, pretty = false): string {
  return JSON.stringify(canonicalize(value), null, pretty ? 2 : undefined);
}
