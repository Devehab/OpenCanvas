'use client';

/**
 * Opens a copy of a template (in the tab the template card opened): makes a
 * new design from it, then shows that design in the editor. The template is
 * only read. Replacing the address means Back does not make another copy.
 */
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { createDesignCopy, designFromTemplate } from '@/lib/storage/designs';
import { buildStarter, getStarterTemplate } from '@/lib/templates/starters';

function UseTemplate() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const id = params.get('id');
    const starterId = params.get('starter');
    void (async () => {
      try {
        let design = null;
        if (id) design = await designFromTemplate(id);
        else if (starterId) {
          const starter = getStarterTemplate(starterId);
          const lang = locale === 'ar' ? 'ar' : 'en';
          if (starter) design = await createDesignCopy(buildStarter(starter, lang), starter.title[lang]);
        }
        if (!design) {
          setFailed(true);
          return;
        }
        broadcast({ type: 'designs-changed', tabId: TAB_ID });
        router.replace(`/design/${design.id}`);
      } catch {
        setFailed(true);
      }
    })();
  }, [params, router, locale]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      {failed ? (
        <div className="space-y-3" data-testid="template-not-found">
          <p className="text-slate-700">{t('templates.notFound')}</p>
          <Link href="/templates" className="text-sm font-medium text-brand-700 hover:underline">
            {t('templates.title')}
          </Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-slate-600" role="status">
          <Loader2 className="size-5 animate-spin" />
          {t('templates.opening')}
        </p>
      )}
    </div>
  );
}

export default function UseTemplatePage() {
  return (
    <Suspense fallback={null}>
      <UseTemplate />
    </Suspense>
  );
}
