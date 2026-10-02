export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" dir="ltr">
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="oc-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8f7cff" />
            <stop offset="1" stopColor="#4b37d1" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#oc-logo)" />
        <circle cx="25" cy="27" r="11" fill="#fff" />
        <rect x="31" y="31" width="20" height="20" rx="5" fill="#ffde59" />
      </svg>
      {compact ? null : <span className="text-lg font-bold tracking-tight text-slate-900">OpenCanvas</span>}
    </span>
  );
}
