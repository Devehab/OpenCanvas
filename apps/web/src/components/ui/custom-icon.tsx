import type { CustomIcon } from '@/lib/storage/db';

/** Preview of an uploaded or plugin icon. */
export function CustomIconPreview({ icon, className }: { icon: CustomIcon; className?: string }) {
  const { x, y, width, height } = icon.viewBox;
  return (
    <svg viewBox={`${x} ${y} ${width} ${height}`} className={className} aria-hidden>
      <path
        d={icon.path}
        fill={icon.style === 'filled' ? 'currentColor' : 'none'}
        stroke={icon.style === 'outline' ? 'currentColor' : 'none'}
        strokeWidth={icon.strokeWidth || undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
