/** The plugin developer guide, in the reader's language (HEAD is the default branch). */
export function pluginDocsUrl(locale: string): string {
  const file = locale === 'ar' ? 'plugins.ar.md' : 'plugins.md';
  return `https://github.com/Devehab/OpenCanvas/blob/HEAD/docs/${file}`;
}
