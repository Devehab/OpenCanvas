/** Case- and diacritic-insensitive match (works for Arabic and Latin titles). */
export function matchesQuery(title: string, query: string): boolean {
  // NFKD splits accented letters and hamza/madda carriers (أ → ا + ٔ), so
  // dropping combining marks folds Latin accents, harakat and alef variants.
  const fold = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/\p{M}|\u0640/gu, '') // combining marks and tatweel
      .replace(/\u0671/g, '\u0627') // ٱ → ا
      .replace(/\u0649/g, '\u064A') // ى → ي
      .replace(/\u0629/g, '\u0647') // ة → ه
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ٠-٩ → 0-9
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹ → 0-9
      .toLowerCase();
  return fold(title).includes(fold(query.trim()));
}
