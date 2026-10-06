'use client';

import { FileUp, FolderKanban, FolderOpen, House, Palette, Plus, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, type ReactNode, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import {
  designFromFiles,
  isPackageFile,
  START_FILE_ACCEPT,
  type StartProgress,
} from '@/lib/start-from-files';
import { cn, useMediaQuery } from '@/lib/utils';
import { CreateDialog } from './create-dialog';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

const UPLOAD_ERRORS = ['too-large', 'unsupported', 'too-many-pixels', 'corrupt', 'empty', 'decode'];
const PDF_ERRORS = ['too-large', 'unreadable', 'encrypted'];

/** Lets pages (the home hero) open the "start from a file" picker. */
const StartFromFileContext = createContext<() => void>(() => {});
export const useStartFromFile = () => useContext(StartFromFileContext);

/** "Start from an image or PDF" (must be rendered inside DashboardShell). */
export function StartFromFileButton() {
  const { t } = useI18n();
  const open = useStartFromFile();
  return (
    <button
      type="button"
      onClick={open}
      className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/25"
      data-testid="start-from-file"
    >
      <FileUp className="size-4" />
      {t('home.startFromFile')}
    </button>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [opening, setOpening] = useState<StartProgress | null>(null);
  const dragDepth = useRef(0);

  const start = async (files: File[]) => {
    if (files.length === 0 || opening) return;
    setOpening({ name: files[0]!.name, done: 0, total: files.length });
    try {
      const { design, failures } = await designFromFiles(files, setOpening);
      for (const f of failures) {
        const pdf = /\.pdf$/i.test(f.name);
        toast(
          pdf && PDF_ERRORS.includes(f.reason)
            ? t(`home.pdfErrors.${f.reason}`, { name: f.name })
            : UPLOAD_ERRORS.includes(f.reason)
              ? t(`editor.uploads.errors.${f.reason}`, { name: f.name })
              : t('design.importFailed', { reason: f.reason }),
          'error',
        );
      }
      if (design) {
        if (isPackageFile(files[0]!)) toast(t('design.imported'), 'success');
        router.push(`/design/${design.id}`);
      }
    } catch (error) {
      toast(t('design.importFailed', { reason: (error as Error).message }), 'error');
    } finally {
      setOpening(null);
    }
  };
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  // One language switcher, in the sidebar or (on phones, where it is hidden) in the header.
  const isDesktop = useMediaQuery('(min-width: 768px)', true);

  const nav = [
    { href: '/', label: t('nav.home'), icon: House },
    { href: '/designs', label: t('nav.projects'), icon: FolderKanban },
    { href: '/brand', label: t('nav.brand'), icon: Palette },
    { href: '/trash', label: t('nav.trash'), icon: Trash2 },
    { href: '/settings', label: t('nav.settings'), icon: Settings },
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
          {isDesktop ? <LanguageSwitcher /> : null}
        </div>
      </aside>
      <input
        ref={fileInput}
        type="file"
        accept={START_FILE_ACCEPT}
        className="hidden"
        data-testid="open-file-input"
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void start(files);
        }}
      />
      <main
        className="relative min-w-0 flex-1"
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void start([...e.dataTransfer.files]);
        }}
        data-testid="dashboard-drop-zone"
      >
        {dragging || opening ? (
          <div
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-600/15 p-6 backdrop-blur-[2px] md:start-64"
            data-testid="dashboard-drop-overlay"
          >
            <div className="max-w-md rounded-2xl border-2 border-dashed border-brand-400 bg-white px-8 py-10 text-center shadow-xl">
              <FileUp className="mx-auto size-10 text-brand-600" />
              <p className="mt-3 text-lg font-semibold text-slate-900" role="status">
                {opening ? t('home.opening', { name: opening.name }) : t('home.dropTitle')}
              </p>
              {opening ? null : <p className="mt-2 text-sm text-slate-500">{t('home.dropHint')}</p>}
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Logo />
          {isDesktop ? null : <LanguageSwitcher />}
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('nav.create')}
          </Button>
        </div>
        <StartFromFileContext.Provider value={() => fileInput.current?.click()}>
          {children}
        </StartFromFileContext.Provider>
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
