"use client";

import { ArrowDown, ArrowUp, ChevronRight, Clock3, Eye, Library, Plus, Search, Timer, Trash2, TriangleAlert, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { filterExercises } from "@/lib/exercises";
import { scheduleWarmupItems, warmupSchedule } from "@/lib/warmup";
import type { Exercise, ExerciseCategory, TeamFixture, WarmupItem, WarmupRoutine } from "@/lib/types";
import { useGrep } from "./app-provider";
import { ExerciseCategoryFilter } from "./exercise-category-filter";
import { ExerciseDetail, sessionItemDetailSubject, type ExerciseDetailSubject } from "./exercise-detail";
import { ExerciseThumbnail } from "./exercise-thumbnail";
import { Button, Field, Modal, Tag, inputClass, textareaClass } from "./ui";
import { cn, minutesLabel } from "@/lib/utils";

function activityLabel(count: number) {
  return `${count} ${count === 1 ? "aktivitet" : "aktiviteter"}`;
}

function clock(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/**
 * The warm-up is one surface with three panes rather than a stack of dialogs:
 * on a phone the modal is already a full-height sheet, so adding an exercise
 * swaps what the sheet shows instead of piling a third layer on top of it.
 */
type Pane = "view" | "edit" | "pick";

export function WarmupDialog({ open, fixture, routine, canEdit, onClose }: { open: boolean; fixture: TeamFixture | null; routine: WarmupRoutine | null; canEdit: boolean; onClose(): void }) {
  const { ensureWarmupRoutine, addCustomWarmupItem } = useGrep();
  const [pane, setPane] = useState<Pane>("view");
  const [preview, setPreview] = useState<ExerciseDetailSubject | null>(null);
  const [busy, setBusy] = useState(false);

  const startsAt = fixture?.startsAt ?? null;
  const schedule = routine ? warmupSchedule(startsAt, routine) : null;
  const scheduled = useMemo(() => routine ? scheduleWarmupItems(startsAt, routine) : [], [routine, startsAt]);

  function close() { setPane("view"); setPreview(null); onClose(); }

  // Nothing is written until a coach actually starts building, so the first
  // activity is what creates the routine.
  async function startRoutine() {
    setBusy(true);
    try { const id = await ensureWarmupRoutine(); await addCustomWarmupItem(id); setPane("edit"); }
    catch { /* the provider surfaces a notice */ }
    finally { setBusy(false); }
  }

  const title = pane === "pick" ? "Legg til fra øvelsesbanken" : pane === "edit" ? "Rediger oppvarmingen" : routine?.name ?? "Kampoppvarming";
  const description = pane === "pick" ? "Øvelsen kopieres inn i oppvarmingen, slik at rutinen ikke endrer seg når øvelsesbanken gjør det."
    : pane === "edit" ? "Laget har én kampoppvarming. Endringene her gjelder alle kampene i kalenderen."
    : fixture ? `${fixture.homeTeam} — ${fixture.awayTeam} · ${new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(fixture.startsAt))} kl. ${clock(fixture.startsAt)}` : undefined;

  return <>
    <Modal open={open} onClose={close} size="lg" title={title} description={description}>
      {pane === "view" && <ViewPane routine={routine} scheduled={scheduled} schedule={schedule} canEdit={canEdit} busy={busy} onEdit={() => setPane("edit")} onStart={() => void startRoutine()} onPreview={setPreview} />}
      {pane === "edit" && routine && <EditPane routine={routine} onPick={() => setPane("pick")} onDone={() => setPane("view")} />}
      {pane === "pick" && routine && <PickPane routine={routine} onDone={() => setPane("edit")} onPreview={setPreview} />}
    </Modal>
    <ExerciseDetail exercise={preview} onClose={() => setPreview(null)} />
  </>;
}

function ViewPane({ routine, scheduled, schedule, canEdit, busy, onEdit, onStart, onPreview }: {
  routine: WarmupRoutine | null; scheduled: ReturnType<typeof scheduleWarmupItems>; schedule: ReturnType<typeof warmupSchedule>;
  canEdit: boolean; busy: boolean; onEdit(): void; onStart(): void; onPreview(subject: ExerciseDetailSubject): void;
}) {
  if (!routine || !routine.items.length) return <div className="grid gap-5 text-center">
    <div className="rounded-[22px] border border-dashed border-[#c8c3b7] bg-[var(--paper)] px-6 py-10">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--orange)] shadow-sm"><Timer size={23} /></span>
      <p className="mt-4 font-black">Ingen kampoppvarming ennå</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">Sett opp rutinen én gang. Den vises på alle kampene i kalenderen, med klokkeslett regnet ut fra avkast.</p>
      {canEdit && <Button className="mt-5" onClick={onStart} disabled={busy}><Plus size={17} />{busy ? "Oppretter…" : "Lag oppvarmingen"}</Button>}
    </div>
  </div>;

  return <div className="grid gap-5">
    {schedule && <div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--line)] text-center">
        <TimeCell icon={<Users size={14} />} label="Oppmøte" value={clock(schedule.meetAt)} />
        <TimeCell icon={<Timer size={14} />} label="Oppvarming" value={clock(schedule.warmupAt)} />
        <TimeCell icon={<Clock3 size={14} />} label="Avkast" value={clock(schedule.kickOffAt)} accent />
      </div>
      {schedule.startsBeforeMeetUp && <p className="mt-2 flex items-start gap-2 rounded-xl bg-[#fdf1e6] px-3 py-2 text-xs font-semibold leading-5 text-[#9c3913]"><TriangleAlert size={14} className="mt-0.5 shrink-0" />Oppvarmingen er {minutesLabel(schedule.durationMinutes)} lang, men laget møtes bare {minutesLabel(routine.meetMinutesBefore)} før avkast. Kort ned rutinen eller flytt oppmøtet.</p>}
    </div>}

    <ol className="grid gap-2">{scheduled.map(({ item, startsAt }, index) => {
      // The activity carries its own copy of the media, so the thumbnail and
      // the detail popup are built from the same subject the library would use.
      const subject = sessionItemDetailSubject(item);
      return <li key={item.id}>
      <button type="button" onClick={() => onPreview(subject)} className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left transition hover:border-[var(--ink)]">
        <span className="grid w-12 shrink-0 text-center"><span className="text-sm font-black leading-4">{startsAt ? clock(startsAt) : index + 1}</span><span className="mt-0.5 text-[10px] font-bold text-[var(--ink-soft)]">{item.durationMinutes} min</span></span>
        <ExerciseThumbnail exercise={subject} className="h-12 w-16 shrink-0 rounded-xl [&>span]:text-2xl" />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{item.title}</span>{(item.coachingNotes || item.description) && <span className="clamp-2 mt-0.5 block text-xs leading-5 text-[var(--ink-soft)]">{item.coachingNotes || item.description}</span>}</span>
        <Eye size={16} className="shrink-0 text-[var(--ink-soft)] opacity-0 transition group-hover:opacity-100" />
      </button>
    </li>; })}</ol>

    {routine.notes && <section className="rounded-2xl bg-[var(--paper)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--ink-soft)]">Notat</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{routine.notes}</p></section>}

    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-bold text-[var(--ink-soft)]">{activityLabel(routine.items.length)} · {minutesLabel(schedule?.durationMinutes ?? 0)}</span>
      {canEdit && <Button variant="secondary" onClick={onEdit}>Rediger oppvarmingen</Button>}
    </div>
  </div>;
}

