'use client';

/**
 * Settings → Plugins: install (after reviewing what a plugin asks for), turn
 * plugins on and off, and uninstall them.
 */
import { BookOpen, CloudUpload, Globe, Puzzle, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { usePluginIcon, usePlugins } from '@/hooks/use-plugins';
import { useI18n } from '@/i18n';
import { pluginDocsUrl } from '@/lib/plugins/docs';
import { localizedManifest, PluginError, type PluginManifest } from '@/lib/plugins/manifest';
import { PLUGIN_ACCEPT } from '@/lib/plugins/package';
import {
  type InstalledPlugin,
  inspectPlugin,
  installPlugin,
  type PluginInspection,
  setPluginEnabled,
  uninstallPlugin,
} from '@/lib/storage/plugins';
import { cn } from '@/lib/utils';

function Permissions({ manifest }: { manifest: PluginManifest }) {
  const { t } = useI18n();
  if (manifest.permissions.length === 0) {
    return <p className="text-sm text-slate-600">{t('settings.plugins.asksNothing')}</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-800">{t('settings.plugins.asks')}</p>
      <ul className="space-y-1" data-testid="plugin-permissions">
        {manifest.permissions.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
            {p === 'network' ? (
              <Globe className="mt-0.5 size-4 shrink-0 text-amber-600" />
            ) : (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
            )}
            <span>
              {t(`settings.plugins.permissions.${p}`)}
              {p === 'network' && manifest.network.length ? (
                <span className="block text-xs text-slate-500" dir="ltr">
                  {t('settings.plugins.network', { hosts: manifest.network.join(', ') })}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contributions({ manifest }: { manifest: PluginManifest }) {
  const { t, formatNumber } = useI18n();
  const c = manifest.contributes;
  const parts = [
    c.commands.length ? t('settings.plugins.commands', { count: formatNumber(c.commands.length) }) : null,
    c.iconPacks.length ? t('settings.plugins.iconPacks', { count: formatNumber(c.iconPacks.length) }) : null,
    c.fonts.length ? t('settings.plugins.fonts', { count: formatNumber(c.fonts.length) }) : null,
    manifest.panel ? t('settings.plugins.panel') : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="text-sm text-slate-600">
      {t('settings.plugins.adds')} {parts.join(' · ')}
    </p>
  );
}

function PluginRow({ plugin, onUninstall }: { plugin: InstalledPlugin; onUninstall: () => void }) {
  const { t, locale } = useI18n();
  const icon = usePluginIcon(plugin);
  const m = plugin.manifest;
  const { name, description } = localizedManifest(m, locale);
  return (
    <li
      className="flex flex-wrap items-start gap-4 py-4"
      data-testid="installed-plugin"
      data-plugin-id={plugin.id}
    >
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-600">
        {icon ? <BlobImage src={icon} className="size-11 object-contain" /> : <Puzzle className="size-6" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-semibold text-slate-900">
          {name}{' '}
          <span className="text-xs font-normal text-slate-500" dir="ltr">
            {m.version}
          </span>
        </p>
        <p className="text-sm text-slate-600">{description}</p>
        <p className="text-xs text-slate-500">
          {t('settings.plugins.by', { author: m.author })}
          {m.homepage ? (
            <>
              {' · '}
              <a
                href={m.homepage}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-600 hover:underline"
              >
                {new URL(m.homepage).host}
              </a>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {m.permissions.map((p) => (
            <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {t(`settings.plugins.permissions.${p}`)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={plugin.enabled}
          aria-label={t('settings.plugins.enable', { name })}
          onClick={() => void setPluginEnabled(plugin.id, !plugin.enabled)}
          className={cn(
            'relative h-6 w-11 rounded-full transition',
            plugin.enabled ? 'bg-brand-600' : 'bg-slate-300',
          )}
          data-testid="plugin-toggle"
        >
          <span
            className={cn(
              'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
              plugin.enabled ? 'start-[22px]' : 'start-0.5',
            )}
          />
        </button>
        <span className="w-12 text-xs text-slate-500">
          {plugin.enabled ? t('settings.plugins.enabled') : t('settings.plugins.disabled')}
        </span>
        <Button size="sm" variant="ghost" onClick={onUninstall} data-testid="plugin-uninstall">
          <Trash2 className="size-4" />
          {t('settings.plugins.uninstall')}
        </Button>
      </div>
    </li>
  );
}

export function PluginsSettings() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const plugins = usePlugins();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [review, setReview] = useState<PluginInspection | null>(null);
  const [problem, setProblem] = useState<{ message: string; issues: string[] } | null>(null);
  const [removing, setRemoving] = useState<InstalledPlugin | null>(null);

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      setReview(await inspectPlugin(file));
    } catch (error) {
      setProblem({
        message: error instanceof Error ? error.message : String(error),
        issues: error instanceof PluginError ? error.issues : [],
      });
    }
  };

  const [installing, setInstalling] = useState(false);
  const confirm = async () => {
    if (!review || installing) return;
    const { pkg, installed } = review;
    // The dialog stays open until the plugin is stored.
    setInstalling(true);
    try {
      const record = await installPlugin(pkg);
      const name = localizedManifest(record.manifest, locale).name;
      toast(
        installed
          ? t('settings.plugins.updated', { name, version: record.manifest.version })
          : t('settings.plugins.installed', { name }),
        'success',
      );
      setReview(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setInstalling(false);
    }
  };

  const reviewName = review ? localizedManifest(review.pkg.manifest, locale) : null;
  return (
    <section className="space-y-4" aria-labelledby="plugins-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="plugins-title" className="text-lg font-semibold text-slate-900">
            {t('settings.plugins.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('settings.plugins.hint')}</p>
          <a
            href={pluginDocsUrl(locale)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            <BookOpen className="size-4" />
            {t('settings.plugins.docs')}
          </a>
        </div>
        <Button variant="primary" onClick={() => input.current?.click()}>
          <CloudUpload className="size-4" />
          {t('settings.plugins.install')}
        </Button>
        <input
          ref={input}
          type="file"
          accept={PLUGIN_ACCEPT}
          hidden
          data-testid="plugin-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void open(file);
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
          void open(e.dataTransfer.files[0]);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-sm text-slate-500 transition',
          dragging
            ? 'border-brand-400 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white hover:border-brand-300',
        )}
      >
        <Puzzle className="size-6" />
        {t('settings.plugins.drop')}
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white px-5">
        {plugins === null ? (
          <p className="py-6 text-sm text-slate-500">{t('common.loading')}</p>
        ) : plugins.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">{t('settings.plugins.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plugins.map((p) => (
              <PluginRow key={p.id} plugin={p} onUninstall={() => setRemoving(p)} />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={review !== null}
        onOpenChange={(o) => !o && setReview(null)}
        title={t('settings.plugins.review')}
        footer={
          <>
            <Button onClick={() => setReview(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={installing}
              onClick={() => void confirm()}
              data-testid="plugin-confirm-install"
            >
              {review?.installed ? t('settings.plugins.confirmUpdate') : t('settings.plugins.confirmInstall')}
            </Button>
          </>
        }
      >
        {review && reviewName ? (
          <div
            className="space-y-3"
            data-testid="plugin-review"
            data-plugin-id={JSON.stringify(review.pkg.manifest.id)}
          >
            <div>
              <p className="text-base font-semibold text-slate-900">
                {reviewName.name}{' '}
                <span className="text-xs font-normal text-slate-500" dir="ltr">
                  {review.pkg.manifest.version}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {t('settings.plugins.by', { author: review.pkg.manifest.author })}
              </p>
              <p className="mt-1 text-sm text-slate-600">{reviewName.description}</p>
            </div>
            <Permissions manifest={review.pkg.manifest} />
            <Contributions manifest={review.pkg.manifest} />
            {review.installed ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {review.versionChange < 0
                  ? t('settings.plugins.older', { version: review.installed.manifest.version })
                  : review.versionChange === 0
                    ? t('settings.plugins.same')
                    : t('settings.plugins.update', { version: review.installed.manifest.version })}
              </p>
            ) : null}
            <p className="text-xs text-amber-700">{t('settings.plugins.trust')}</p>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={problem !== null}
        onOpenChange={(o) => !o && setProblem(null)}
        title={t('settings.plugins.invalid')}
        footer={<Button onClick={() => setProblem(null)}>{t('common.close')}</Button>}
      >
        <div className="space-y-2" data-testid="plugin-problem">
          <p className="text-sm text-slate-700">{problem?.message}</p>
          {problem?.issues.length ? (
            <ul className="list-disc space-y-1 ps-5 font-mono text-xs text-red-700" dir="ltr">
              {problem.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('settings.plugins.uninstall')}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-testid="plugin-confirm-uninstall"
              onClick={() => {
                if (!removing) return;
                const name = localizedManifest(removing.manifest, locale).name;
                setRemoving(null);
                void uninstallPlugin(removing.id).then(() =>
                  toast(t('settings.plugins.uninstalled', { name }), 'success'),
                );
              }}
            >
              {t('settings.plugins.uninstall')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {removing
            ? t('settings.plugins.uninstallConfirm', {
                name: localizedManifest(removing.manifest, locale).name,
              })
            : null}
        </p>
      </Dialog>
    </section>
  );
}
