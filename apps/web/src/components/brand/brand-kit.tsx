'use client';

/**
 * Brand kit editor (dashboard): logos, colors, fonts, brand voice, photos,
 * graphics, icons and brand templates. Every change is saved immediately.
 */
import { createRandomIdGenerator, normalizeColor, parseUserColor } from '@opencanvas/core';
import {
  ArrowLeft,
  CloudUpload,
  Image as ImageIcon,
  LayoutTemplate,
  MessageSquareQuote,
  Palette,
  Plus,
  Shapes,
  Smile,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover } from 'radix-ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { BlobImage } from '@/components/ui/blob-image';
import { Button } from '@/components/ui/button';
import { ColorSwatch } from '@/components/ui/color-field';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { brandsChanged, useAssetUrls } from '@/hooks/use-brands';
import { useDesigns, useThumbnail } from '@/hooks/use-designs';
import { useFontCatalog } from '@/hooks/use-fonts';
import { useI18n } from '@/i18n';
import { broadcast, TAB_ID } from '@/lib/channel';
import { colorsFromImage } from '@/lib/palette-from-image';
import { getAssetBlob } from '@/lib/storage/assets';
import {
  type BrandImageSection,
  type BrandRecord,
  deleteBrand,
  MAX_PALETTE_COLORS,
  updateBrand,
} from '@/lib/storage/brands';
import { type DesignSummary, duplicateDesign } from '@/lib/storage/designs';
import { prepareImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

const newId = createRandomIdGenerator();
/** Colors offered for a new swatch (the first one not in the palette yet). */
const NEW_COLORS = [
  '#cbd5e1',
  '#f59e0b',
  '#10b981',
  '#0ea5e9',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
];

type Save = (change: (b: BrandRecord) => BrandRecord) => Promise<void>;

function Card({
  id,
  icon,
  title,
  hint,
  action,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5"
      data-testid={`brand-section-${id}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Upload grid for logos, photos, graphics or icons. */
function ImagesSection({
  brand,
  section,
  save,
}: {
  brand: BrandRecord;
  section: BrandImageSection;
  save: Save;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const images = brand[section];
  const urls = useAssetUrls(images.map((i) => i.hash));
  const icons: Record<BrandImageSection, ReactNode> = {
    logos: <Sparkles className="size-5" />,
    photos: <ImageIcon className="size-5" />,
    graphics: <Shapes className="size-5" />,
    icons: <Smile className="size-5" />,
  };
  const upload = async (files: File[]) => {
    setBusy(true);
    try {
      const added: BrandRecord['logos'] = [];
      for (const file of files) {
        const prepared = await prepareImage(file, file.name || section);
        if (!prepared.ok) {
          toast(t(`editor.uploads.errors.${prepared.reason}`, { name: prepared.name }), 'error');
          continue;
        }
        const { hash, mimeType, width, height, name } = prepared.asset;
        added.push({ hash, mimeType, width, height, name });
      }
      if (added.length) {
        await save((b) => ({
          ...b,
          [section]: [...b[section].filter((i) => !added.some((a) => a.hash === i.hash)), ...added],
        }));
        broadcast({ type: 'uploads-changed', tabId: TAB_ID });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      id={section}
      icon={icons[section]}
      title={t(`brand.sections.${section}`)}
      hint={t(`brand.hints.${section}`)}
      action={
        <Button
          size="sm"
          onClick={() => input.current?.click()}
          disabled={busy}
          data-testid={`brand-upload-${section}`}
        >
          <CloudUpload className="size-4" />
          {t('brand.upload')}
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        className="hidden"
        data-testid={`brand-input-${section}`}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void upload(files);
        }}
      />
      <section
        aria-label={t(`brand.sections.${section}`)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropping(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={cn('rounded-xl', dropping && 'ring-2 ring-brand-400')}
      >
        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 py-8 text-sm text-slate-500 hover:border-brand-300 hover:bg-brand-50/40"
          >
            <CloudUpload className="size-5 text-slate-400" />
            {t('brand.dropHere')}
          </button>
        ) : (
          <ul
            className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
            data-testid={`brand-images-${section}`}
          >
            {images.map((img) => (
              <li key={img.hash} className="group relative">
                <div className="oc-checker flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-2">
                  {urls[img.hash] ? (
                    <BlobImage src={urls[img.hash]} className="max-h-full max-w-full object-contain" />
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={t('brand.remove', { name: img.name })}
                  onClick={() =>
                    void save((b) => ({ ...b, [section]: b[section].filter((i) => i.hash !== img.hash) }))
                  }
                  className="absolute end-1.5 top-1.5 rounded-md bg-white/90 p-1 text-slate-600 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

function SwatchEditor({
  color,
  onChange,
  onRemove,
}: {
  color: string;
  onChange: (c: string) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(color);
  const [text, setText] = useState(color.toUpperCase());
  useEffect(() => {
    setDraft(color);
    setText(color.toUpperCase());
  }, [color]);
  const invalid = text.trim() !== '' && parseUserColor(text) === null;
  return (
    <Popover.Root onOpenChange={(open) => !open && draft !== color && onChange(draft)}>
      <Popover.Trigger
        className="rounded-lg ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label={t('brand.editColor', { color })}
        data-testid="brand-color"
        data-color={color}
      >
        <span
          className="block size-12 rounded-lg border border-black/10 shadow-sm"
          style={{ background: color }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-56 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="oc-colorful">
            <HexAlphaColorPicker
              color={draft}
              onChange={(c) => {
                const next = normalizeColor(c) ?? c;
                setDraft(next);
                setText(next.toUpperCase());
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <ColorSwatch color={draft} />
            <input
              value={text}
              onChange={(e) => {
                // Typing or pasting a valid code updates the picker right away.
                setText(e.target.value);
                const parsed = parseUserColor(e.target.value);
                if (parsed) setDraft(parsed);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const parsed = parseUserColor(text);
                if (parsed) {
                  setDraft(parsed);
                  setText(parsed.toUpperCase());
                  onChange(parsed);
                }
              }}
              onBlur={() => setText(draft.toUpperCase())}
              aria-label={t('brand.colorCode')}
              aria-invalid={invalid}
              title={invalid ? t('brand.invalidColor') : undefined}
              spellCheck={false}
              autoComplete="off"
              dir="ltr"
              className={cn(
                'h-8 min-w-0 flex-1 rounded-md border px-2 font-mono text-sm uppercase outline-none focus:ring-2',
                invalid
                  ? 'border-red-300 focus:ring-red-100'
                  : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100',
              )}
              data-testid="brand-color-input"
            />
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
              aria-label={t('brand.removeColor')}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The main colors of the brand's logos (computed from the stored images). */
function useLogoColors(brand: BrandRecord): string[] {
  const [colors, setColors] = useState<string[]>([]);
  const key = brand.logos.map((l) => l.hash).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the logo list
  useEffect(() => {
    let alive = true;
    void (async () => {
      const found: string[] = [];
      for (const logo of brand.logos.slice(0, 4)) {
        const blob = await getAssetBlob(logo.hash);
        if (!blob) continue;
        try {
          for (const c of await colorsFromImage(blob)) if (!found.includes(c)) found.push(c);
        } catch {
          // An image that cannot be decoded simply has no suggestions.
        }
      }
      if (alive) setColors(found.slice(0, MAX_PALETTE_COLORS));
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return colors;
}

function ColorsSection({ brand, save }: { brand: BrandRecord; save: Save }) {
  const { t } = useI18n();
  const logoColors = useLogoColors(brand);
  const used = new Set(brand.palettes.flatMap((p) => p.colors.map((c) => c.toLowerCase())));
  const suggestions = logoColors.filter((c) => !used.has(c.toLowerCase()));
  const addColors = (colors: string[]) =>
    save((b) => {
      const [first, ...rest] = b.palettes;
      if (first && first.colors.length + colors.length <= MAX_PALETTE_COLORS) {
        return { ...b, palettes: [{ ...first, colors: [...first.colors, ...colors] }, ...rest] };
      }
      return {
        ...b,
        palettes: [
          ...b.palettes,
          { id: newId('palette'), name: t('brand.logoPalette'), colors: colors.slice(0, MAX_PALETTE_COLORS) },
        ],
      };
    });
  const patchPalette = (
    id: string,
    fn: (colors: string[], name: string) => { colors?: string[]; name?: string },
  ) =>
    save((b) => ({
      ...b,
      palettes: b.palettes.map((p) => (p.id === id ? { ...p, ...fn(p.colors, p.name) } : p)),
    }));
  return (
    <Card
      id="colors"
      icon={<Palette className="size-5" />}
      title={t('brand.sections.colors')}
      hint={t('brand.hints.colors')}
      action={
        <Button
          size="sm"
          onClick={() =>
            void save((b) => ({
              ...b,
              palettes: [
                ...b.palettes,
                { id: newId('palette'), name: t('brand.newPalette'), colors: ['#7c6cf8'] },
              ],
            }))
          }
          data-testid="brand-add-palette"
        >
          <Plus className="size-4" />
          {t('brand.addPalette')}
        </Button>
      }
    >
      <div className="space-y-5">
        {suggestions.length > 0 ? (
          <div className="rounded-xl bg-slate-50 p-3" data-testid="brand-logo-colors">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4 text-brand-600" />
              <p className="flex-1 text-sm font-medium text-slate-800">
                {t('brand.fromLogo')}
                <span className="ms-2 font-normal text-slate-500">{t('brand.fromLogoHint')}</span>
              </p>
              <Button size="sm" variant="secondary" onClick={() => void addColors(suggestions)}>
                {t('brand.addAllLogoColors')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void addColors([c])}
                  aria-label={t('brand.addLogoColor', { color: c.toUpperCase() })}
                  title={c.toUpperCase()}
                  className="group relative rounded-lg ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-400"
                  data-testid="brand-logo-color"
                  data-color={c}
                >
                  <span
                    className="block size-10 rounded-lg border border-black/10 shadow-sm"
                    style={{ background: c }}
                  />
                  <Plus className="absolute inset-0 m-auto size-4 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {brand.palettes.map((p) => (
          <div key={p.id} className="space-y-2" data-testid="brand-palette">
            <div className="flex items-center gap-2">
              <input
                defaultValue={p.name}
                key={p.name}
                aria-label={t('brand.paletteName')}
                onBlur={(e) =>
                  e.target.value !== p.name && void patchPalette(p.id, () => ({ name: e.target.value }))
                }
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-sm font-medium text-slate-800 outline-none hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={t('brand.deletePalette')}
                onClick={() =>
                  void save((b) => ({ ...b, palettes: b.palettes.filter((x) => x.id !== p.id) }))
                }
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.colors.map((c, i) => (
                <SwatchEditor
                  // biome-ignore lint/suspicious/noArrayIndexKey: a swatch keeps its place (and open editor) while its color changes
                  key={i}
                  color={c}
                  onChange={(next) =>
                    void patchPalette(p.id, (colors) => ({
                      colors: colors.map((x, j) => (j === i ? next : x)),
                    }))
                  }
                  onRemove={() =>
                    void patchPalette(p.id, (colors) => ({ colors: colors.filter((_, j) => j !== i) }))
                  }
                />
              ))}
              {p.colors.length < MAX_PALETTE_COLORS ? (
                <button
                  type="button"
                  onClick={() =>
                    void patchPalette(p.id, (colors) => ({
                      colors: [...colors, NEW_COLORS.find((c) => !colors.includes(c)) ?? '#cbd5e1'],
                    }))
                  }
                  className="flex size-12 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600"
                  aria-label={t('brand.addColor')}
                  data-testid="brand-add-color"
                >
                  <Plus className="size-5" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FontsSection({ brand, save }: { brand: BrandRecord; save: Save }) {
  const { t } = useI18n();
  const catalog = useFontCatalog();
  const roles = ['heading', 'subheading', 'body'] as const;
  return (
    <Card
      id="fonts"
      icon={<Type className="size-5" />}
      title={t('brand.sections.fonts')}
      hint={t('brand.hints.fonts')}
    >
      <div className="divide-y divide-slate-100">
        {roles.map((role) => {
          const font = brand.fonts[role];
          const info = catalog.find((f) => f.family === font.family);
          const set = (patch: Partial<typeof font>) =>
            void save((b) => ({ ...b, fonts: { ...b.fonts, [role]: { ...b.fonts[role], ...patch } } }));
          return (
            <div
              key={role}
              className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              data-testid={`brand-font-${role}`}
            >
              <p
                className="truncate text-slate-900"
                style={{
                  fontFamily: `'${font.family}', sans-serif`,
                  fontWeight: font.weight,
                  fontSize: Math.min(font.size, 40),
                }}
                dir="auto"
              >
                {t(`brand.fontRoles.${role}`)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={font.family}
                  onChange={(e) => set({ family: e.target.value })}
                  aria-label={`${t(`brand.fontRoles.${role}`)} – ${t('editor.inspector.font')}`}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  data-testid={`brand-font-${role}-family`}
                >
                  {catalog.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.family}
                    </option>
                  ))}
                </select>
                <select
                  value={font.weight}
                  onChange={(e) => set({ weight: Number(e.target.value) })}
                  aria-label={t('brand.weight')}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                >
                  {(info?.weights ?? [400, 700]).map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={6}
                  max={400}
                  value={font.size}
                  onChange={(e) => set({ size: Number(e.target.value) })}
                  aria-label={t('brand.size')}
                  className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm"
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VoiceSection({ brand, save }: { brand: BrandRecord; save: Save }) {
  const { t } = useI18n();
  const [tone, setTone] = useState('');
  const field = (key: 'description' | 'dos' | 'donts', rows: number) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{t(`brand.voice.${key}`)}</span>
      <textarea
        defaultValue={brand.voice[key]}
        key={brand.voice[key]}
        rows={rows}
        placeholder={t(`brand.voice.${key}Placeholder`)}
        onBlur={(e) =>
          e.target.value !== brand.voice[key] &&
          void save((b) => ({ ...b, voice: { ...b.voice, [key]: e.target.value } }))
        }
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        dir="auto"
        data-testid={`brand-voice-${key}`}
      />
    </label>
  );
  const addTone = () => {
    const value = tone.trim();
    if (!value) return;
    setTone('');
    void save((b) => ({ ...b, voice: { ...b.voice, tone: [...b.voice.tone, value] } }));
  };
  return (
    <Card
      id="voice"
      icon={<MessageSquareQuote className="size-5" />}
      title={t('brand.sections.voice')}
      hint={t('brand.hints.voice')}
    >
      <div className="space-y-4">
        {field('description', 3)}
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('brand.voice.tone')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {brand.voice.tone.map((word) => (
              <span
                key={word}
                className="flex items-center gap-1 rounded-full bg-brand-50 py-1 ps-3 pe-1 text-sm text-brand-700"
              >
                {word}
                <button
                  type="button"
                  aria-label={t('brand.remove', { name: word })}
                  onClick={() =>
                    void save((b) => ({
                      ...b,
                      voice: { ...b.voice, tone: b.voice.tone.filter((x) => x !== word) },
                    }))
                  }
                  className="rounded-full p-0.5 hover:bg-brand-100"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTone();
                }
              }}
              onBlur={addTone}
              placeholder={t('brand.voice.tonePlaceholder')}
              aria-label={t('brand.voice.tone')}
              className="h-8 w-44 rounded-full border border-dashed border-slate-300 px-3 text-sm outline-none focus:border-brand-400"
              data-testid="brand-voice-tone"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('dos', 3)}
          {field('donts', 3)}
        </div>
      </div>
    </Card>
  );
}

function TemplateCard({ design, onRemove }: { design: DesignSummary; onRemove: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const thumbnail = useThumbnail(design.id, design.revision);
  return (
    <li className="group relative" data-testid="brand-template">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {thumbnail ? (
          <BlobImage
            src={thumbnail}
            className="max-h-[85%] max-w-[85%] rounded-sm object-contain shadow-sm"
          />
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-slate-800">{design.title}</p>
      <div className="mt-1 flex gap-1.5">
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            const copy = await duplicateDesign(design.id, design.title);
            broadcast({ type: 'designs-changed', tabId: TAB_ID });
            if (copy) router.push(`/design/${copy.id}`);
          }}
          data-testid="use-template"
        >
          {t('brand.useTemplate')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={t('brand.remove', { name: design.title })}
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function TemplatesSection({ brand, save }: { brand: BrandRecord; save: Save }) {
  const { t } = useI18n();
  const { designs } = useDesigns();
  const [picking, setPicking] = useState(false);
  const templates = (designs ?? []).filter((d) => brand.templateIds.includes(d.id));
  const candidates = (designs ?? []).filter((d) => !brand.templateIds.includes(d.id));
  return (
    <Card
      id="templates"
      icon={<LayoutTemplate className="size-5" />}
      title={t('brand.sections.templates')}
      hint={t('brand.hints.templates')}
      action={
        <Button size="sm" onClick={() => setPicking(true)} data-testid="brand-add-template">
          <Plus className="size-4" />
          {t('brand.addTemplate')}
        </Button>
      }
    >
      {templates.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {templates.map((d) => (
            <TemplateCard
              key={d.id}
              design={d}
              onRemove={() =>
                void save((b) => ({ ...b, templateIds: b.templateIds.filter((x) => x !== d.id) }))
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{t('brand.noTemplates')}</p>
      )}
      <Dialog
        open={picking}
        onOpenChange={setPicking}
        title={t('brand.addTemplate')}
        description={t('brand.pickTemplate')}
      >
        {candidates.length ? (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {candidates.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    void save((b) => ({ ...b, templateIds: [...b.templateIds, d.id] }));
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm hover:bg-slate-50"
                  data-testid="pick-template"
                >
                  <span className="truncate font-medium text-slate-800">{d.title}</span>
                  <span className="text-xs text-slate-500" dir="ltr">
                    {d.width} × {d.height}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('home.empty')}</p>
        )}
      </Dialog>
    </Card>
  );
}

export function BrandKitEditor({ brand: initial }: { brand: BrandRecord }) {
  const { t } = useI18n();
  const router = useRouter();
  const [brand, setBrand] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setBrand(initial), [initial]);
  const save: Save = async (change) => {
    // Optimistic: show the change now, then store it.
    setBrand((b) => change(structuredClone(b)));
    const stored = await updateBrand(brand.id, change);
    if (stored) setBrand(stored);
    brandsChanged();
  };
  const sections = ['logos', 'colors', 'fonts', 'voice', 'photos', 'graphics', 'icons', 'templates'] as const;
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href="/brand"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('brand.allKits')}
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <input
          defaultValue={brand.name}
          key={brand.name}
          aria-label={t('brand.kitName')}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value !== brand.name &&
            void save((b) => ({ ...b, name: e.target.value }))
          }
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-2xl font-bold text-slate-900 outline-none hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand-100"
          data-testid="brand-name"
        />
        <Button variant="ghost" onClick={() => setConfirming(true)} data-testid="delete-brand">
          <Trash2 className="size-4" />
          {t('brand.deleteKit')}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <nav
          className="sticky top-6 hidden h-fit flex-col gap-0.5 lg:flex"
          aria-label={t('brand.sectionsLabel')}
        >
          {sections.map((s) => (
            <a
              key={s}
              href={`#${s}`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900"
            >
              {t(`brand.sections.${s}`)}
            </a>
          ))}
        </nav>
        <div className="space-y-6">
          <ImagesSection brand={brand} section="logos" save={save} />
          <ColorsSection brand={brand} save={save} />
          <FontsSection brand={brand} save={save} />
          <VoiceSection brand={brand} save={save} />
          <ImagesSection brand={brand} section="photos" save={save} />
          <ImagesSection brand={brand} section="graphics" save={save} />
          <ImagesSection brand={brand} section="icons" save={save} />
          <TemplatesSection brand={brand} save={save} />
        </div>
      </div>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('brand.deleteKit')}
        description={t('brand.deleteKitBody', { name: brand.name })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-brand"
              onClick={async () => {
                await deleteBrand(brand.id);
                brandsChanged();
                router.push('/brand');
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