function TimeCell({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={cn("px-2 py-3", accent ? "bg-[var(--ink)] text-white" : "bg-[var(--surface)]")}>
    <p className={cn("flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[.1em]", accent ? "text-white/60" : "text-[var(--ink-soft)]")}>{icon}{label}</p>
    <p className="mt-1 text-xl font-black tracking-[-.03em]">{value}</p>
  </div>;
}

function EditPane({ routine, onPick, onDone }: { routine: WarmupRoutine; onPick(): void; onDone(): void }) {
  const { addCustomWarmupItem, updateWarmupRoutine, reorderWarmupItems } = useGrep();
  const items = routine.items;

  // Arrows rather than drag: this list is read and reordered on a phone, in a
  // hall, inside a sheet that already scrolls.
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ordered = items.map((item) => item.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void reorderWarmupItems(routine.id, ordered);
  }

  return <div className="grid gap-5">
    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <Field label="Oppmøte før avkast" hint="minutter">
        <input type="number" min={0} max={300} step={5} className={inputClass} defaultValue={routine.meetMinutesBefore} onBlur={(event) => { const value = Math.min(300, Math.max(0, Number(event.target.value) || 0)); event.target.value = String(value); if (value !== routine.meetMinutesBefore) void updateWarmupRoutine(routine.id, { meetMinutesBefore: value }); }} />
      </Field>
      <Field label="Notat til trenerteamet">
        <textarea className={cn(textareaClass, "min-h-11")} rows={2} defaultValue={routine.notes} placeholder="Utstyr, keeperoppvarming, hvem som leder …" onBlur={(event) => { if (event.target.value !== routine.notes) void updateWarmupRoutine(routine.id, { notes: event.target.value }); }} />
      </Field>
    </div>

    {items.length ? <ol className="grid gap-2.5">{items.map((item, index) => <li key={item.id}><EditRow item={item} index={index} routineId={routine.id} first={index === 0} last={index === items.length - 1} onMove={move} /></li>)}</ol>
      : <p className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center text-sm text-[var(--ink-soft)]">Ingen aktiviteter ennå. Legg til den første under.</p>}

    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" onClick={onPick}><Library size={16} />Legg til øvelse</Button>
      <Button variant="ghost" onClick={() => void addCustomWarmupItem(routine.id)}><Plus size={16} />Egendefinert aktivitet</Button>
    </div>
    <div className="flex justify-end"><Button onClick={onDone}>Ferdig</Button></div>
  </div>;
}

function EditRow({ item, index, routineId, first, last, onMove }: { item: WarmupItem; index: number; routineId: string; first: boolean; last: boolean; onMove(index: number, delta: number): void }) {
  const { updateWarmupItem, deleteWarmupItem } = useGrep();
  return <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--paper-deep)] text-xs font-black">{index + 1}</span>
      <input key={`${item.id}-title`} className={cn(inputClass, "min-w-0 flex-1 font-bold")} defaultValue={item.title} aria-label={`Tittel på aktivitet ${index + 1}`} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== item.title) void updateWarmupItem(routineId, item.id, { title: value }); else event.target.value = item.title; }} />
      <label className="flex shrink-0 items-center gap-1.5 text-sm font-bold"><input key={`${item.id}-minutes`} type="number" min={1} max={180} className={cn(inputClass, "w-16 px-2 text-center")} defaultValue={item.durationMinutes} aria-label={`Minutter for ${item.title}`} onBlur={(event) => { const value = Math.min(180, Math.max(1, Number(event.target.value) || 1)); event.target.value = String(value); if (value !== item.durationMinutes) void updateWarmupItem(routineId, item.id, { durationMinutes: value }); }} />min</label>
    </div>
    <div className="mt-2 flex items-center gap-2">
      <input key={`${item.id}-note`} className={cn(inputClass, "min-h-9 min-w-0 flex-1 text-sm")} defaultValue={item.coachingNotes} placeholder="Trenernotat …" aria-label={`Notat for ${item.title}`} onBlur={(event) => { if (event.target.value !== item.coachingNotes) void updateWarmupItem(routineId, item.id, { coachingNotes: event.target.value }); }} />
      <Button variant="ghost" size="sm" className="px-2" disabled={first} aria-label={`Flytt ${item.title} opp`} onClick={() => onMove(index, -1)}><ArrowUp size={16} /></Button>
      <Button variant="ghost" size="sm" className="px-2" disabled={last} aria-label={`Flytt ${item.title} ned`} onClick={() => onMove(index, 1)}><ArrowDown size={16} /></Button>
      <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" aria-label={`Fjern ${item.title}`} onClick={() => { if (confirm(`Vil du fjerne ${item.title} fra oppvarmingen?`)) void deleteWarmupItem(routineId, item.id); }}><Trash2 size={16} /></Button>
    </div>
  </div>;
}

