import { FontUploadError } from './storage/fonts';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** A readable message for a refused font upload. */
export function fontErrorMessage(t: Translate, error: unknown, fileName: string): string {
  const reason = error instanceof FontUploadError ? error.reason : 'unreadable';
  const key =
    reason === 'not-a-font'
      ? 'settings.fonts.errors.notAFont'
      : reason === 'too-large'
        ? 'settings.fonts.errors.tooLarge'
        : 'settings.fonts.errors.unreadable';
  return t(key, { name: fileName });
}
