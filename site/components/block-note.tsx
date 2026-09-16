import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A bolk's note is an instruction to whoever reads the plan — «sett opp mål før
 * stasjonsdelen» — so it is drawn as a note pinned to the block rather than as
 * a muted caption under its header: the label sits on its own line, which keeps
 * a long note a paragraph instead of a run-on sentence after a heading, and the
 * text keeps the line breaks the coach typed and the weight of something meant
 * to be acted on.
 *
 * It is deliberately lilac where an activity's «Stikkord» is apricot. The two
 * sit on the same card, and the colour is what says which one covers the whole
 * bolk and which one belongs to the one øvelse.
 */
export function BlockNote({ notes, className }: { notes: string; className?: string }) {
  return <aside className={cn("border-b border-b-[var(--line)] border-l-[3px] border-l-[var(--orange)] bg-[var(--grep-lilac)]/40 px-4 py-3.5 sm:px-5", className)}>
    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.11em] text-[var(--orange)]"><StickyNote size={13} aria-hidden />Notat for bolken</p>
    <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--ink)]">{notes}</p>
  </aside>;
}
