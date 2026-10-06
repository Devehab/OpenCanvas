'use client';

/** Brand panel: the active brand kit's colors, fonts, logos and images, one click away. */
import { ExternalLink, Palette, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BlobImage } from '@/components/ui/blob-image';
import { useToast } from '@/components/ui/toast';
import { useAssetUrls } from '@/hooks/use-brands';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { applyBrandColor, brandTextProps } from '@/lib/brand-apply';
import { placeImage } from '@/lib/place-image';
import { BRAND_IMAGE_SECTIONS, type BrandImage } from '@/lib/storage/brands';
import { useEditorBrand } from '../brand-context';
import { setAssetDragData } from './uploads-panel';

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800 first:mt-0">{children}</h3>;
}

function ImageTiles({ images, urls }: { images: BrandImage[]; urls: Record<string, string> }) {
  const { editor } = useEditorContext();
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((img) => (
        <button
          key={img.hash}
          type="button"
          draggable
          onDragStart={(e) => setAssetDragData(e, img)}
          onClick={() => placeImage(editor, img)}
          title={img.name}
          aria-label={t('editor.uploads.add', { name: img.name })}
          className="oc-checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-slate-200 p-1.5 hover:border-brand-400"
          data-testid="brand-panel-image"
        >
          {urls[img.hash] ? (
            <BlobImage src={urls[img.hash]} className="max-h-full max-w-full object-contain" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function BrandPanel() {
  const { t, dir } = useI18n();
  const toast = useToast();
  const { editor } = useEditorContext();
  const { brands, brand, setBrand } = useEditorBrand();
  const urls = useAssetUrls(brand ? BRAND_IMAGE_SECTIONS.flatMap((s) => brand[s].map((i) => i.hash)) : []);

  if (brands === null) return <p className="p-4 pt-10 text-sm text-slate-500">{t('common.loading')}</p>;
  if (!brand)
    return (
      <div className="flex flex-col items-center gap-3 p-4 pt-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Palette className="size-6" />
        </span>
        <p className="text-sm text-slate-600">{t('brand.panel.noKits')}</p>
        <Link
          href="/brand"
          target="_blank"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Plus className="size-4" />
          {t('brand.panel.create')}
        </Link>
      </div>
    );

  const roles = ['heading', 'subheading', 'body'] as const;
  return (
    <div className="space-y-1 p-4 pt-10" data-testid="brand-panel">
      <div className="mb-4 flex items-center gap-2">
        <select
          value={brand.id}
          onChange={(e) => setBrand(e.target.value)}
          aria-label={t('brand.panel.choose')}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium"
          data-testid="brand-select"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Link
          href={`/brand?id=${brand.id}`}
          target="_blank"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={t('brand.panel.edit')}
          title={t('brand.panel.edit')}
        >
          <ExternalLink className="size-4" />
        </Link>
      </div>

      {brand.logos.length ? (
        <>
          <Heading>{t('brand.sections.logos')}</Heading>
          <ImageTiles images={brand.logos} urls={urls} />
        </>
      ) : null}

      {brand.palettes.some((p) => p.colors.length) ? (
        <>
          <Heading>{t('brand.sections.colors')}</Heading>
          <p className="mb-2 text-xs text-slate-500">{t('brand.panel.colorHint')}</p>
          {brand.palettes.map((p) =>
            p.colors.length ? (
              <div key={p.id} className="mb-3">
                <p className="mb-1.5 text-xs font-medium text-slate-500">{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (!applyBrandColor(editor, c)) toast(t('brand.panel.colorHint'));
                      }}
                      title={c}
                      aria-label={t('brand.panel.applyColor', { color: c })}
                      className="size-9 rounded-lg border border-black/10 shadow-sm transition hover:scale-105"
                      style={{ background: c }}
                      data-testid="brand-panel-color"
                    />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </>
      ) : null}

      <Heading>{t('brand.sections.fonts')}</Heading>
      <div className="space-y-2">
        {roles.map((role) => {
          const font = brand.fonts[role];
          const label = t(`brand.fontRoles.${role}`);
          return (
            <button
              key={role}
              type="button"
              onClick={() => editor.insertNodes([brandTextProps(font, label, dir === 'rtl')])}
              aria-label={t('brand.panel.addText', { role: label })}
              className="block w-full truncate rounded-lg border border-slate-200 px-3 py-2.5 text-start text-slate-900 hover:border-brand-300 hover:bg-brand-50/40"
              style={{
                fontFamily: `'${font.family}', sans-serif`,
                fontWeight: font.weight,
                fontSize: Math.min(28, Math.max(13, font.size / 2.4)),
              }}
              data-testid={`brand-panel-font-${role}`}
              dir="auto"
            >
              {label}
            </button>
          );
        })}
      </div>

      {(['photos', 'graphics', 'icons'] as const).map((section) =>
        brand[section].length ? (
          <div key={section}>
            <Heading>{t(`brand.sections.${section}`)}</Heading>
            <ImageTiles images={brand[section]} urls={urls} />
          </div>
        ) : null,
      )}

      {brand.voice.description || brand.voice.tone.length ? (
        <>
          <Heading>{t('brand.sections.voice')}</Heading>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            {brand.voice.description ? <p dir="auto">{brand.voice.description}</p> : null}
            {brand.voice.tone.length ? (
              <div className="flex flex-wrap gap-1">
                {brand.voice.tone.map((w) => (
                  <span key={w} className="rounded-full bg-white px-2 py-0.5 text-xs text-brand-700">
                    {w}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
