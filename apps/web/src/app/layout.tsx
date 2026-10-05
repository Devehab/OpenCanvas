import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { Providers } from '@/components/providers';
import { directionOf, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config';

export const metadata: Metadata = {
  title: { default: 'OpenCanvas', template: '%s · OpenCanvas' },
  description:
    'OpenCanvas — an open-source visual creation platform. Create, edit and export designs where every element stays editable.',
  applicationName: 'OpenCanvas',
};

export const viewport: Viewport = {
  themeColor: '#6d5dfc',
  width: 'device-width',
  initialScale: 1,
};

async function resolveLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^ar\b/i.test(accept.trim()) ? 'ar' : 'en';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  return (
    // Browser extensions (RTL helpers, password managers, Grammarly…) add attributes to
    // <html>/<body> before React hydrates; ignore attribute mismatches on these two only.
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
