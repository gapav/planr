"use client";

import { HelpCircle } from "lucide-react";
import { useId, useState } from "react";
import { Modal } from "./ui";
import { HELP_TOPICS, type HelpTopic, type HelpTopicId } from "@/lib/help";
import { cn } from "@/lib/utils";

/** The body of a help topic — shared by the modal and the inline disclosure. */
function HelpBody({ content }: { content: HelpTopic }) {
  return <>
    <ol className="grid gap-3">{content.points.map((point, index) => <li key={point} className="flex gap-3 text-sm leading-6">
      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-xs font-black", !content.ordered && "bg-transparent text-[var(--orange)]")}>{content.ordered ? index + 1 : "•"}</span>
      <span>{point}</span>
    </li>)}</ol>
    {content.note && <p className="mt-5 rounded-xl bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">{content.note}</p>}
  </>;
}

/**
 * The question mark next to a heading or an action. It opens the shared modal,
 * which is a bottom sheet on a phone and a dialog on a desktop, so one
 * component covers both without a popover that has to dodge the viewport.
 */
export function HelpTip({ topic, className }: { topic: HelpTopicId; className?: string }) {
  const [open, setOpen] = useState(false); const content: HelpTopic = HELP_TOPICS[topic];
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Hjelp: ${content.title}`} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:border-[var(--ink)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]", className)}><HelpCircle size={17} /></button>
    <Modal open={open} onClose={() => setOpen(false)} title={content.title} description={content.intro} size="sm">
      <HelpBody content={content} />
    </Modal>
  </>;
}

/**
 * A small question mark beside a field label. Hovering or focusing it reveals a
 * bubble; a click pins the bubble open, which is the only thing that works on a
 * touch screen. Rendered as phrasing content so it can sit next to a label.
 */
export function HelpHint({ topic, className }: { topic: HelpTopicId; className?: string }) {
  const [hovered, setHovered] = useState(false); const [pinned, setPinned] = useState(false);
  const bubbleId = useId(); const content: HelpTopic = HELP_TOPICS[topic]; const open = hovered || pinned;
  return <span className={cn("relative inline-flex", className)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <button type="button" aria-label={`Hjelp: ${content.title}`} aria-expanded={open} aria-describedby={open ? bubbleId : undefined} onClick={() => setPinned((value) => !value)} onFocus={() => setHovered(true)} onBlur={() => { setHovered(false); setPinned(false); }} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setHovered(false); } }} className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:border-[var(--ink)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]"><HelpCircle size={13} /></button>
    {open && <span id={bubbleId} role="tooltip" className="absolute left-0 top-7 z-30 block w-[min(19rem,calc(100vw-3rem))] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left font-normal shadow-[0_12px_34px_rgba(16,32,29,.16)]">
      <span className="block text-sm font-black">{content.title}</span>
      <span role="list" className="mt-2.5 block">{content.points.map((point, index) => <span role="listitem" key={point} className="mt-1.5 flex gap-2 text-xs leading-5 first:mt-0">
        <span className={cn("mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-[10px] font-black", !content.ordered && "bg-transparent text-[var(--orange)]")}>{content.ordered ? index + 1 : "\u2022"}</span>
        <span>{point}</span>
      </span>)}</span>
      {content.note && <span className="mt-3 block text-xs leading-5 text-[var(--ink-soft)]">{content.note}</span>}
    </span>}
  </span>;
}
