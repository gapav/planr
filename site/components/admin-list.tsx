"use client";

/** Long lists grow in pages rather than rendering a season of rows at once. */
export const ADMIN_PAGE_SIZE = 25;

export function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore(): void }) {
  if (shown >= total) return null;
  const next = Math.min(ADMIN_PAGE_SIZE, total - shown);
  return <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-sm sm:px-6"><span className="text-[var(--ink-soft)]">Viser {shown} av {total}</span><button type="button" onClick={onMore} className="rounded-lg px-3 py-1.5 font-bold hover:bg-black/5">Vis {next} til</button></div>;
}
