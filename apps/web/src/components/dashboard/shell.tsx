'use client';

import { FolderKanban, FolderOpen, House, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { importPackageFile } from '@/lib/package-io';
import { cn } from '@/lib/utils';
import { CreateDialog } from './create-dialog';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

export function DashboardShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const nav = [
    { href: '/', label: t('nav.home'), icon: House },
    { href: '/designs', label: t('nav.projects'), icon: FolderKanban },
    { href: '/trash', label: t('nav.trash'), icon: Trash2 },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-e border-slate-200 bg-white px-3 py-4 max-md:hidden"
        aria-label={t('nav.sidebar')}
      >
        <Link href="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <Button
          variant="primary"
          size="lg"
          className="mb-4 w-full"
          onClick={() => setCreateOpen(true)}
          data-testid="create-design"
        >
          <Plus className="size-5" />
          {t('nav.create')}
        </Button>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100',
                  active && 'bg-brand-50 text-brand-700 hover:bg-brand-50',
                )}
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <FolderOpen className="size-[18px]" />
            {t('nav.openFile')}
          </button>
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <p className="text-xs leading-relaxed text-slate-500">{t('home.localNotice')}</p>
          <LanguageSwitcher />
        </div>
      </aside>
      <input
        ref={fileInput}
        type="file"
        accept=".opencanvas,application/vnd.opencanvas+zip,application/zip"
        className="hidden"
        data-testid="open-file-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const design = await importPackageFile(file);
            broadcast({ type: 'designs-changed', tabId: TAB_ID });
            toast(t('design.imported'), 'success');
            router.push(`/design/${design.id}`);
          } catch (error) {
            toast(t('design.importFailed', { reason: (error as Error).message }), 'error');
          }
        }}
      />
      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Logo />
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('nav.create')}
          </Button>
        </div>
        {children}
      </main>
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Suspense fallback={null}>
        <OpenCreateFromQuery onOpen={() => setCreateOpen(true)} />
      </Suspense>
    </div>
  );
}

/** `/?create=1` (used by the editor's File → New design) opens the format picker. */
function OpenCreateFromQuery({ onOpen }: { onOpen: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.get('create') === '1') {
      onOpen();
      router.replace('/');
    }
  }, [params, onOpen, router]);
  return null;
}
