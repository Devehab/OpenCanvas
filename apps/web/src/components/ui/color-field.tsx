'use client';

import { type ColorStop, type Fill, normalizeColor, parseUserColor, toCssColor } from '@opencanvas/core';
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  Circle,
  Pipette,
  Plus,
  X,
} from 'lucide-react';
import { Popover } from 'radix-ui';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Canva-style colors: a palette first (document, brand and default colors),
 * and a "+" that opens a custom color editor with Solid / Gradient tabs.
 */

/** Default solid colors, 7 per row: greys, reds to purples, teals to blues, greens to oranges, then tints and shades. */
export const DEFAULT_SOLID_COLORS = [
  ['#000000', '#3a3a3a', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff'],
  ['#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb', '#3b0f9e'],
  ['#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5170ff', '#004aad', '#0b2a5b'],
  ['#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d', '#c2410c'],
  ['#fecaca', '#fbcfe8', '#e9d5ff', '#c7d2fe', '#bae6fd', '#bbf7d0', '#fef08a'],
  ['#fed7aa', '#f5f5f4', '#e7e5e4', '#99f6e4', '#a5b4fc', '#f9a8d4', '#fde68a'],
  ['#7f1d1d', '#831843', '#4c1d95', '#1e3a8a', '#134e4a', '#14532d', '#713f12'],
].flat();
/** Rows shown before "See all". */
const SOLID_ROWS_SHOWN = 4;

/** Default gradients (two colors each). */
export const DEFAULT_GRADIENTS: readonly [string, string][] = [
  ['#000000', '#737373'],
  ['#000000', '#c89116'],
  ['#a6a6a6', '#ffffff'],
  ['#ff3131', '#ff914d'],
  ['#ff5757', '#8c52ff'],
  ['#5170ff', '#ff66c4'],
  ['#004aad', '#cb6ce6'],
  ['#8c52ff', '#5ce1e6'],
  ['#0097b2', '#7ed957'],
  ['#5de0e6', '#004aad'],
  ['#8c52ff', '#00bf63'],
  ['#ffde59', '#ff914d'],
  ['#ff66c4', '#ffde59'],
  ['#c1ff72', '#38b6ff'],
];

/** Kept for code that still imports the old name. */
export const DEFAULT_SWATCHES = DEFAULT_SOLID_COLORS;

/** The active brand kit's colors, shown in every color picker inside the editor. */
export const BrandColorsContext = createContext<readonly string[]>([]);

interface EyeDropperResult {
  sRGBHex: string;
}

/** CSS background for a fill (gradients included). */
export function fillToCss(fill: Fill | null): string {
  if (!fill) return 'transparent';
  if (fill.type === 'solid') return toCssColor(fill.color);
  const stops = fill.stops.map((s) => `${toCssColor(s.color)} ${Math.round(s.offset * 100)}%`).join(', ');
  return fill.type === 'linear-gradient'
    ? `linear-gradient(${fill.angle}deg, ${stops})`
    : `radial-gradient(circle at ${fill.cx * 100}% ${fill.cy * 100}%, ${stops})`;
}

function evenStops(colors: readonly string[]): ColorStop[] {
  return colors.map((color, i) => ({ offset: colors.length > 1 ? i / (colors.length - 1) : 0, color }));
}

function sameFill(a: Fill | null, b: Fill | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ColorSwatch({ color, size = 'md' }: { color: string | null; size?: 'sm' | 'md' }) {
  return <FillSwatch fill={color ? { type: 'solid', color } : null} size={size} />;
}

export function FillSwatch({ fill, size = 'md' }: { fill: Fill | null; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'oc-checker relative inline-block shrink-0 overflow-hidden rounded-md border border-slate-300',
        size === 'sm' ? 'size-5' : 'size-7',
      )}
      aria-hidden
    >
      <span className="absolute inset-0" style={{ background: fillToCss(fill) }} />
      {fill ? null : <NoColorSlash />}
    </span>
  );
}

