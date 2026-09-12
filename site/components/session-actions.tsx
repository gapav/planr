"use client";

import { Copy, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGrep } from "./app-provider";
import { SessionStartFields } from "./session-start-fields";
import { Button, Field, inputClass, Modal } from "./ui";
import { autoSessionTitle, canReopenSession, combineSessionStart, isAutoSessionTitle, reopenedSessionTab, sessionCopyDefaults } from "@/lib/session";
import type { PlannedSession } from "@/lib/types";
import { cn, formatSessionDate } from "@/lib/utils";

/**
 * Everything a coach can do to a plan without opening it. Editing and deleting
 * sit behind a menu so a thumb reaching for the card itself cannot land on
 * either, and copying and reopening join them for the same reason: each is one
 * deliberate tap rather than the one you make by accident.
 *
 * The entries follow the plan's own state. A started or finished session is
 * locked in the database, so the menu drops "Rediger" rather than offering a
 * screen that would bounce back, and only a finished one has anything to
 * reopen. An action the host cannot handle is left out entirely — the plan view
 * has no list to return to after a delete, so it does not offer one.
 */
export function SessionMenu({ session, open, onOpenChange, onCopy, onReopen, onDelete }: { session: PlannedSession; open: boolean; onOpenChange(open: boolean): void; onCopy(): void; onReopen?(): void; onDelete?(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node)) onOpenChange(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open, onOpenChange]);
  const inProgress = session.status === "in_progress";
  const editHref = inProgress || session.status === "completed" ? null : `/sessions/${session.id}/edit`;
  const reopenable = Boolean(onReopen) && canReopenSession(session);
  const entry = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left transition";
  return <div ref={ref} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Flere valg for ${session.title}`} onClick={() => onOpenChange(!open)} className={cn("grid h-11 w-11 place-items-center rounded-xl border border-transparent text-[var(--ink-soft)] transition hover:border-[var(--line)] hover:bg-[var(--paper)] hover:text-[var(--ink)]", open && "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]")}><MoreHorizontal size={19} /></button>
    {open && <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl">
      {editHref && <Link href={editHref} role="menuitem" autoFocus onClick={() => onOpenChange(false)} className={cn(entry, "text-[var(--ink)] hover:bg-[var(--paper)]")}><Pencil size={16} />Rediger</Link>}
      <button type="button" role="menuitem" autoFocus={!editHref} onClick={() => { onOpenChange(false); onCopy(); }} className={cn(entry, "text-[var(--ink)] hover:bg-[var(--paper)]")}><Copy size={16} />Kopier økt</button>
      {reopenable && <button type="button" role="menuitem" onClick={() => { onOpenChange(false); onReopen?.(); }} className={cn(entry, "text-[var(--ink)] hover:bg-[var(--paper)]")}><RotateCcw size={16} />Gjenåpne økt</button>}
      {onDelete && <>
        <div className="my-1.5 h-px bg-[var(--line)]" />
        <button type="button" role="menuitem" disabled={inProgress} onClick={() => { onOpenChange(false); onDelete(); }} className={cn(entry, "text-[var(--danger)] enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45")}><Trash2 size={16} />Slett økt</button>
        {inProgress && <p className="px-3 pb-1 pt-1.5 text-xs font-normal leading-5 text-[var(--ink-soft)]">Avslutt økten før den kan slettes.</p>}
      </>}
    </div>}
  </div>;
}

/**
 * Copying asks for the two things a copy cannot inherit: what it is called and
 * when it is held. Both arrive filled in — the same weekday and time a week on,
 * which is what "run this again" nearly always means — so the common case is
 * one tap. The copy lands as a draft and opens in the builder: publishing is
 * how a coach tells the team about a session, and that is their decision to
 * make once, not a side effect of copying.
 */
export function CopySessionDialog({ session, onClose }: { session: PlannedSession; onClose(): void }) {
  const { copySession } = useGrep();
  const router = useRouter();
  const defaults = useMemo(() => sessionCopyDefaults(session), [session]);
  const [title, setTitle] = useState(defaults.title);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Moving the date renames the copy as long as nobody has named it — the same
  // rule the builder follows, so the title a coach sees here is the title the
  // plan they land in will have.
  function changeStart(nextDate: string, nextTime: string) {
    setDate(nextDate); setTime(nextTime);
    const startsAt = combineSessionStart(nextDate, nextTime);
    if (startsAt && isAutoSessionTitle(title)) setTitle(autoSessionTitle(startsAt));
  }

  async function copy() {
    setBusy(true); setError("");
    try {
      const id = await copySession(session.id, { title, startsAt: combineSessionStart(date, time) });
      // The dialog goes with the page it was opened from, so `busy` stays on
      // until then rather than briefly offering the button a second time.
      router.push(`/sessions/${id}/edit`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Økten kunne ikke kopieres.");
      setBusy(false);
    }
  }

  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Kopier økt" description="Bolker, aktiviteter og notater følger med til et nytt utkast. Oppmøte og grupper blir igjen hos den opprinnelige økten." size="sm">
    {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{error}</p>}
    <div className="grid gap-5">
      <Field label="Tittel"><input className={inputClass} value={title} autoFocus onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Dato og klokkeslett" hint="Kan stå tom — kopien er et utkast du kan datere senere."><SessionStartFields date={date} time={time} onChange={changeStart} /></Field>
    </div>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={busy}>Avbryt</Button>
      <Button onClick={() => void copy()} disabled={busy || !title.trim()}><Copy size={17} />{busy ? "Kopierer…" : "Kopier økt"}</Button>
    </div>
  </Modal>;
}

/**
 * Reopening is the inverse of finishing, and the dialog says where the plan
 * actually ends up: the tabs are worked out from the date rather than stored, so
 * a workout held last month returns to "ready to start" and still sits under
 * Gjennomførte until it is given a new date.
 */
export function ReopenSessionDialog({ session, onClose }: { session: PlannedSession; onClose(): void }) {
  const { reopenSession } = useGrep();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const staysInPast = reopenedSessionTab(session) === "past";

  async function reopen() {
    setBusy(true); setError("");
    try {
      await reopenSession(session.id);
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Økten kunne ikke gjenåpnes.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Vil du gjenåpne økten?" description="Økten går tilbake til «Klar til start» og kan redigeres igjen. Oppmøtet og gruppene beholdes, slik at den kan rettes opp og kjøres på nytt." size="sm">
    {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{error}</p>}
    <p className="rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-bold">{session.title}</p>
    {staysInPast && <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Økten var satt til {formatSessionDate(session.startsAt)}, så den blir liggende under «Gjennomførte» til du gir den en ny dato.</p>}
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={busy}>Behold som gjennomført</Button>
      <Button onClick={() => void reopen()} disabled={busy}><RotateCcw size={17} />{busy ? "Gjenåpner…" : "Gjenåpne økt"}</Button>
    </div>
  </Modal>;
}
