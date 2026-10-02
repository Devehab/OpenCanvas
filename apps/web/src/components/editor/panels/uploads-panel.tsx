'use client';

import { fitSize } from '@opencanvas/core';
import { CloudUpload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEditorContext } from '@/hooks/use-editor';
import { useI18n } from '@/i18n';
import { assetRecordFor, getAssetBlob, listUploads } from '@/lib/storage/assets';

interface Upload {
  hash: string;
  mimeType: string;
  width: number;
  height: number;
  name: string;
  url: string | null;
}

export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml';

export function UploadsPanel() {
  const { t } = useI18n();
  const { editor, uploadFiles } = useEditorContext();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listUploads();
    const withUrls = await Promise.all(
      list.slice(0, 60).map(async (u) => {
        const blob = await getAssetBlob(u.hash);
        return { ...u, url: blob ? URL.createObjectURL(blob) : null };
      }),
    );
    setUploads((old) => {
      for (const o of old ?? []) if (o.url) URL.revokeObjectURL(o.url);
      return withUrls;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const insertExisting = (u: Upload) => {
    const existing = editor.store.getAssets().find((a) => a.hash === u.hash);
    const asset =
      existing ??
      assetRecordFor({
        hash: u.hash,
        mimeType: u.mimeType,
        width: u.width,
        height: u.height,
        name: u.name,
        size: 0,
      });
    const page = editor.store.getPage(editor.pageId)!;
    const size = fitSize(u.width, u.height, page.width * 0.6, page.height * 0.6);
    editor.history.beginBatch('Add image');
    try {
      if (!existing) editor.execute('asset.add', { asset });
      editor.insertNodes([{ type: 'image', assetId: asset.id, ...size, name: u.name } as never]);
    } finally {
      editor.history.endBatch();
    }
  };

  return (
    <div className="space-y-4 p-4 pt-10">
      <Button
        variant="primary"
        className="w-full"
        disabled={busy}
        onClick={() => input.current?.click()}
        data-testid="upload-button"
      >
        <CloudUpload className="size-4" />
        {busy ? t('editor.uploads.uploading') : t('editor.uploads.upload')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_IMAGES}
        className="hidden"
        data-testid="upload-input"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          setBusy(true);
          try {
            await uploadFiles(files);
          } finally {
            setBusy(false);
            void refresh();
          }
        }}
      />
      <p className="text-center text-xs text-slate-500">{t('editor.uploads.formats')}</p>
      {uploads && uploads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t('editor.uploads.empty')}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-2">
        {(uploads ?? []).map((u) => (
          <li key={u.hash}>
            <button
              type="button"
              onClick={() => insertExisting(u)}
              className="oc-checker block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 hover:border-brand-400"
              title={u.name}
              aria-label={u.name || t('editor.nodeTypes.image')}
            >
              {/* biome-ignore lint/performance/noImgElement: local blob URL */}
              {u.url ? <img src={u.url} alt="" className="size-full object-contain" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
