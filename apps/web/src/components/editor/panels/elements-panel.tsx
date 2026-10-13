'use client';

import type { AnyNodeProps } from '@opencanvas/core';
import { ArrowLeft, Search, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CustomIconPreview } from '@/components/ui/custom-icon';
import { Segmented, SelectField } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { useEditorContext } from '@/hooks/use-editor';
import { useIconPacks } from '@/hooks/use-icon-packs';
import { useI18n } from '@/i18n';
import {
  ALL_ELEMENTS,
  BASIC_FRAMES,
  DEVICE_FRAMES,
  type ElementItem,
  type ElementSection,
  elementMatches,
  FRAME_SECTIONS,
  GRID_FRAMES,
  type Label,
  PHOTO_FRAMES,
  SHAPE_SECTIONS,
} from '@/lib/element-library';
import {
  customIconProps,
  flagSource,
  ICON_CATEGORIES,
  ICON_LIBRARIES,
  ICON_TOTAL,
  type IconCategory,
  iconProps,
  iconSet,
  isImageIcon,
  type LibraryIcon,
  LOADABLE_SETS,
  loadIconSet,
  POPULAR_ICONS,
  STARTER_SETS,
  searchCustomIcons,
  searchIcons,
} from '@/lib/icon-library';
import { insertLibraryImage, LIBRARY_IMAGE_DRAG_TYPE } from '@/lib/library-image';
import { type RecentElement, useRecentElements } from '@/lib/recent-elements';
import type { CustomIcon } from '@/lib/storage/db';
import { cn } from '@/lib/utils';
import { ELEMENT_DRAG_TYPE } from '../side-panel';
import { ElementPreview } from './element-preview';

type View =
  | { kind: 'home' }
  | { kind: 'section'; section: ElementSection }
  | { kind: 'frames' }
  | { kind: 'icons'; category: IconCategory | null };

const testIdOf = (id: string) => `element-${id.replace(/[:/]/g, '-')}`;

function useLabel() {
  const { locale } = useI18n();
  return (label: Label) => (locale === 'ar' ? label.ar : label.en);
}

/**
 * Loads icon sets (each once, all fetched at the same time) and lists their
 * icons in set order as they arrive, so the first ones show before the rest
 * of a large library has loaded.
 */