function PickPane({ routine, onDone, onPreview }: { routine: WarmupRoutine; onDone(): void; onPreview(subject: ExerciseDetailSubject): void }) {
  const { exercises, addWarmupExercise } = useGrep();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const filtered = useMemo(() => filterExercises(exercises, query, category), [exercises, query, category]);

  async function add(exercise: Exercise) {
    await addWarmupExercise(routine.id, exercise);
    onDone();
  }

  return <div className="grid gap-3">
    <div className="relative"><Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk etter øvelser …" aria-label="Søk etter øvelser" autoFocus /></div>
    <ExerciseCategoryFilter value={category} onChange={setCategory} />
    <p className="text-xs font-semibold text-[var(--ink-soft)]">{filtered.length} øvelser</p>
    {filtered.length ? <div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1 thin-scrollbar sm:grid-cols-2">{filtered.map((exercise) => <div key={exercise.id} className="group flex gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 text-left transition focus-within:border-[var(--ink)] hover:border-[var(--ink)]">
      <button type="button" className="group/media relative h-20 w-24 shrink-0 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]" aria-label={`Vis detaljer for ${exercise.name}`} onClick={() => onPreview(exercise)}><ExerciseThumbnail exercise={exercise} className="h-full w-full" /><span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover/media:opacity-100 group-focus-visible/media:opacity-100"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/90"><Eye size={15} /></span></span></button>
      <button type="button" className="min-w-0 flex-1 text-left" aria-label={`Legg ${exercise.name} til i oppvarmingen`} onClick={() => void add(exercise)}><span className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--orange)]">{exercise.category}</span><strong className="mt-1 block text-sm">{exercise.name}</strong><span className="clamp-2 mt-1 text-xs leading-5 text-[var(--ink-soft)]">{exercise.description}</span></button>
    </div>)}</div> : <div className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><p className="font-black">Fant ingen øvelser</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Prøv en annen kategori eller et annet søkeord.</p><Button variant="ghost" size="sm" className="mt-3" onClick={() => { setQuery(""); setCategory(null); }}>Nullstill filtre</Button></div>}
    <div className="flex justify-between"><Button variant="ghost" onClick={onDone}>Tilbake</Button><span className="self-center text-xs text-[var(--ink-soft)]">Aktiviteten legges nederst, med fem minutter som varighet</span></div>
  </div>;
}

/** The strip in the match dialog that opens all of this. */
export function WarmupSummaryButton({ routine, startsAt, onOpen }: { routine: WarmupRoutine | null; startsAt: string; onOpen(): void }) {
  const schedule = routine ? warmupSchedule(startsAt, routine) : null;
  const count = routine?.items.length ?? 0;
  return <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-left transition hover:border-[var(--ink)]">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--orange)] shadow-sm"><Timer size={18} /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-black">{routine?.name ?? "Kampoppvarming"}</span>
      <span className="block truncate text-xs text-[var(--ink-soft)]">{count ? `${activityLabel(count)} · ${minutesLabel(schedule?.durationMinutes ?? 0)} · start kl. ${clock(schedule?.warmupAt ?? null)}` : "Ikke satt opp ennå"}</span></span>
    {schedule?.startsBeforeMeetUp && <Tag tone="orange">For lang</Tag>}
    <ChevronRight size={17} className="shrink-0 text-[var(--ink-soft)]" />
  </button>;
}
