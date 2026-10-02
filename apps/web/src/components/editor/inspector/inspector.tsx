'use client';

import {
  ARROW_HEADS,
  type ArrowHead,
  BLEND_MODES,
  type BlendMode,
  type Fill,
  type FrameNode,
  type ImageNode,
  type LineNode,
  type NodeRecord,
  type PathNode,
  SEMANTIC_ROLES,
  type ShapeNode,
  type TextNode,
} from '@opencanvas/core';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Link2,
  Lock,
  Ruler,
  Ungroup,
  Unlink2,
  Unlock,
} from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { NumberField, SelectField, SliderField, Toggle } from '@/components/ui/fields';
import { Section } from '@/components/ui/section';
import { useEditorContext, useEditorValue } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { FillControl, ShadowControl, StrokeControl, useDocumentColors } from './controls';
import { ImageSection } from './image-section';
import { TextSection } from './text-section';

function PageSection() {
  const { t, formatNumber } = useI18n();
  const { editor, setDialog } = useEditorContext();
  const page = useEditorValue((e) => e.store.getPage(e.pageId));
  if (!page) return null;
  return (
    <>
      <Section title={t('editor.inspector.page')}>
        <p className="text-sm text-slate-600" dir="ltr">
          {formatNumber(page.width)} × {formatNumber(page.height)} px
        </p>
        <Button className="w-full" onClick={() => setDialog('resize')} data-testid="open-resize">
          <Ruler className="size-4" />
          {t('editor.inspector.resizeDesign')}
        </Button>
      </Section>
      <Section title={t('editor.inspector.background')}>
        <FillControl
          value={page.background}
          allowNone={false}
          testId="page-background"
          onChange={(fill, final) =>
            fill &&
            editor.execute(
              'page.update',
              { id: page.id, patch: { background: fill } },
              { coalesceKey: final ? undefined : `page-bg:${page.id}` },
            )
          }
        />
      </Section>
    </>
  );
}

