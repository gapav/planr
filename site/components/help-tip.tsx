"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { Modal } from "./ui";
import { HELP_TOPICS, type HelpTopicId } from "@/lib/help";
import { cn } from "@/lib/utils";

/**
 * The question mark next to a heading or an action. It opens the shared modal,
 * which is a bottom sheet on a phone and a dialog on a desktop, so one
 * component covers both without a popover that has to dodge the viewport.
 */
export function HelpTip({ topic, className }: { topic: HelpTopicId; className?: string }) {
  const [open, setOpen] = useState(false); const content = HELP_TOPICS[topic];
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Hjelp: ${content.title}`} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:border-[var(--ink)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]", className)}><HelpCircle size={17} /></button>
    <Modal open={open} onClose={() => setOpen(false)} title={content.title} description={content.intro} size="sm">
      <ol className="grid gap-3">{content.points.map((point, index) => <li key={point} className="flex gap-3 text-sm leading-6">
        <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-xs font-black", !("ordered" in content && content.ordered) && "bg-transparent text-[var(--orange)]")}>{"ordered" in content && content.ordered ? index + 1 : "•"}</span>
        <span>{point}</span>
      </li>)}</ol>
      {"note" in content && <p className="mt-5 rounded-xl bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">{content.note}</p>}
    </Modal>
  </>;
}
