'use client';

/** Brand kits: the list (`/brand`) and one kit (`/brand?id=…`). */
import '@/lib/font-faces';
import { Palette, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BrandKitEditor } from '@/components/brand/brand-kit';
import { DashboardShell } from '@/components/dashboard/shell';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { brandsChanged, useAssetUrls, useBrands } from '@/hooks/use-brands';
import { useI18n } from '@/i18n';
import { brandColors, createBrand } from '@/lib/storage/brands';

function BrandList() {
  const { t } = useI18n();
  const router = useRouter();
  const { brands } = useBrands();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const logos = useAssetUrls((brands ?? []).flatMap((b) => (b.logos[0] ? [b.logos[0].hash] : [])));
  const create = async () => {
    const brand = await createBrand(name || t('brand.defaultName'));
    brandsChanged();
    setCreating(false);
    setName('');
    router.push(`/brand?id=${brand.id}`);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('brand.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('brand.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-brand">
          <Plus className="size-4" />
          {t('brand.newKit')}
        </Button>
      </div>
      {brands === null ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : brands.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Palette className="size-7" />
          </span>
          <p className="max-w-md text-sm text-slate-600">{t('brand.empty')}</p>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('brand.newKit')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="brand-list">
          {brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/brand?id=${b.id}`}
                className="block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-md"
                data-testid="brand-card"
              >
                <div className="flex h-28 items-center justify-center bg-slate-50">
                  {b.logos[0] && logos[b.logos[0].hash] ? (
                    <BlobImage src={logos[b.logos[0].hash]} className="max-h-20 max-w-[70%] object-contain" />
                  ) : (
                    <span
                      className="text-3xl font-bold"
                      style={{
                        color: brandColors(b)[0] ?? '#7c6cf8',
                        fontFamily: `'${b.fonts.heading.family}', sans-serif`,
                      }}
                    >
                      {b.name.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <p className="truncate font-semibold text-slate-900">{b.name}</p>
                  <div className="flex gap-1">
                    {brandColors(b)
                      .slice(0, 8)
                      .map((c) => (
                        <span
                          key={c}
                          className="size-5 rounded-full border border-black/10"
                          style={{ background: c }}
                        />
                      ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title={t('brand.newKit')}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void create()} data-testid="create-brand">
              {t('common.create')}
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('brand.kitName')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            placeholder={t('brand.defaultName')}
            maxLength={100}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            data-testid="brand-kit-name"
          />
        </label>
      </Dialog>
    </div>
  );
}

function BrandPage() {
  const params = useSearchParams();
  const id = params.get('id');
  const { brands } = useBrands();
  const { t } = useI18n();
  if (!id) return <BrandList />;
  if (brands === null) return <p className="p-8 text-sm text-slate-500">{t('common.loading')}</p>;
  const brand = brands.find((b) => b.id === id);
  if (!brand)
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('brand.notFound')}{' '}
        <Link href="/brand" className="font-medium text-brand-600 hover:underline">
          {t('brand.allKits')}
        </Link>
      </div>
    );
  return <BrandKitEditor brand={brand} />;
}

export default function Page() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <BrandPage />
      </Suspense>
    </DashboardShell>
  );
}