function NoColorSlash() {
  return (
    <svg className="absolute inset-0 size-full" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden>
      <line
        x1="0"
        y1="10"
        x2="10"
        y2="0"
        stroke="#ef4444"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

async function pickFromScreen(): Promise<string | null> {
  try {
    const dropper = new (
      window as unknown as { EyeDropper: new () => { open(): Promise<EyeDropperResult> } }
    ).EyeDropper();
    const result = await dropper.open();
    return normalizeColor(result.sRGBHex);
  } catch {
    return null; // cancelled
  }
}

const hasEyeDropper = () => typeof window !== 'undefined' && 'EyeDropper' in window;

// ── Palette ─────────────────────────────────────────────────────────────────

function Tile({
  fill,
  label,
  selected,
  onClick,
  children,
  testId,
}: {
  fill?: Fill | null;
  label: string;
  selected?: boolean;
  onClick: () => void;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-md outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-400',
        selected && 'ring-2 ring-brand-500',
        fill !== undefined && 'oc-checker shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]',
      )}
    >
      {fill !== undefined ? (
        <span
          className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ background: fillToCss(fill) }}
        />
      ) : null}
      {fill === null ? <NoColorSlash /> : null}
      {children}
    </button>
  );
}

function PaletteSection({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      <div className="grid grid-cols-7 gap-2">{children}</div>
    </section>
  );
}

