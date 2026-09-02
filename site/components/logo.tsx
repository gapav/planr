import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/exercises" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Plannr home">
    <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[var(--ink)] text-white shadow-sm"><span className="absolute -right-2 h-8 w-8 rounded-full border-[7px] border-[var(--orange)]" /><span className="relative -translate-x-0.5 text-lg font-black">P</span></span>
    {!compact && <span className="text-[21px] font-black tracking-[-.055em]">plannr<span className="text-[var(--orange)]">.</span></span>}
  </Link>;
}