function PositionSection({ nodes }: { nodes: NodeRecord[] }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const [lockAspect, setLockAspect] = useState(true);
  const single = nodes.length === 1 ? nodes[0]! : null;
  const bounds = useEditorValue(
    (e) => e.getSelectionBounds(),
    [],
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  if (!bounds) return null;
  const locked = nodes.some((n) => n.locked);
  const isLine = single?.type === 'line';
  const keepAspect = single?.type === 'image' || single?.type === 'group' ? true : lockAspect;
  return (
    <Section title={t('editor.inspector.position')}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('editor.inspector.x')}
          prefix={t('editor.inspector.x')}
          value={single ? single.x : bounds.x}
          digits={1}
          disabled={locked}
          testId="pos-x"
          onChange={(x) =>
            single
              ? editor.updateSelected({ x })
              : editor.execute('node.translate', { ids: nodes.map((n) => n.id), dx: x - bounds.x, dy: 0 })
          }
        />
        <NumberField
          label={t('editor.inspector.y')}
          prefix={t('editor.inspector.y')}
          value={single ? single.y : bounds.y}
          digits={1}
          disabled={locked}
          testId="pos-y"
          onChange={(y) =>
            single
              ? editor.updateSelected({ y })
              : editor.execute('node.translate', { ids: nodes.map((n) => n.id), dx: 0, dy: y - bounds.y })
          }
        />
        {single ? (
          <>
            <NumberField
              label={t('editor.inspector.width')}
              prefix={t('editor.inspector.width')}
              value={single.width}
              min={1}
              digits={1}
              disabled={locked}
              testId="size-w"
              onChange={(width) =>
                editor.execute('node.set-size', { id: single.id, width, keepAspect: keepAspect && !isLine })
              }
            />
            <div className="flex items-center gap-1">
              <NumberField
                label={t('editor.inspector.height')}
                prefix={t('editor.inspector.height')}
                value={single.height}
                min={isLine ? 0 : 1}
                digits={1}
                disabled={locked || isLine || (single.type === 'text' && single.sizing !== 'fixed')}
                className="flex-1"
                testId="size-h"
                onChange={(height) => editor.execute('node.set-size', { id: single.id, height, keepAspect })}
              />
              {single.type === 'image' || single.type === 'group' || isLine ? null : (
                <IconButton
                  label={t('editor.inspector.lockAspect')}
                  size="sm"
                  active={lockAspect}
                  onClick={() => setLockAspect(!lockAspect)}
                >
                  {lockAspect ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
                </IconButton>
              )}
            </div>
          </>
        ) : null}
      </div>
      {single ? (
        <NumberField
          label={t('editor.inspector.rotation')}
          prefix="°"
          value={single.rotation}
          min={-360}
          max={360}
          digits={1}
          disabled={locked}
          testId="rotation"
          onChange={(rotation) => editor.execute('node.set-rotation', { ids: [single.id], rotation })}
        />
      ) : null}
    </Section>
  );
}

function ArrangeSection({ nodes }: { nodes: NodeRecord[] }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const multi = nodes.length > 1;
  const align = [
    { a: 'left', icon: AlignStartVertical, label: t('editor.inspector.alignLeft') },
    { a: 'center', icon: AlignCenterVertical, label: t('editor.inspector.alignCenter') },
    { a: 'right', icon: AlignEndVertical, label: t('editor.inspector.alignRight') },
    { a: 'top', icon: AlignStartHorizontal, label: t('editor.inspector.alignTop') },
    { a: 'middle', icon: AlignCenterHorizontal, label: t('editor.inspector.alignMiddle') },
    { a: 'bottom', icon: AlignEndHorizontal, label: t('editor.inspector.alignBottom') },
  ] as const;
  return (
    <Section title={t('editor.inspector.arrange')}>
      <fieldset className="flex flex-wrap gap-0.5" aria-label={t('editor.inspector.align')}>
        {align.map((item) => (
          <IconButton
            key={item.a}
            label={item.label}
            size="sm"
            onClick={() => editor.alignSelected(item.a)}
            data-testid={`align-${item.a}`}
          >
            <item.icon className="size-4" />
          </IconButton>
        ))}
        {nodes.length >= 3 ? (
          <>
            <IconButton
              label={t('editor.inspector.distributeHorizontal')}
              size="sm"
              onClick={() => editor.distributeSelected('horizontal')}
            >
              <AlignHorizontalSpaceAround className="size-4" />
            </IconButton>
            <IconButton
              label={t('editor.inspector.distributeVertical')}
              size="sm"
              onClick={() => editor.distributeSelected('vertical')}
            >
              <AlignVerticalSpaceAround className="size-4" />
            </IconButton>
          </>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-wrap gap-0.5" aria-label={t('editor.inspector.order')}>
        <IconButton
          label={t('editor.menu.bringToFront')}
          size="sm"
          onClick={() => editor.reorderSelected('front')}
        >
          <ArrowUpToLine className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.menu.bringForward')}
          size="sm"
          onClick={() => editor.reorderSelected('forward')}
        >
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.menu.sendBackward')}
          size="sm"
          onClick={() => editor.reorderSelected('backward')}
        >
          <ChevronDown className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.menu.sendToBack')}
          size="sm"
          onClick={() => editor.reorderSelected('back')}
        >
          <ArrowDownToLine className="size-4" />
        </IconButton>
        <span className="mx-1 w-px bg-slate-200" />
        <IconButton
          label={t('editor.menu.flipHorizontal')}
          size="sm"
          onClick={() => editor.flipSelected('horizontal')}
          data-testid="flip-h"
        >
          <FlipHorizontal2 className="size-4" />
        </IconButton>
        <IconButton
          label={t('editor.menu.flipVertical')}
          size="sm"
          onClick={() => editor.flipSelected('vertical')}
        >
          <FlipVertical2 className="size-4" />
        </IconButton>
      </fieldset>
      {multi ? (
        <Button className="w-full" onClick={() => editor.groupSelected()} data-testid="group-button">
          <Group className="size-4" />
          {t('editor.inspector.group')}
        </Button>
      ) : null}
      {nodes.some((n) => n.type === 'group') ? (
        <Button className="w-full" onClick={() => editor.ungroupSelected()} data-testid="ungroup-button">
          <Ungroup className="size-4" />
          {t('editor.inspector.ungroup')}
        </Button>
      ) : null}
    </Section>
  );
}

function AppearanceSection({ nodes }: { nodes: NodeRecord[] }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const node = nodes[0]!;
  const opacity = nodes.every((n) => n.opacity === node.opacity) ? node.opacity : 1;
  return (
    <Section title={t('editor.inspector.effects')}>
      <SliderField
        label={t('editor.inspector.opacity')}
        value={Math.round(opacity * 100)}
        min={0}
        max={100}
        format={(v) => `${Math.round(v)}%`}
        testId="opacity"
        onChange={(v) => editor.updateSelected({ opacity: v / 100 }, { coalesce: true })}
      />
      <SelectField
        label={t('editor.inspector.blendMode')}
        value={node.blendMode}
        options={BLEND_MODES.map((m) => ({ value: m, label: t(`editor.blendModes.${m}`) }))}
        onChange={(blendMode: BlendMode) => editor.updateSelected({ blendMode })}
      />
      <ShadowControl
        value={node.shadow}
        onChange={(shadow, final) => editor.updateSelected({ shadow }, { coalesce: !final })}
      />
      <SliderField
        label={t('editor.inspector.blur')}
        value={node.blur}
        min={0}
        max={60}
        testId="layer-blur"
        onChange={(blur) => editor.updateSelected({ blur }, { coalesce: true })}
      />
    </Section>
  );
}

function ShapeSection({ nodes }: { nodes: (ShapeNode | FrameNode)[] }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const node = nodes[0]!;
  return (
    <>
      <Section title={t('editor.inspector.fill')}>
        <FillControl
          value={node.fill}
          testId="fill"
          onChange={(fill: Fill | null, final) => editor.updateSelected({ fill }, { coalesce: !final })}
        />
      </Section>
      <Section title={t('editor.inspector.stroke')}>
        <StrokeControl
          value={node.stroke}
          onChange={(stroke, final) => editor.updateSelected({ stroke }, { coalesce: !final })}
        />
        <SliderField
          label={t('editor.inspector.cornerRadius')}
          value={node.cornerRadius}
          min={0}
          max={Math.round(Math.min(node.width, node.height) / 2)}
          testId="corner-radius"
          onChange={(cornerRadius) => editor.updateSelected({ cornerRadius }, { coalesce: true })}
        />
        {node.type === 'shape' && (node.shape === 'polygon' || node.shape === 'star') ? (
          <SliderField
            label={node.shape === 'star' ? t('editor.inspector.points') : t('editor.inspector.sides')}
            value={node.sides}
            min={3}
            max={20}
            onChange={(sides) => editor.updateSelected({ sides: Math.round(sides) }, { coalesce: true })}
          />
        ) : null}
        {node.type === 'shape' && node.shape === 'star' ? (
          <SliderField
            label={t('editor.inspector.innerRadius')}
            value={Math.round(node.innerRatio * 100)}
            min={10}
            max={95}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => editor.updateSelected({ innerRatio: v / 100 }, { coalesce: true })}
          />
        ) : null}
        {node.type === 'frame' ? (
          <Toggle
            label={t('editor.inspector.clip')}
            checked={node.clipContent}
            onChange={(clipContent) => editor.updateSelected({ clipContent })}
          />
        ) : null}
      </Section>
    </>
  );
}

function LineSection({ node }: { node: LineNode }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const heads = ARROW_HEADS.map((h) => ({ value: h, label: t(`editor.inspector.arrows.${h}`) }));
  return (
    <Section title={t('editor.nodeTypes.line')}>
      <StrokeControl
        value={node.stroke}
        allowNone={false}
        onChange={(stroke, final) =>
          stroke && editor.updateSelected({ stroke, height: Math.max(1, stroke.width) }, { coalesce: !final })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t('editor.inspector.lineStart')}
          value={node.startArrow}
          options={heads}
          onChange={(startArrow: ArrowHead) => editor.updateSelected({ startArrow })}
        />
        <SelectField
          label={t('editor.inspector.lineEnd')}
          value={node.endArrow}
          options={heads}
          onChange={(endArrow: ArrowHead) => editor.updateSelected({ endArrow })}
        />
      </div>
    </Section>
  );
}

function PathSection({ node }: { node: PathNode }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const swatches = useDocumentColors();
  return (
    <Section title={t('editor.nodeTypes.path')}>
      {node.stroke ? (
        <ColorField
          label={t('editor.inspector.color')}
          value={node.stroke.color}
          swatches={swatches}
          onChange={(color, final) =>
            editor.updateSelected({ stroke: { ...node.stroke!, color } }, { coalesce: !final })
          }
        />
      ) : null}
      {node.stroke ? (
        <SliderField
          label={t('editor.inspector.thickness')}
          value={node.stroke.width}
          min={0.5}
          max={6}
          step={0.25}
          format={(v) => v.toFixed(2)}
          onChange={(width) =>
            editor.updateSelected({ stroke: { ...node.stroke!, width } }, { coalesce: true })
          }
        />
      ) : null}
      <FillControl
        value={node.fill}
        onChange={(fill, final) => editor.updateSelected({ fill }, { coalesce: !final })}
      />
    </Section>
  );
}

function SemanticSection({ node }: { node: NodeRecord }) {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const semantic = node.semantic ?? { role: null, description: '', slot: null };
  const [description, setDescription] = useState(semantic.description);
  return (
    <Section title={t('editor.inspector.semantics')} collapsible defaultOpen={false}>
      <p className="text-xs text-slate-500">{t('editor.inspector.semanticsHint')}</p>
      <SelectField
        label={t('editor.inspector.role')}
        value={semantic.role ?? '__none'}
        options={[
          { value: '__none', label: t('editor.inspector.noRole') },
          ...SEMANTIC_ROLES.map((r) => ({ value: r, label: t(`editor.roles.${r}`) })),
        ]}
        onChange={(role) =>
          editor.updateSelected({ semantic: { ...semantic, role: role === '__none' ? null : role } })
        }
        testId="semantic-role"
      />
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        {t('editor.inspector.description')}
        <textarea
          className="min-h-16 rounded-md border border-slate-200 p-2 text-sm font-normal text-slate-800 outline-none focus:border-brand-400"
          value={description}
          maxLength={2000}
          dir="auto"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            description !== semantic.description &&
            editor.updateSelected({ semantic: { ...semantic, description } })
          }
        />
      </label>
    </Section>
  );
}

export function Inspector() {
  const { t } = useI18n();
  const { editor } = useEditorContext();
  const nodes = useEditorValue((e) => e.getSelectedNodes());
  const editingId = useEditorValue((e) => e.state.get().editingTextId);
  const single = nodes.length === 1 ? nodes[0]! : null;
  const allOf = <T extends NodeRecord['type']>(...types: T[]) =>
    nodes.length > 0 && nodes.every((n) => (types as string[]).includes(n.type));
  const locked = nodes.length > 0 && nodes.every((n) => n.locked);
  return (
    <aside
      className="w-72 shrink-0 overflow-y-auto border-s border-slate-200 bg-white max-lg:w-64"
      aria-label={t('editor.inspector.label')}
      data-testid="inspector"
    >
      {nodes.length === 0 ? (
        <PageSection />
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {single
                ? t(`editor.nodeTypes.${single.type}`)
                : t('editor.inspector.multiple', { n: nodes.length })}
            </h2>
            <IconButton
              label={locked ? t('editor.inspector.unlock') : t('editor.inspector.lock')}
              size="sm"
              active={locked}
              onClick={() => editor.toggleLockSelected()}
              data-testid="lock-toggle"
            >
              {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            </IconButton>
          </div>
          {allOf('text') ? (
            <TextSection key={`text:${nodes.map((n) => n.id).join()}`} nodes={nodes as TextNode[]} />
          ) : null}
          {single?.type === 'text' && !editingId ? (
            <div className="border-b border-slate-100 px-4 py-3">
              <Button
                className="w-full"
                onClick={() => editor.startEditingText(single.id)}
                data-testid="edit-text"
              >
                {t('editor.inspector.editText')}
              </Button>
            </div>
          ) : null}
          {single?.type === 'image' ? <ImageSection node={single} /> : null}
          {allOf('shape', 'frame') ? <ShapeSection nodes={nodes as (ShapeNode | FrameNode)[]} /> : null}
          {single?.type === 'line' ? <LineSection node={single} /> : null}
          {single?.type === 'path' ? <PathSection node={single} /> : null}
          {single?.type === 'image' ? (
            <Section title={t('editor.inspector.stroke')}>
              <StrokeControl
                value={(single as ImageNode).stroke}
                onChange={(stroke, final) => editor.updateSelected({ stroke }, { coalesce: !final })}
              />
              <SliderField
                label={t('editor.inspector.cornerRadius')}
                value={(single as ImageNode).cornerRadius}
                min={0}
                max={Math.round(Math.min(single.width, single.height) / 2)}
                onChange={(cornerRadius) => editor.updateSelected({ cornerRadius }, { coalesce: true })}
              />
            </Section>
          ) : null}
          <PositionSection nodes={nodes} />
          <ArrangeSection nodes={nodes} />
          <AppearanceSection nodes={nodes} />
          {single ? <SemanticSection key={`semantic:${single.id}`} node={single} /> : null}
        </>
      )}
    </aside>
  );
}
