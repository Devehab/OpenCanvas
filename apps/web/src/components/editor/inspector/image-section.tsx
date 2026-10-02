'use client';

import { DEFAULT_IMAGE_ADJUSTMENTS, type ImageAdjustments, type ImageNode } from '@opencanvas/core';
import { RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { SliderField } from '@/components/ui/fields';
import { Section } from '@/components/ui/section';
import { useToast } from '@/components/ui/toast';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { prepareImage } from '@/lib/upload';
import { ACCEPT_IMAGES } from '../panels/uploads-panel';

const ADJUSTMENTS: { key: keyof ImageAdjustments; min: number; max: number }[] = [
  { key: 'brightness', min: -100, max: 100 },
  { key: 'contrast', min: -100, max: 100 },
  { key: 'saturation', min: -100, max: 100 },
  { key: 'hue', min: -180, max: 180 },
  { key: 'temperature', min: -100, max: 100 },
  { key: 'grayscale', min: 0, max: 100 },
  { key: 'sepia', min: 0, max: 100 },
  { key: 'vignette', min: 0, max: 100 },
];

export function ImageSection({ node }: { node: ImageNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const { editor, session } = useEditorContext();
  const input = useRef<HTMLInputElement>(null);
  const set = (adjustments: ImageAdjustments, coalesce: boolean) =>
    editor.updateSelected({ adjustments }, { coalesce });
  const adjusted = Object.entries(node.adjustments).some(([, v]) => v !== 0);
  const cropped = node.crop.x !== 0 || node.crop.y !== 0 || node.crop.width !== 1 || node.crop.height !== 1;
  return (
    <>
      <Section title={t('editor.inspector.image')}>
        <Button className="w-full" onClick={() => input.current?.click()} data-testid="replace-image">
          <RefreshCw className="size-4" />
          {t('editor.inspector.replaceImage')}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_IMAGES}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const prepared = await prepareImage(file, file.name);
            if (!prepared.ok) {
              toast(t(`editor.uploads.errors.${prepared.reason}`, { name: prepared.name }), 'error');
              return;
            }
            session.images.put(prepared.asset.hash, prepared.image);
            editor.history.beginBatch(t('editor.inspector.replaceImage'));
            try {
              editor.execute('asset.add', { asset: prepared.asset });
              editor.execute('image.replace', { id: node.id, assetId: prepared.asset.id });
            } finally {
              editor.history.endBatch();
            }
          }}
        />
        {cropped ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              const asset = editor.store.getAsset(node.assetId);
              if (!asset) return;
              // Reset to the full image, keeping the current width.
              const height = (node.width * asset.height) / asset.width;
              editor.updateSelected({ crop: { x: 0, y: 0, width: 1, height: 1 }, height });
            }}
          >
            {t('editor.inspector.resetCrop')}
          </Button>
        ) : null}
      </Section>
      <Section
        title={t('editor.inspector.adjust')}
        collapsible
        action={
          adjusted ? (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:underline"
              onClick={() => set({ ...DEFAULT_IMAGE_ADJUSTMENTS }, false)}
            >
              {t('common.reset')}
            </button>
          ) : null
        }
      >
        {ADJUSTMENTS.map((a) => (
          <SliderField
            key={a.key}
            label={t(`editor.inspector.${a.key}`)}
            value={node.adjustments[a.key]}
            min={a.min}
            max={a.max}
            testId={`adjust-${a.key}`}
            onChange={(v) => set({ ...node.adjustments, [a.key]: v }, true)}
          />
        ))}
      </Section>
    </>
  );
}
