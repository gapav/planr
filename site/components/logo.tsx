import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/exercises" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Grep home">
    <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[var(--ink)] text-white shadow-sm">
      <svg aria-hidden="true" viewBox="0 0 36 36" className="h-full w-full">
        <path d="M25 12.5a10 10 0 1 0 1.5 12V19H19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <circle cx="27.5" cy="9.5" r="3" fill="var(--orange)" />
      </svg>
    </span>
    {!compact && <span className="text-[21px] font-black tracking-[-.055em]">grep<span className="text-[var(--orange)]">.</span></span>}
  </Link>;
}
