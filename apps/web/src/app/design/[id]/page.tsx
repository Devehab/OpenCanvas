'use client';

import '@/lib/font-faces';
import { useParams } from 'next/navigation';
import { EditorShell } from '@/components/editor/editor-shell';

export default function DesignPage() {
  const params = useParams<{ id: string }>();
  return <EditorShell designId={params.id} />;
}
