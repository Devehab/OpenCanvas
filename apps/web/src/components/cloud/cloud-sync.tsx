'use client';

/**
 * Cloud sync in the interface: the background service (one per tab), its
 * status button (dashboard and editor) and the "on this computer only"
 * badge of designs waiting to upload. Nothing shows when cloud sync is off.
 */
import { AlertTriangle, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { Popover } from 'radix-ui';
import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/i18n';
import { type CloudStatus, CloudSyncService } from '@/lib/cloud/service';
import { cn } from '@/lib/utils';

const ServiceContext = createContext<CloudSyncService | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [service, setService] = useState<CloudSyncService | null>(null);
  useEffect(() => {
    const s = new CloudSyncService({ conflictTitle: (title) => t('cloud.conflictCopy', { title }) });
    s.start();
    setService(s);
    return () => s.stop();
  }, [t]);
  return <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>;
}

const OFF: CloudStatus = {
  mode: 'unknown',
  state: 'idle',
  pending: new Set(),
  lastSyncedAt: null,
  error: null,
  provider: null,
  bucket: null,
  rounds: 0,
};

export function useCloudStatus(): CloudStatus {
  const service = useContext(ServiceContext);
  return useSyncExternalStore(
    (listener) => service?.subscribe(listener) ?? (() => {}),
    () => service?.current ?? OFF,
    () => OFF,
  );
}

/** True when the design has changes saved on this computer only (cloud sync on). */
export function useLocalOnly(designId: string): boolean {
  const status = useCloudStatus();
  return status.mode === 'cloud' && status.pending.has(`designs/${designId}`);
}

export function LocalOnlyBadge({ designId, className }: { designId: string; className?: string }) {
  const { t } = useI18n();
  if (!useLocalOnly(designId)) return null;
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm',
        className,
      )}
      title={t('cloud.localOnly')}
      data-testid="local-only-badge"
    >
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      <span aria-hidden>{t('cloud.localOnlyShort')}</span>
      <span className="sr-only">{t('cloud.localOnly')}</span>
    </span>
  );
}

function label(status: CloudStatus, t: ReturnType<typeof useI18n>['t']): string {
  if (status.state === 'syncing') return t('cloud.syncing');
  if (status.state === 'offline') return t('cloud.offline');
  if (status.state === 'error') return t('cloud.error');
  if (status.pending.size > 0) return t('cloud.waiting', { count: status.pending.size });
  return t('cloud.synced');
}

/** The sync status, with details and "Sync now" in a popover. */
export function CloudStatusButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t, formatRelative } = useI18n();
  const service = useContext(ServiceContext);
  const status = useCloudStatus();
  if (status.mode !== 'cloud') return null;
  const waiting = status.pending.size > 0;
  const icon =
    status.state === 'syncing' ? (
      <Loader2 className="size-4 animate-spin" />
    ) : status.state === 'offline' ? (
      <CloudOff className="size-4" />
    ) : status.state === 'error' ? (
      <AlertTriangle className="size-4" />
    ) : waiting ? (
      <RefreshCw className="size-4" />
    ) : (
      <Cloud className="size-4" />
    );
  const hint =
    status.state === 'offline'
      ? t('cloud.offlineHint')
      : status.state === 'error'
        ? t('cloud.errorHint')
        : waiting
          ? t('cloud.offlineHint')
          : t('cloud.syncedHint');
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium',
          tone === 'dark' ? 'text-white/85 hover:bg-white/15' : 'text-slate-600 hover:bg-slate-100',
          status.state === 'offline' && (tone === 'dark' ? 'text-amber-200' : 'text-amber-700'),
          status.state === 'error' && (tone === 'dark' ? 'text-red-200' : 'text-red-700'),
        )}
        data-testid="cloud-status"
        data-state={status.state}
        data-pending={status.pending.size}
        data-rounds={status.rounds}
      >
        {icon}
        <span
          className={cn('truncate', tone === 'dark' && 'max-lg:sr-only')}
          role="status"
          aria-live="polite"
        >
          {label(status, t)}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-xl"
          data-testid="cloud-details"
        >
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            {icon}
            {t('cloud.title')}
          </p>
          <p className="text-xs text-slate-500">
            {t('cloud.where', {
              provider: t(`cloud.providers.${status.provider ?? 'custom'}`),
              bucket: status.bucket ?? '',
            })}
          </p>
          <p className="text-slate-700">{label(status, t)}</p>
          <p className="text-xs leading-relaxed text-slate-500">{hint}</p>
          {status.error && status.state === 'error' ? (
            <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{status.error}</p>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-400">
              {status.lastSyncedAt
                ? t('cloud.lastSynced', { time: formatRelative(status.lastSyncedAt) })
                : t('cloud.neverSynced')}
            </span>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={status.state === 'syncing'}
              onClick={() => void service?.syncNow()}
              data-testid="cloud-sync-now"
            >
              <RefreshCw className="size-3.5" />
              {t('cloud.syncNow')}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The sidebar note on where designs are saved. */
export function StorageNotice() {
  const { t } = useI18n();
  const status = useCloudStatus();
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      {status.mode === 'cloud' ? t('cloud.localNotice') : t('home.localNotice')}
    </p>
  );
}
