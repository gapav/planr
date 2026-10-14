"use client";

import { useState } from "react";
import { useGrep } from "@/components/app-provider";
import { Button, Field, inputClass, Modal, textareaClass } from "@/components/ui";
import { ITEM_CUES_MAX_LENGTH, ITEM_DESCRIPTION_MAX_LENGTH, ITEM_TITLE_MAX_LENGTH, itemTextPatch } from "@/lib/session";
import type { SessionItem } from "@/lib/types";

/**
 * An activity's words, written the way a focus is in the season overview: a
 * name, one sentence on what it is, and the stikkord — one point per line,
 * shown as bullets wherever the plan is read.
 *
 * `fromLibrary` items keep the exercise's name and description, which the plan
 * overlays from the library on every render, so only their stikkord are asked
 * for here.
 */
export function SessionItemDialog({ item, sessionId, fromLibrary, station, onClose }: { item: SessionItem; sessionId: string; fromLibrary: boolean; station?: number; onClose(): void }) {
  const { updateItem } = useGrep();
  const [draft, setDraft] = useState({ title: item.title, description: item.description, coachingNotes: item.coachingNotes });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };
  const blankTitle = !fromLibrary && !draft.title.trim();

  async function save() {
    const patch = itemTextPatch(item, draft, fromLibrary);
    if (!patch) { onClose(); return; }
    setBusy(true);
    try {
      await updateItem(sessionId, item.blockId, item.id, patch);
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kunne ikke lagre aktiviteten."); setBusy(false); }
  }

  const noun = station ? "stasjonen" : "aktiviteten";
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={fromLibrary ? item.title : station ? `Stasjon ${station}` : "Rediger aktivitet"} description={fromLibrary ? "Navnet og beskrivelsen hentes fra øvelsesbanken. Stikkordene gjelder bare denne økta." : `Hva ${noun} går ut på, og stikkordene trenerne skal ha med seg.`}>
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!busy && !blankTitle) void save(); }}>
      {!fromLibrary && <>
        <Field label="Navn">
          <input className={inputClass} value={draft.title} maxLength={ITEM_TITLE_MAX_LENGTH} autoFocus onChange={(event) => set({ title: event.target.value })} placeholder="F.eks. Skuddstasjon" />
        </Field>
        <Field label="Beskrivelse">
          <input className={inputClass} value={draft.description} maxLength={ITEM_DESCRIPTION_MAX_LENGTH} onChange={(event) => set({ description: event.target.value })} placeholder={`Én setning: hva ${noun} går ut på`} />
        </Field>
      </>}
      <Field label="Stikkord" hint="Ett punkt per linje">
        <textarea className={textareaClass} value={draft.coachingNotes} maxLength={ITEM_CUES_MAX_LENGTH} autoFocus={fromLibrary} onChange={(event) => set({ coachingNotes: event.target.value })} placeholder={"Skudd fra gulv\nSkudd i luft\nEtter mottak, i fart"} />
      </Field>
      {error && <p role="alert" className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Avbryt</Button>
        <Button type="submit" disabled={busy || blankTitle}>{busy ? "Lagrer…" : "Lagre"}</Button>
      </div>
    </form>
  </Modal>;
}
