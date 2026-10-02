import { zipSync } from 'fflate';

/** Bundles several exported files (e.g. one PNG per page) into a ZIP. */
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name.replace(/[\\/:*?"<>|]+/g, '-');
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      let i = 2;
      while (used.has(`${name.slice(0, dot)} (${i})${name.slice(dot)}`)) i++;
      name = `${name.slice(0, dot)} (${i})${name.slice(dot)}`;
    }
    used.add(name);
    entries[name] = [f.data, { level: 0 }];
  }
  return zipSync(entries);
}

/** File-system-safe base name for a design title (keeps Arabic and other letters). */
export function safeFileName(title: string, fallback = 'design'): string {
  const cleaned = title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are not allowed in file names
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
