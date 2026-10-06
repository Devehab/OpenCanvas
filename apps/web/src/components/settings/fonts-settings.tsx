'use client';

/** Settings → Fonts: upload, rename and delete the person's own fonts. */
import { CloudUpload, Trash2, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useFontCatalog } from '@/hooks/use-fonts';
import { useI18n } from '@/i18n';
import { onChannelMessage } from '@/lib/channel';
import { fontErrorMessage } from '@/lib/font-errors';
import { FONT_ACCEPT } from '@/lib/font-files';
import { FONT_CATALOG } from '@/lib/fonts';
import {
  addCustomFont,
  type CustomFontRecord,
  deleteCustomFont,
  listCustomFonts,
  updateCustomFont,
} from '@/lib/storage/fonts';
import { cn } from '@/lib/utils';

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function useCustomFonts() {
  const [fonts, setFonts] = useState<CustomFontRecord[] | null>(null);
  useEffect(() => {
    const refresh = () => void listCustomFonts().then(setFonts);
    refresh();
    return onChannelMessage((m) => {
      if (m.type === 'fonts-changed') refresh();
    });
  }, []);
  return fonts;
}

function FontRow({ font }: { font: CustomFontRecord }) {
  const { t } = useI18n();
  return (
    <li
      className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      data-testid="custom-font"
      data-family={font.family}
    >
      <div className="min-w-0 space-y-1">
        <p
          className="truncate text-2xl text-slate-900"
          style={{
            fontFamily: `"${font.family}", sans-serif`,
            fontWeight: font.weight,
            fontStyle: font.style,
          }}
          dir="auto"
        >
          {t('settings.fonts.sample')}
        </p>
        <p className="truncate text-xs text-slate-500" dir="ltr">
          {font.fileName} · {Math.max(1, Math.round(font.size / 1024))} KB
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={font.family}
          key={font.family}
          aria-label={t('settings.fonts.family')}
          maxLength={64}
          onBlur={(e) =>
            e.target.value.trim() && e.target.value !== font.family
              ? void updateCustomFont(font.id, { family: e.target.value })
              : undefined
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="h-9 w-44 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          data-testid="custom-font-family"
        />
        <select
          value={font.weight}
          aria-label={t('settings.fonts.weight')}
          onChange={(e) => void updateCustomFont(font.id, { weight: Number(e.target.value) })}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          data-testid="custom-font-weight"
        >
          {WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <select
          value={font.style}
          aria-label={t('settings.fonts.style')}
          onChange={(e) => void updateCustomFont(font.id, { style: e.target.value as 'normal' | 'italic' })}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="normal">{t('settings.fonts.normal')}</option>
          <option value="italic">{t('settings.fonts.italic')}</option>
        </select>
        <button
          type="button"
          onClick={() => void deleteCustomFont(font.id)}
          aria-label={t('settings.fonts.delete', { name: `${font.family} ${font.weight}` })}
          className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
          data-testid="custom-font-delete"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

export function FontsSettings() {
  const { t, formatNumber } = useI18n();
  const toast = useToast();
  const fonts = useCustomFonts();
  useFontCatalog(); // registers uploaded fonts so the previews render in them
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = async (files: File[]) => {
    for (const file of files) {
      try {
        const font = await addCustomFont(file);
        toast(t('settings.fonts.added', { name: font.family }), 'success');
      } catch (error) {
        toast(fontErrorMessage(t, error, file.name), 'error');
      }
    }
  };
  return (
    <section className="space-y-4" aria-labelledby="fonts-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fonts-title" className="text-lg font-semibold text-slate-900">
            {t('settings.fonts.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('settings.fonts.hint')}</p>
        </div>
        <Button variant="primary" onClick={() => input.current?.click()}>
          <CloudUpload className="size-4" />
          {t('settings.fonts.upload')}
        </Button>
        <input
          ref={input}
          type="file"
          accept={FONT_ACCEPT}
          multiple
          hidden
          data-testid="settings-font-input"
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
        <Type className="size-6" />
        {t('settings.fonts.drop')}
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white px-5">
        {fonts === null ? (
          <p className="py-6 text-sm text-slate-500">{t('common.loading')}</p>
        ) : fonts.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">{t('settings.fonts.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="custom-fonts">
            {fonts.map((f) => (
              <FontRow key={f.id} font={f} />
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {t('settings.fonts.bundled', { count: formatNumber(FONT_CATALOG.length) })}
      </p>
    </section>
  );
}