function Palette({
  value,
  gradients,
  allowNone,
  documentColors,
  onPick,
  onCustom,
}: {
  value: Fill | null;
  gradients: boolean;
  allowNone: boolean;
  documentColors: readonly string[];
  onPick: (fill: Fill | null) => void;
  onCustom: () => void;
}) {
  const { t } = useI18n();
  const brandColors = useContext(BrandColorsContext);
  const [allSolids, setAllSolids] = useState(false);
  const current = value?.type === 'solid' ? value.color.slice(0, 7) : null;
  const solid = (color: string) => onPick({ type: 'solid', color });
  const solidTile = (color: string) => (
    <Tile
      key={color}
      fill={{ type: 'solid', color }}
      label={color}
      selected={current === color.slice(0, 7)}
      onClick={() => solid(color)}
    />
  );
  const angle = value?.type === 'linear-gradient' ? value.angle : 90;
  return (
    <div className="space-y-4">
      <PaletteSection title={t('color.documentColors')} testId="document-swatches">
        <Tile label={t('color.newColor')} onClick={onCustom} testId="color-custom">
          <span
            className="absolute inset-0"
            style={{
              background: 'conic-gradient(#ff3131, #ffde59, #7ed957, #38b6ff, #8c52ff, #ff66c4, #ff3131)',
            }}
          />
          <span className="absolute inset-[22%] flex items-center justify-center rounded-full bg-white">
            <Plus className="size-3.5 text-slate-700" />
          </span>
        </Tile>
        {hasEyeDropper() ? (
          <Tile
            label={t('common.pickColor')}
            onClick={async () => {
              const c = await pickFromScreen();
              if (c) solid(c);
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center rounded-md border border-slate-200 bg-white">
              <Pipette className="size-4 text-slate-600" />
            </span>
          </Tile>
        ) : null}
        {allowNone ? (
          <Tile
            fill={null}
            label={t('color.noColor')}
            selected={value === null}
            onClick={() => onPick(null)}
          />
        ) : null}
        {[...new Set(documentColors)].slice(0, 12).map(solidTile)}
      </PaletteSection>

      {brandColors.length ? (
        <PaletteSection title={t('color.brandColors')} testId="brand-swatches">
          {[...new Set(brandColors)].slice(0, 21).map(solidTile)}
        </PaletteSection>
      ) : null}

      <PaletteSection
        title={t('color.defaultSolid')}
        testId="default-swatches"
        action={
          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline"
            onClick={() => setAllSolids((v) => !v)}
            aria-expanded={allSolids}
            data-testid="color-see-all"
          >
            {allSolids ? t('color.seeLess') : t('color.seeAll')}
          </button>
        }
      >
        {(allSolids ? DEFAULT_SOLID_COLORS : DEFAULT_SOLID_COLORS.slice(0, SOLID_ROWS_SHOWN * 7)).map(
          solidTile,
        )}
      </PaletteSection>

      {gradients ? (
        <PaletteSection title={t('color.defaultGradients')} testId="default-gradients">
          {DEFAULT_GRADIENTS.map(([a, b]) => {
            const fill: Fill = { type: 'linear-gradient', angle, stops: evenStops([a, b]) };
            return (
              <Tile
                key={a + b}
                fill={fill}
                label={`${a} → ${b}`}
                selected={sameFill(value, fill)}
                onClick={() => onPick(fill)}
              />
            );
          })}
        </PaletteSection>
      ) : null}
    </div>
  );
}

// ── Custom color ────────────────────────────────────────────────────────────

/** Saturation square, hue and transparency sliders, hex code and eyedropper. */
function ColorEditor({
  color,
  onChange,
  label,
}: {
  color: string;
  onChange: (color: string, final: boolean) => void;
  label: string;
}) {
  const { t } = useI18n();
  const [hex, setHex] = useState(color);
  useEffect(() => setHex(color), [color]);
  const commitHex = (raw: string) => {
    const normalized = parseUserColor(raw);
    if (normalized) onChange(normalized, true);
    else setHex(color);
  };
  return (
    <div className="space-y-3">
      <div className="oc-colorful" dir="ltr">
        <HexAlphaColorPicker color={color} onChange={(c) => onChange(normalizeColor(c) ?? c, false)} />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-1.5 focus-within:border-brand-400">
          <ColorSwatch color={color} size="sm" />
          <input
            aria-label={`${label} (hex)`}
            title={t('color.hex')}
            className="h-full w-full min-w-0 bg-transparent font-mono text-sm uppercase outline-none"
            dir="ltr"
            spellCheck={false}
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitHex((e.target as HTMLInputElement).value)}
          />
        </label>
        {hasEyeDropper() ? (
          <button
            type="button"
            aria-label={t('common.pickColor')}
            title={t('common.pickColor')}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={async () => {
              const c = await pickFromScreen();
              if (c) onChange(c, true);
            }}
          >
            <Pipette className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const DIRECTIONS = [
  { angle: 90, Icon: ArrowRight },
  { angle: 180, Icon: ArrowDown },
  { angle: 135, Icon: ArrowDownRight },
  { angle: 45, Icon: ArrowUpRight },
] as const;

function GradientEditor({
  fill,
  onChange,
  label,
}: {
  fill: Exclude<Fill, { type: 'solid' }>;
  onChange: (fill: Fill, final: boolean) => void;
  label: string;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const stops = fill.stops;
  const index = Math.min(active, stops.length - 1);
  const colors = stops.map((s) => s.color);
  const setColors = (next: string[], final: boolean) => onChange({ ...fill, stops: evenStops(next) }, final);
  const styleButton = (
    key: string,
    title: string,
    selected: boolean,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <button
      key={key}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex h-9 flex-1 items-center justify-center rounded-lg border text-slate-600 hover:bg-slate-50',
        selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200',
      )}
    >
      {icon}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700">{t('color.gradientColors')}</h3>
        <div
          className="oc-checker h-3 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          dir="ltr"
          aria-hidden
        >
          <div
            className="size-full"
            style={{ background: fillToCss({ type: 'linear-gradient', angle: 90, stops }) }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" dir="ltr" data-testid="gradient-stops">
          {colors.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a stop is its position in the gradient
            <span key={i} className="relative">
              <button
                type="button"
                aria-label={t('color.editStop', { n: i + 1 })}
                title={c}
                aria-pressed={i === index}
                onClick={() => setActive(i)}
                className={cn(
                  'oc-checker relative block size-9 overflow-hidden rounded-full ring-offset-2',
                  i === index ? 'ring-2 ring-brand-500' : 'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]',
                )}
              >
                <span className="absolute inset-0" style={{ background: toCssColor(c) }} />
              </button>
              {i === index && colors.length > 2 ? (
                <button
                  type="button"
                  aria-label={t('color.removeStop')}
                  title={t('color.removeStop')}
                  onClick={() => {
                    setColors(
                      colors.filter((_, j) => j !== i),
                      true,
                    );
                    setActive(Math.max(0, i - 1));
                  }}
                  className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-slate-700 text-white"
                >
                  <X className="size-2.5" />
                </button>
              ) : null}
            </span>
          ))}
          {colors.length < 5 ? (
            <button
              type="button"
              aria-label={t('color.addStop')}
              title={t('color.addStop')}
              data-testid="gradient-add-stop"
              onClick={() => {
                setColors([...colors, colors[index]!], true);
                setActive(colors.length);
              }}
              className="flex size-9 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              <Plus className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t('color.reverse')}
            title={t('color.reverse')}
            onClick={() => {
              setColors([...colors].reverse(), true);
              setActive(colors.length - 1 - index);
            }}
            className="ml-auto flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeftRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700">{t('color.style')}</h3>
        <div className="flex gap-1.5" dir="ltr">
          {DIRECTIONS.map(({ angle, Icon }) =>
            styleButton(
              `a${angle}`,
              `${t('color.linear')} · ${t('color.direction', { angle })}`,
              fill.type === 'linear-gradient' && Math.round(fill.angle) === angle,
              () => onChange({ type: 'linear-gradient', angle, stops }, true),
              <Icon className="size-4" />,
            ),
          )}
          {styleButton(
            'radial',
            t('color.radial'),
            fill.type === 'radial-gradient',
            () => onChange({ type: 'radial-gradient', cx: 0.5, cy: 0.5, stops }, true),
            <Circle className="size-4" />,
          )}
        </div>
      </div>
      <ColorEditor
        label={label}
        color={colors[index]!}
        onChange={(c, final) =>
          setColors(
            colors.map((x, j) => (j === index ? c : x)),
            final,
          )
        }
      />
    </div>
  );
}

function CustomColor({
  value,
  gradients,
  label,
  onChange,
  onBack,
}: {
  value: Fill | null;
  gradients: boolean;
  label: string;
  onChange: (fill: Fill, final: boolean) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const tab = value && value.type !== 'solid' ? 'gradient' : 'solid';
  const first = value?.type === 'solid' ? value.color : (value?.stops[0]?.color ?? '#8c52ff');
  const toGradient = () => {
    const second = first.slice(0, 7) === '#ffffff' ? '#000000' : '#ffffff';
    onChange({ type: 'linear-gradient', angle: 90, stops: evenStops([first, second]) }, true);
  };
  const tabButton = (id: 'solid' | 'gradient', text: string, onClick: () => void) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      data-testid={`color-tab-${id}`}
      onClick={() => tab !== id && onClick()}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {text}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('common.back')}
          title={t('common.back')}
          onClick={onBack}
          data-testid="color-back"
          className="-ms-1 flex size-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </button>
        <h3 className="text-sm font-semibold text-slate-800">{t('color.newColor')}</h3>
      </div>
      {gradients ? (
        <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {tabButton('solid', t('color.solid'), () => onChange({ type: 'solid', color: first }, true))}
          {tabButton('gradient', t('color.gradient'), toGradient)}
        </div>
      ) : null}
      {value && value.type !== 'solid' ? (
        <GradientEditor fill={value} onChange={onChange} label={label} />
      ) : (
        <ColorEditor
          label={label}
          color={first}
          onChange={(c, final) => onChange({ type: 'solid', color: c }, final)}
        />
      )}
    </div>
  );
}

// ── The picker ──────────────────────────────────────────────────────────────

/** A button showing the current color or gradient; opens the Canva-style picker. */
export function FillPicker({
  label,
  value,
  onChange,
  swatches = [],
  gradients = true,
  allowNone = false,
  mixed = false,
  testId,
}: {
  label: string;
  value: Fill | null;
  onChange: (fill: Fill | null, final: boolean) => void;
  /** Colors already used in the document, shown first. */
  swatches?: readonly string[];
  gradients?: boolean;
  allowNone?: boolean;
  /** The selection has several colors; `value` is the first one. */
  mixed?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'palette' | 'custom'>('palette');
  const caption = mixed
    ? t('common.mixed')
    : !value
      ? t('color.noColor')
      : value.type === 'solid'
        ? value.color.slice(0, 7)
        : value.type === 'linear-gradient'
          ? t('editor.inspector.linearGradient')
          : t('editor.inspector.radialGradient');
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setView('palette');
      }}
    >
      <Popover.Trigger
        className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-1.5 text-sm text-slate-700 hover:border-slate-300"
        aria-label={label}
        data-testid={testId}
      >
        <FillSwatch fill={value} size="sm" />
        <span
          className={cn('truncate', value?.type === 'solid' && !mixed && 'tabular-nums uppercase')}
          dir={value?.type === 'solid' && !mixed ? 'ltr' : undefined}
        >
          {caption}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          aria-label={label}
          data-testid="color-picker"
        >
          {view === 'palette' ? (
            <Palette
              value={mixed ? null : value}
              gradients={gradients}
              allowNone={allowNone}
              documentColors={swatches}
              onPick={(fill) => onChange(fill, true)}
              onCustom={() => setView('custom')}
            />
          ) : (
            <CustomColor
              value={value}
              gradients={gradients}
              label={label}
              onChange={onChange}
              onBack={() => setView('palette')}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A single solid color (text, borders, shadows…). */
export function ColorField({
  label,
  value,
  onChange,
  swatches = [],
  mixed = false,
  testId,
}: {
  label: string;
  value: string;
  /** The selection has several colors; `value` is the first one. */
  mixed?: boolean;
  onChange: (color: string, final: boolean) => void;
  /** Colors already used in the document, shown first. */
  swatches?: readonly string[];
  testId?: string;
}) {
  return (
    <FillPicker
      label={label}
      value={{ type: 'solid', color: value }}
      onChange={(fill, final) => fill?.type === 'solid' && onChange(fill.color, final)}
      swatches={swatches}
      gradients={false}
      mixed={mixed}
      testId={testId}
    />
  );
}
