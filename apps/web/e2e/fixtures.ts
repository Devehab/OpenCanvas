/**
 * The end-to-end `test`, for every browser project.
 *
 * Playwright runs each test in a private (ephemeral) session. Safari cannot
 * keep files (Blobs) in IndexedDB in private windows (WebKit bug 268037),
 * which normal Safari windows can, and OpenCanvas keeps photos, fonts and
 * plugins there. So WebKit tests run in a normal, persistent profile, like
 * a real Safari window; other browsers keep Playwright's own contexts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base } from '@playwright/test';

export * from '@playwright/test';

export const test = base.extend({
  context: async (
    {
      browserName,
      context,
      playwright,
      baseURL,
      viewport,
      locale,
      timezoneId,
      deviceScaleFactor,
      hasTouch,
      isMobile,
      userAgent,
      colorScheme,
    },
    use,
  ) => {
    if (browserName !== 'webkit') {
      await use(context);
      return;
    }
    const profile = mkdtempSync(path.join(tmpdir(), 'opencanvas-webkit-'));
    const persistent = await playwright.webkit.launchPersistentContext(profile, {
      baseURL,
      viewport,
      locale,
      timezoneId,
      deviceScaleFactor,
      hasTouch,
      isMobile,
      userAgent,
      colorScheme,
    });
    await use(persistent);
    await persistent.close();
    rmSync(profile, { recursive: true, force: true });
  },
});
