"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Button, Field, inputClass, Modal, textareaClass } from "@/components/ui";
import { FOCUS_MAX_WEEKS, FOCUS_NOTE_MAX_LENGTH, FOCUS_NOTES_MAX_LENGTH, FOCUS_TITLE_MAX_LENGTH, focusEndsOn, overlappingFocus } from "@/lib/focus";
import { seasonWeeks } from "@/lib/season";
import type { FocusPeriod, FocusPeriodInput } from "@/lib/types";
import { cn } from "@/lib/utils";

const shortDay = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (key: string) => shortDay.format(new Date(`${key}T12:00:00Z`));

/**
 * One focus, in the shape of a phase in Spenst's season plan: a name for the
 * bar, the weeks it runs, one sentence on what it is for, and its points. The
 * whole coaching team shares it, so saving simply overwrites.
 *
 * `focus` is the one being edited; without it the dialog creates a new focus
 * from `initial`, which says where it starts and how long it runs.
 */
export function FocusDialog({ focus, initial, onClose, onSaved }: { focus: FocusPeriod | null; initial: FocusPeriodInput; onClose(): void; onSaved?(id: string): void }) {
  const { currentTeam, focusPeriods, createFocusPeriod, updateFocusPeriod, deleteFocusPeriod } = useGrep();
  const [draft, setDraft] = useState<FocusPeriodInput>(focus ? { title: focus.title, note: focus.note, notes: focus.notes, startsOn: focus.startsOn, weeks: focus.weeks } : initial);
  const [weeksText, setWeeksText] = useState(String(draft.weeks));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<FocusPeriodInput>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };
  const teamId = focus?.teamId ?? currentTeam?.id ?? "";
  const clash = overlappingFocus(focusPeriods, { id: focus?.id, teamId, startsOn: draft.startsOn, weeks: draft.weeks });

  // The weeks of the season the focus starts in, August to July, with the
  // chosen Monday kept even if it lies outside them.
  const weekOptions = useMemo(() => {
    const [year, month] = draft.startsOn.split("-").map(Number);
    const weeks = seasonWeeks(month >= 8 ? year : year - 1, "", [], []).map((week) => ({ start: week.start, number: week.number }));
    return weeks.some((week) => week.start === draft.startsOn) ? weeks : [{ start: draft.startsOn, number: 0 }, ...weeks].sort((a, b) => a.start.localeCompare(b.start));
  }, [draft.startsOn]);

  async function save() {
    if (clash) { setError(`Overlapper med «${clash.title}».`); return; }
    setBusy(true);
    try {
      // The provider rolls a failed save back and announces it, so the dialog
      // stays open with what was typed still in it.
      let id = focus?.id;
      if (id) await updateFocusPeriod(id, draft);
      else id = await createFocusPeriod(draft);
      onSaved?.(id);
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kunne ikke lagre fokuset."); setBusy(false); }
  }

  async function remove() {
    if (!focus) return;
    setBusy(true);
    try { await deleteFocusPeriod(focus.id); onClose(); } catch { setBusy(false); }
  }

  return <Modal open onClose={() => { if (!busy) onClose(); }} title={focus ? "Rediger fokus" : "Nytt fokus"} description="Hva laget skal jobbe mest med i en periode. Alle trenerne på laget kan endre det.">
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!busy && draft.title.trim()) void save(); }}>
      <Field label="Navn" hint="Vises i sesongkalenderen">
        <input className={inputClass} value={draft.title} maxLength={FOCUS_TITLE_MAX_LENGTH} autoFocus onChange={(event) => set({ title: event.target.value })} placeholder="F.eks. Forsvar 6-0" />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <Field label="Starter">
          <select className={inputClass} value={draft.startsOn} onChange={(event) => set({ startsOn: event.target.value })}>
            {weekOptions.map((week) => <option key={week.start} value={week.start}>{week.number ? `Uke ${week.number} · ${dayLabel(week.start)}` : dayLabel(week.start)}</option>)}
          </select>
        </Field>
        <Field label="Uker">
          <input className={cn(inputClass, "w-24")} inputMode="numeric" value={weeksText} onChange={(event) => { setWeeksText(event.target.value); const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= FOCUS_MAX_WEEKS) set({ weeks: count }); }} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-[var(--ink-soft)]">{dayLabel(draft.startsOn)}–{dayLabel(focusEndsOn(draft))}</p>
      <Field label="Fokus">
        <input className={inputClass} value={draft.note} maxLength={FOCUS_NOTE_MAX_LENGTH} onChange={(event) => set({ note: event.target.value })} placeholder="Én setning: hva perioden er til for" />
      </Field>
      <Field label="Notater" hint="Ett punkt per linje">
        <textarea className={textareaClass} value={draft.notes} maxLength={FOCUS_NOTES_MAX_LENGTH} onChange={(event) => set({ notes: event.target.value })} placeholder={"Samarbeid mellom to-er og tre-er\nAvslutt hver økt med kontring"} />
      </Field>
      {(error || clash) && <p role="alert" className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error ?? `Overlapper med «${clash?.title}». Flytt eller kort ned ett av dem.`}</p>}
      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {focus && (confirmDelete
          ? <Button type="button" variant="danger" className="sm:mr-auto" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />Slett fokuset</Button>
          : <Button type="button" variant="ghost" className="sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} />Slett</Button>)}
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Avbryt</Button>
        <Button type="submit" disabled={busy || !draft.title.trim() || Boolean(clash)}>{busy ? "Lagrer…" : "Lagre"}</Button>
      </div>
    </form>
  </Modal>;
}
