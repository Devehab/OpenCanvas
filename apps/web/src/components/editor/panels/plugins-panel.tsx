'use client';

/**
 * Plugins panel: the commands of every enabled plugin, and the interface of
 * plugins that have one (their sandboxed frame, shown over this panel).
 */
import { BookOpen, ExternalLink, Loader2, Play, Puzzle, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { usePluginHostVersion, usePluginIcon } from '@/hooks/use-plugins';
import { useI18n } from '@/i18n';
import { pluginDocsUrl } from '@/lib/plugins/docs';
import type { PluginHost } from '@/lib/plugins/host';
import { localizedManifest } from '@/lib/plugins/manifest';
import type { InstalledPlugin } from '@/lib/storage/plugins';

/** True when the selection is one image (or a frame holding one). */
export function useImageSelected(): boolean {
  return useEditorValue((e) => {
    if (e.selectedIds.length !== 1) return false;
    const node = e.store.getNode(e.selectedIds[0]!);
    if (node?.type === 'image') return true;
    return node?.type === 'frame' && e.store.getChildren(node.id).some((c) => c.type === 'image');
  });
}

/** Runs a plugin command, reporting failures. */
export function useRunPluginCommand() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { pluginHost } = useEditorContext();
  return (plugin: InstalledPlugin, command: string) => {
    if (!pluginHost) return;
    const name = localizedManifest(plugin.manifest, locale).name;
    void pluginHost.runCommand(plugin.id, command).catch((error: Error) => {
      toast(t('editor.plugins.failed', { name, message: error.message }), 'error');
    });
  };
}

/** Keeps a plugin's frame laid over this placeholder while it is shown. */
function PluginFrame({ host, plugin }: { host: PluginHost; plugin: InstalledPlugin }) {
  const slot = useRef<HTMLDivElement>(null);
  usePluginHostVersion(host);
  const instance = host.instance(plugin.id);
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el) return;
    const frame = instance.frame;
    const place = () => {
      const r = el.getBoundingClientRect();
      Object.assign(frame.style, {
        display: r.width > 0 ? 'block' : 'none',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      frame.style.display = 'none';
    };
  }, [instance]);
  return (
    <div
      ref={slot}
      className="rounded-lg border border-slate-200 bg-white"
      style={{ height: instance.height }}
      data-testid="plugin-frame-slot"
    />
  );
}

function PluginCard({ plugin }: { plugin: InstalledPlugin }) {
  const { t, locale } = useI18n();
  const { pluginHost } = useEditorContext();
  const icon = usePluginIcon(plugin);
  const imageSelected = useImageSelected();
  const run = useRunPluginCommand();
  const [open, setOpen] = useState(false);
  usePluginHostVersion(pluginHost);
  const { name, description } = localizedManifest(plugin.manifest, locale);
  const running = pluginHost?.running?.pluginId === plugin.id ? pluginHost.running.command : null;
  const commands = plugin.manifest.contributes.commands;
  return (
    <li
      className="space-y-2 rounded-xl border border-slate-200 p-3"
      data-testid="plugin-card"
      data-plugin-id={plugin.id}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">
          {icon ? <BlobImage src={icon} className="size-9 object-contain" /> : <Puzzle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
          <p className="line-clamp-2 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {commands.length ? (
        <div className="flex flex-wrap gap-1.5">
          {commands.map((c) => {
            const needsImage = c.context === 'image' && !imageSelected;
            const title = locale === 'ar' && c.titleAr ? c.titleAr : c.title;
            return (
              <Button
                key={c.id}
                size="sm"
                disabled={needsImage || !!pluginHost?.running}
                title={needsImage ? t('editor.plugins.needsImage') : undefined}
                onClick={() => run(plugin, c.id)}
                data-testid={`plugin-command-${c.id}`}
              >
                {running === c.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {title}
              </Button>
            );
          })}
        </div>
      ) : null}
      {plugin.manifest.panel && pluginHost ? (
        open ? (
          <div className="space-y-1.5">
            <PluginFrame host={pluginHost} plugin={plugin} />
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              <X className="size-4" />
              {t('editor.plugins.close')}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)} data-testid="plugin-open-panel">
            {t('editor.plugins.open')}
          </Button>
        )
      ) : null}
    </li>
  );
}

export function PluginsPanel() {
  const { t, locale } = useI18n();
  const { pluginHost } = useEditorContext();
  usePluginHostVersion(pluginHost);
  const plugins = pluginHost?.enabledPlugins ?? [];
  return (
    <div className="space-y-3 p-3" data-testid="plugins-panel">
      {plugins.length === 0 ? (
        <p className="px-1 py-4 text-sm text-slate-500">{t('editor.plugins.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {plugins.map((p) => (
            <PluginCard key={p.id} plugin={p} />
          ))}
        </ul>
      )}
      <a
        href="/settings?tab=plugins"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 px-1 text-sm font-medium text-brand-600 hover:underline"
      >
        <ExternalLink className="size-4" />
        {t('editor.plugins.manage')}
      </a>
      <a
        href={pluginDocsUrl(locale)}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-1.5 px-1 text-sm font-medium text-brand-600 hover:underline"
        data-testid="plugin-docs-link"
      >
        <BookOpen className="size-4" />
        {t('editor.plugins.docs')}
      </a>
    </div>
  );
}

/** Menu items for enabled plugins' commands of one context (image or page menus). */
export function PluginCommandItems({ context, before }: { context: 'image' | 'page'; before?: () => void }) {
  const { locale } = useI18n();
  const { pluginHost } = useEditorContext();
  usePluginHostVersion(pluginHost);
  const run = useRunPluginCommand();
  const items = (pluginHost?.enabledPlugins ?? []).flatMap((plugin) =>
    plugin.manifest.contributes.commands
      .filter((c) => c.context === context)
      .map((c) => ({ plugin, command: c })),
  );
  if (items.length === 0) return null;
  return (
    <>
      <MenuSeparator />
      {items.map(({ plugin, command }) => (
        <MenuItem
          key={`${plugin.id}/${command.id}`}
          icon={<Puzzle className="size-4" />}
          disabled={!!pluginHost?.running}
          testId={`plugin-menu-${command.id}`}
          onSelect={() => {
            before?.();
            run(plugin, command.id);
          }}
        >
          {locale === 'ar' && command.titleAr ? command.titleAr : command.title}
        </MenuItem>
      ))}
    </>
  );
}
