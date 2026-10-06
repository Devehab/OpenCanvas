'use client';

/** Settings → Icons: the person's own SVG icons and plugin icon packs. */
import { CloudUpload, Shapes, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomIconPreview } from '@/components/ui/custom-icon';
import { useToast } from '@/components/ui/toast';
import { useIconPacks } from '@/hooks/use-icon-packs';
import { usePlugins } from '@/hooks/use-plugins';
import { useI18n } from '@/i18n';
import { localizedManifest } from '@/lib/plugins/manifest';
import { addUserIcons, deleteUserIcon, USER_PACK_ID } from '@/lib/storage/icon-packs';
import { cn } from '@/lib/utils';

export function IconsSettings() {
  const { t, locale, formatNumber } = useI18n();
  const toast = useToast();
  const packs = useIconPacks();
  const plugins = usePlugins();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = async (files: File[]) => {
    const svgs = files.filter((f) => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name));
    if (!svgs.length) return;
    const result = await addUserIcons(svgs, t('settings.icons.userPack'));
    for (const f of result.failed) toast(t(`settings.icons.errors.${f.reason}`, { name: f.name }), 'error');
    if (result.added.length)
      toast(t('settings.icons.added', { count: formatNumber(result.added.length) }), 'success');
  };
  const pluginName = (id: string) => {
    const p = plugins?.find((x) => x.id === id);
    return p ? localizedManifest(p.manifest, locale).name : id;
  };
  return (
    <section className="space-y-4" aria-labelledby="icons-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="icons-title" className="text-lg font-semibold text-slate-900">
            {t('settings.icons.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('settings.icons.hint')}</p>
        </div>
        <Button variant="primary" onClick={() => input.current?.click()}>
          <CloudUpload className="size-4" />
          {t('settings.icons.upload')}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          hidden
          data-testid="icon-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void upload(files);
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-sm text-slate-500 transition',
          dragging
            ? 'border-brand-400 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white hover:border-brand-300',
        )}
      >
        <Shapes className="size-6" />
        {t('settings.icons.drop')}
      </button>
      {packs === null ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : packs.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          {t('settings.icons.empty')}
        </p>
      ) : (
        packs.map((pack) => (
          <div
            key={pack.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
            data-testid="icon-pack"
          >
            <p className="font-semibold text-slate-900">
              {pack.id === USER_PACK_ID ? t('settings.icons.userPack') : pack.name}
              {pack.pluginId ? (
                <span className="ms-2 text-xs font-normal text-slate-500">
                  {t('settings.icons.fromPlugin', { name: pluginName(pack.pluginId) })}
                </span>
              ) : null}
            </p>
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
              {pack.icons.map((icon) => (
                <li
                  key={icon.id}
                  className="group relative flex flex-col items-center gap-1 rounded-lg p-2 text-slate-800 hover:bg-slate-50"
                  data-testid="custom-icon"
                  title={icon.name}
                >
                  <CustomIconPreview icon={icon} className="size-8" />
                  <span className="w-full truncate text-center text-[11px] text-slate-500">{icon.name}</span>
                  {pack.id === USER_PACK_ID ? (
                    <button
                      type="button"
                      onClick={() => void deleteUserIcon(icon.id)}
                      aria-label={t('settings.icons.delete', { name: icon.name })}
                      className="absolute end-0.5 top-0.5 rounded p-0.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