function useIcons(sets: readonly string[]) {
  const key = sets.join(',');
  const [state, setState] = useState<{
    key: string;
    icons: LibraryIcon[] | null;
    done: boolean;
    failed: boolean;
  }>({
    key,
    icons: null,
    done: false,
    failed: false,
  });
  useEffect(() => {
    let alive = true;
    const ids = key.split(',').filter(Boolean);
    const pending = ids.map((id) => loadIconSet(id));
    setState({ key, icons: null, done: false, failed: false });
    (async () => {
      const icons: LibraryIcon[] = [];
      for (const promise of pending) {
        try {
          icons.push(...(await promise));
        } catch {
          if (alive) setState((s) => ({ ...s, failed: !s.icons, done: true }));
          return;
        }
        if (alive) setState({ key, icons: [...icons], done: false, failed: false });
      }
      if (alive) setState({ key, icons, done: true, failed: false });
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  const current = state.key === key;
  return {
    icons: current ? state.icons : null,
    loading: !current || !state.done,
    failed: current && state.failed,
  };
}

/** Tile that inserts on click and can be dragged onto the canvas. */
function Tile({
  props,
  label,
  testId,
  onInsert,
  wide,
  children,
}: {
  props: AnyNodeProps;
  label: string;
  testId: string;
  onInsert: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const { editor } = useEditorContext();
  return (
    <button
      type="button"
      draggable
      title={label}
      aria-label={label}
      data-testid={testId}
      onDragStart={(e) => {
        e.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(props));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDragEnd={(e) => {
        if (e.dataTransfer.dropEffect !== 'none') onInsert();
      }}
      onClick={() => {
        editor.insertNodes([props]);
        onInsert();
      }}
      className={cn(
        'flex items-center justify-center rounded-lg bg-slate-50 p-2 text-slate-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-400',
        wide ? 'aspect-[2/1]' : 'aspect-square',
      )}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  onSeeAll,
  seeAllLabel,
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-4 first:mt-3">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {onSeeAll ? (
        <button
          type="button"
          onClick={onSeeAll}
          aria-label={seeAllLabel}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          {t('home.seeAll')}
        </button>
      ) : null}
    </div>
  );
}

const GRID: Record<2 | 3 | 4 | 5, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

export function ElementsPanel() {
  const { t } = useI18n();
  const label = useLabel();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'home' });
  const { recent, remember } = useRecentElements();
  const scroller = useRef<HTMLDivElement>(null);

  const open = (next: View) => {
    setView(next);
    scroller.current?.parentElement?.scrollTo({ top: 0 });
  };

  const elementTile = (element: ElementItem, wide = false) => (
    <Tile
      key={element.id}
      props={element.props}
      label={label(element.label)}
      testId={testIdOf(element.id)}
      wide={wide}
      onInsert={() =>
        remember({ id: element.id, label: element.label, props: element.props, kind: 'element' })
      }
    >
      <ElementPreview props={element.props} className="size-full" />
    </Tile>
  );

  const grid = (items: ElementItem[], columns: 2 | 3 | 4) => (
    <div className={cn('grid gap-2 px-4', GRID[columns])}>
      {items.map((e) => elementTile(e, columns === 2))}
    </div>
  );

  let body: ReactNode;
  if (query.trim()) {
    body = <SearchResults query={query} onRemember={remember} />;
  } else if (view.kind === 'section') {
    body = (
      <>
        <BackHeader title={label(view.section.title)} onBack={() => open({ kind: 'home' })} />
        {grid(view.section.items, view.section.columns)}
      </>
    );
  } else if (view.kind === 'frames') {
    body = (
      <>
        <BackHeader title={t('editor.elements.frames')} onBack={() => open({ kind: 'home' })} />
        <p className="px-4 pb-1 text-xs text-slate-500">{t('editor.elements.framesHint')}</p>
        {FRAME_SECTIONS.map((section) => (
          <div key={section.id}>
            <SectionHeader title={label(section.title)} />
            {grid(section.items, section.columns)}
          </div>
        ))}
      </>
    );
  } else if (view.kind === 'icons') {
    body = (
      <IconBrowser
        category={view.category}
        onCategory={(category) => setView({ kind: 'icons', category })}
        onBack={() => open({ kind: 'home' })}
        onRemember={remember}
        query=""
      />
    );
  } else {
    body = (
      <>
        {recent.length ? (
          <>
            <SectionHeader title={t('editor.elements.recent')} />
            <div className="grid grid-cols-4 gap-2 px-4">
              {recent.slice(0, 8).map((r) => (
                <Tile
                  key={r.id}
                  props={r.props}
                  label={label(r.label)}
                  testId={`recent-${testIdOf(r.id)}`}
                  onInsert={() => remember(r)}
                >
                  <ElementPreview props={r.props} className="size-full" />
                </Tile>
              ))}
            </div>
          </>
        ) : null}
        {SHAPE_SECTIONS.map((section) => (
          <div key={section.id}>
            <SectionHeader
              title={label(section.title)}
              onSeeAll={() => open({ kind: 'section', section })}
              seeAllLabel={`${t('home.seeAll')} · ${label(section.title)}`}
            />
            {grid(section.items.slice(0, section.columns === 2 ? 4 : 8), section.columns)}
          </div>
        ))}
        <SectionHeader
          title={t('editor.elements.frames')}
          onSeeAll={() => open({ kind: 'frames' })}
          seeAllLabel={`${t('home.seeAll')} · ${t('editor.elements.frames')}`}
        />
        <p className="px-4 pb-2 text-xs text-slate-500">{t('editor.elements.framesHint')}</p>
        {grid(BASIC_FRAMES.slice(0, 8), 4)}
        <div className="mt-2">{grid([PHOTO_FRAMES[0]!, GRID_FRAMES[2]!, DEVICE_FRAMES[0]!], 3)}</div>
        <CustomIcons onRemember={remember} limit={10} />
        <IconsPreview onSeeAll={(category) => open({ kind: 'icons', category })} onRemember={remember} />
      </>
    );
  }

  return (
    <div ref={scroller} className="pb-6">
      <div className="sticky top-0 z-[5] bg-white px-4 pb-2 pt-10">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('editor.elements.search')}
            aria-label={t('editor.elements.search')}
            data-testid="elements-search"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 ps-8 pe-8 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>
      </div>
      {body}
    </div>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 px-2 pb-1 pt-1">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common.back')}
        className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        data-testid="elements-back"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
      </button>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    </div>
  );
}

function IconTile({ icon, onRemember }: { icon: LibraryIcon; onRemember: (r: RecentElement) => void }) {
  if (isImageIcon(icon)) return <FlagTile icon={icon} />;
  return <PathIconTile icon={icon} onRemember={onRemember} />;
}

function PathIconTile({ icon, onRemember }: { icon: LibraryIcon; onRemember: (r: RecentElement) => void }) {
  const props = useMemo(() => iconProps(icon), [icon]);
  const set = iconSet(icon);
  const name = icon.name.replace(/-/g, ' ');
  const stroked = set?.mode === 'stroke';
  const size = set?.viewBox || 24;
  return (
    <Tile
      props={props}
      label={`${name} · ${set?.library ?? ''}`}
      testId={`icon-${icon.id.replace('/', '-')}`}
      onInsert={() =>
        onRemember({ id: `icon:${icon.id}`, label: { en: name, ar: name }, props, kind: 'icon' })
      }
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-6"
        fill={stroked ? 'none' : 'currentColor'}
        fillRule={icon.evenodd ? 'evenodd' : 'nonzero'}
        stroke={stroked ? 'currentColor' : 'none'}
        strokeWidth={stroked ? (set?.strokeWidth ?? 2) : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={icon.path} />
      </svg>
    </Tile>
  );
}

/** A flag: a full-colour picture, added to the design as an image. */
function FlagTile({ icon }: { icon: LibraryIcon }) {
  const { editor } = useEditorContext();
  const { t } = useI18n();
  const toast = useToast();
  const src = flagSource(icon);
  const name = icon.name.replace(/-/g, ' ');
  return (
    <button
      type="button"
      draggable
      title={name}
      aria-label={name}
      data-testid={`icon-${icon.id.replace('/', '-')}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(LIBRARY_IMAGE_DRAG_TYPE, JSON.stringify({ src, name }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        insertLibraryImage(editor, src, name).catch(() => toast(t('editor.elements.flagFailed'), 'error'));
      }}
      className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 p-1.5 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-400"
    >
      {/* biome-ignore lint/performance/noImgElement: a small static SVG; Next's image optimizer does not take SVG */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full rounded-[3px] shadow-[0_0_0_1px_rgb(15_23_42/0.08)]"
      />
    </button>
  );
}

function CustomIconTile({ icon, onRemember }: { icon: CustomIcon; onRemember: (r: RecentElement) => void }) {
  const props = useMemo(() => customIconProps(icon), [icon]);
  return (
    <Tile
      props={props}
      label={icon.name}
      testId={`custom-icon-${icon.id.replace(/[^a-z0-9-]/gi, '-')}`}
      onInsert={() =>
        onRemember({
          id: `custom-icon:${icon.id}`,
          label: { en: icon.name, ar: icon.name },
          props,
          kind: 'icon',
        })
      }
    >
      <CustomIconPreview icon={icon} className="size-6" />
    </Tile>
  );
}

/** "Your icons": uploaded icons and those of enabled plugins. */
function CustomIcons({
  query = '',
  onRemember,
  limit,
}: {
  query?: string;
  onRemember: (r: RecentElement) => void;
  limit?: number;
}) {
  const { t } = useI18n();
  const packs = useIconPacks({ usable: true });
  const icons = useMemo(
    () =>
      searchCustomIcons(
        (packs ?? []).flatMap((p) => p.icons),
        query,
      ),
    [packs, query],
  );
  if (icons.length === 0) return null;
  return (
    <div data-testid="custom-icons">
      <SectionHeader title={t('settings.icons.title')} />
      <div className="grid grid-cols-5 gap-2 px-4">
        {icons.slice(0, limit ?? 200).map((icon) => (
          <CustomIconTile key={icon.id} icon={icon} onRemember={onRemember} />
        ))}
      </div>
    </div>
  );
}

function CategoryChips({
  value,
  onChange,
}: {
  value: IconCategory | null;
  onChange: (category: IconCategory | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]"
      role="toolbar"
      aria-label={t('editor.elements.iconCategories')}
    >
      {[null, ...ICON_CATEGORIES].map((c) => (
        <button
          key={c ?? 'all'}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'h-7 shrink-0 rounded-full border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50',
            value === c && 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-50',
          )}
        >
          {c ? t(`editor.elements.iconCategory.${c}`) : t('editor.uploads.all')}
        </button>
      ))}
    </div>
  );
}

function IconsPreview({
  onSeeAll,
  onRemember,
}: {
  onSeeAll: (category: IconCategory | null) => void;
  onRemember: (r: RecentElement) => void;
}) {
  const { t } = useI18n();
  const { icons, failed } = useIcons(STARTER_SETS);
  const popular = useMemo(() => {
    if (!icons) return [];
    const byId = new Map(icons.map((i) => [i.id, i]));
    return POPULAR_ICONS.slice(0, 20)
      .map((id) => byId.get(id))
      .filter((i): i is LibraryIcon => Boolean(i));
  }, [icons]);
  return (
    <>
      <SectionHeader
        title={t('editor.elements.icons')}
        onSeeAll={() => onSeeAll(null)}
        seeAllLabel={`${t('home.seeAll')} · ${t('editor.elements.icons')}`}
      />
      <CategoryChips value={null} onChange={onSeeAll} />
      <IconGrid icons={icons ? popular : null} failed={failed} onRemember={onRemember} />
    </>
  );
}

function IconGrid({
  icons,
  failed,
  loading = false,
  onRemember,
  limit,
}: {
  icons: LibraryIcon[] | null;
  failed: boolean;
  /** More sets are still loading: the list will grow. */
  loading?: boolean;
  onRemember: (r: RecentElement) => void;
  limit?: number;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(limit ?? 150);
  const first = icons?.[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list (not one that grows as sets load) starts from the first page again
  useEffect(() => setShown(limit ?? 150), [first, limit]);
  // Renders more icons as the end of the grid scrolls into view.
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + 150);
    });
    observer.current.observe(el);
  }, []);
  if (failed)
    return <p className="px-4 py-4 text-center text-sm text-red-600">{t('editor.elements.iconsFailed')}</p>;
  if (!icons)
    return (
      <div className="grid grid-cols-5 gap-1.5 px-4" aria-busy="true">
        {Array.from({ length: 15 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  if (!icons.length)
    return loading ? (
      <p className="py-4 text-center text-sm text-slate-500" aria-busy="true">
        {t('editor.elements.loadingIcons')}
      </p>
    ) : (
      <p className="py-4 text-center text-sm text-slate-500">{t('editor.elements.noIcons')}</p>
    );
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5 px-4" data-testid="icon-grid">
        {icons.slice(0, shown).map((icon) => (
          <IconTile key={icon.id} icon={icon} onRemember={onRemember} />
        ))}
      </div>
      {!limit && shown < icons.length ? <div ref={sentinel} className="h-8" /> : null}
      {!limit && loading ? (
        <p className="px-4 pt-3 text-center text-xs text-slate-500" aria-busy="true">
          {t('editor.elements.loadingIcons')}
        </p>
      ) : null}
    </>
  );
}

function IconBrowser({
  category,
  onCategory,
  onBack,
  onRemember,
  query,
}: {
  category: IconCategory | null;
  onCategory: (c: IconCategory | null) => void;
  onBack: () => void;
  onRemember: (r: RecentElement) => void;
  query: string;
}) {
  const { t, formatNumber } = useI18n();
  const [library, setLibrary] = useState<string>('all');
  // Flags are one library: choosing their category opens it.
  const sets =
    category === 'flags'
      ? ['flags']
      : library === 'all'
        ? LOADABLE_SETS
        : (ICON_LIBRARIES.find((l) => l.id === library)?.sets ?? LOADABLE_SETS);
  const { icons, failed, loading } = useIcons(sets);
  const flagsOnly = sets.length === 1 && sets[0] === 'flags';
  const [style, setStyle] = useState<'all' | 'outline' | 'filled'>('all');
  const results = useMemo(() => {
    if (!icons) return null;
    const found = searchIcons(icons, query, {
      category,
      style: style === 'all' || flagsOnly ? null : style,
      library: library === 'all' ? null : library,
    });
    if (query.trim()) return found;
    // Browsing: the most useful icons first, then every set in order.
    const popular = new Map(POPULAR_ICONS.map((id, i) => [id, i]));
    return [...found].sort((a, b) => (popular.get(a.id) ?? 1e6) - (popular.get(b.id) ?? 1e6));
  }, [icons, query, category, style, library, flagsOnly]);
  return (
    <>
      <BackHeader title={t('editor.elements.icons')} onBack={onBack} />
      <CategoryChips value={category} onChange={onCategory} />
      <div className="px-4 pb-2">
        <SelectField
          label={t('editor.elements.iconLibrary')}
          hideLabel
          testId="icon-library"
          value={library}
          onChange={setLibrary}
          options={[
            {
              value: 'all',
              label: t('editor.elements.allLibraries', { count: formatNumber(ICON_TOTAL) }),
            },
            ...ICON_LIBRARIES.map((l) => ({ value: l.id, label: `${l.name} (${formatNumber(l.count)})` })),
          ]}
        />
      </div>
      <div className="flex min-h-8 items-center justify-between gap-2 px-4 pb-2">
        {/* Flags have no outline and filled versions. */}
        {flagsOnly ? (
          <span />
        ) : (
          <Segmented
            showLabels
            label={t('editor.elements.iconStyle')}
            value={style}
            onChange={setStyle}
            options={[
              { value: 'all', label: t('editor.uploads.all') },
              { value: 'outline', label: t('editor.elements.outline') },
              { value: 'filled', label: t('editor.elements.filled') },
            ]}
          />
        )}
        {results ? (
          <span className="text-xs text-slate-500">
            {t('editor.elements.iconCount', { count: formatNumber(results.length) })}
          </span>
        ) : null}
      </div>
      <IconGrid icons={results} failed={failed} loading={loading} onRemember={onRemember} />
      <p className="px-4 pt-4 text-[11px] leading-relaxed text-slate-500">
        {t('editor.elements.iconCredits', {
          libraries: ICON_LIBRARIES.map((l) => `${l.name} (${l.license})`).join(', '),
        })}
      </p>
    </>
  );
}

function SearchResults({ query, onRemember }: { query: string; onRemember: (r: RecentElement) => void }) {
  const { t, formatNumber } = useI18n();
  const label = useLabel();
  const { icons, failed, loading } = useIcons(LOADABLE_SETS);
  const elements = useMemo(() => ALL_ELEMENTS.filter((e) => elementMatches(e, query)), [query]);
  const iconHits = useMemo(() => (icons ? searchIcons(icons, query) : null), [icons, query]);
  const shapes = elements.filter((e) => !e.id.startsWith('frame:'));
  const frames = elements.filter((e) => e.id.startsWith('frame:'));
  const tile = (e: ElementItem) => (
    <Tile
      key={e.id}
      props={e.props}
      label={label(e.label)}
      testId={testIdOf(e.id)}
      onInsert={() => onRemember({ id: e.id, label: e.label, props: e.props, kind: 'element' })}
    >
      <ElementPreview props={e.props} className="size-full" />
    </Tile>
  );
  const nothing = !elements.length && !loading && iconHits !== null && !iconHits.length;
  return (
    <div data-testid="elements-results">
      {nothing ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          {t('editor.elements.noResults', { query })}
        </p>
      ) : null}
      {shapes.length ? (
        <>
          <SectionHeader title={t('editor.elements.shapes')} />
          <div className="grid grid-cols-4 gap-2 px-4">{shapes.map(tile)}</div>
        </>
      ) : null}
      {frames.length ? (
        <>
          <SectionHeader title={t('editor.elements.frames')} />
          <div className="grid grid-cols-4 gap-2 px-4">{frames.map(tile)}</div>
        </>
      ) : null}
      <CustomIcons query={query} onRemember={onRemember} />
      {iconHits === null || iconHits.length || loading ? (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between px-4">
            <h3 className="text-sm font-semibold text-slate-800">{t('editor.elements.icons')}</h3>
            {iconHits ? (
              <span className="text-xs text-slate-500">
                {t('editor.elements.iconCount', { count: formatNumber(iconHits.length) })}
              </span>
            ) : null}
          </div>
          <IconGrid icons={iconHits} failed={failed} loading={loading} onRemember={onRemember} />
        </>
      ) : null}
    </div>
  );
}
