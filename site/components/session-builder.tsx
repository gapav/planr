"use client";
/* eslint-disable @next/next/no-img-element -- session thumbnails snapshot arbitrary library media */

import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Calendar, Check, ChevronDown, CirclePlay, Clock3, Eye, GripVertical, LayoutGrid, Library, MapPin, MoreVertical, Pencil, Plus, Radio, Search, Sparkles, Trash2, TriangleAlert, UserRoundPlus, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { blockGlyph, blockPresets } from "./block-presets";
import { ShortlistChips, useShortlistIds } from "./collections";
import { useGrep } from "./app-provider";
import { ExerciseAgeGroupFilter } from "./exercise-age-group-filter";
import { ExerciseCategoryFilter } from "./exercise-category-filter";
import { HelpTip } from "./help-tip";
import { ExerciseDetail, sessionItemDetailSubject } from "./exercise-detail";
import { ExerciseThumbnail, ItemThumbnailPlaceholder } from "./exercise-thumbnail";
import { WorkoutSession } from "./live-session";
import { SessionStartFields } from "./session-start-fields";
import { Avatar, Button, EmptyState, Field, inputClass, Modal, Tag, textareaClass } from "./ui";
import { useSessionRealtime } from "@/hooks/use-session-realtime";
import { countExerciseFacets, filterExercises, type ExerciseShortlist } from "@/lib/exercises";
import { assignedCoach, autoSessionTitle, blockClock, blockDuration, coachAssignmentOptions, combineSessionStart, isAutoSessionTitle, isStationBlock, sessionDuration, sessionSchedule, splitSessionStart, stationRotation, validatePublish } from "@/lib/session";
import { MIN_STATIONS } from "@/lib/types";
import type { Exercise, ExerciseAgeGroup, ExerciseCategory, PlannedSession, Profile, SaveState, SessionBlock, SessionBlockKind, SessionItem } from "@/lib/types";
import { clockTime, cn, minutesLabel } from "@/lib/utils";

/**
 * The line under the plan's title, which is the only place a coach is told
 * whether their typing is reaching the database.
 *
 * `error` is listed before the connection states on purpose: it means the
 * database looked at a change and refused it, so something the coach can see on
 * screen is missing from the plan. A realtime socket that is reconnecting is
 * ordinary and says nothing about whether the last save landed.
 */
function SaveIndicator({ saveState, connected }: { saveState: SaveState; connected: boolean }) {
  if (saveState === "saving") return <><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--orange)]" />Lagrer…</>;
  if (saveState === "error") return <span className="flex items-center gap-2 text-[var(--danger)]"><TriangleAlert size={12} />Siste endring ble ikke lagret</span>;
  if (saveState === "offline" || !connected) return <><WifiOff size={12} />Kobler til på nytt …</>;
  return <><Check size={12} />Alle endringer er lagret</>;
}

/** The rotations the stepper moves between — a minute at a time, around the six a coach starts from. */
const MIN_ROTATION_MINUTES = 1;
const MAX_ROTATION_MINUTES = 60;

/**
 * `/sessions/<id>/edit`. The read-only view lives at `/sessions/<id>`, which is
 * where the calendar links; a plan that has been started is locked in the
 * database, so it opens the workout view here too rather than a builder whose
 * every save would be refused.
 */
export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { sessions } = useGrep();
  const session = sessions.find((entry) => entry.id === sessionId);
  return session?.status === "in_progress" || session?.status === "completed" ? <WorkoutSession sessionId={sessionId} /> : <SessionBuilder sessionId={sessionId} />;
}

const TOUCH_HOLD_MS = 250;

/**
 * Blocks and activities reorder with the same gestures. Touch needs a sensor of
 * its own: a pointer drag has to claim the gesture before the browser decides
 * the finger is scrolling, and it loses that race every time — the browser
 * scrolls, cancels the pointer, and the drag never starts. So a finger presses
 * and holds on the grip, the way it does on the grouping board, and an ordinary
 * swipe across the handle still scrolls the page.
 */
function useReorderSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export function SessionBuilder({ sessionId }: { sessionId: string }) {
  const store = useGrep(); const router = useRouter(); const session = store.sessions.find((entry) => entry.id === sessionId); const [activeBlockId, setActiveBlockId] = useState<string | null>(session?.blocks[0]?.id ?? null); const [blockMenu, setBlockMenu] = useState(false); const [pickerBlock, setPickerBlock] = useState<string | null>(null); const [publishIssues, setPublishIssues] = useState<string[]>([]); const [publishing, setPublishing] = useState(false); const [previewItem, setPreviewItem] = useState<SessionItem | null>(null);
  const { collaborators, connected } = useSessionRealtime(sessionId, store.user, activeBlockId, () => store.reloadSession(sessionId), store.isDemoMode);
  const sensors = useReorderSensors();
  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<Calendar size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." action={<Link href="/sessions" className="font-bold underline">Tilbake til øktkalenderen</Link>} /></div></AppShell>;
  const stableSession = session;
  const builtMinutes = sessionDuration(session); const difference = builtMinutes - session.plannedDurationMinutes;
  const schedule = sessionSchedule(session);
  const start = splitSessionStart(session.startsAt);

  // Dating a plan also names it, as long as nobody has named it themselves:
  // the week and weekday are what a coach types into the title anyway, and
  // they have to follow the date when it moves.
  function saveStart(date: string, time: string) {
    const startsAt = combineSessionStart(date, time);
    void store.updateSession(sessionId, { startsAt, ...(startsAt && isAutoSessionTitle(stableSession.title) ? { title: autoSessionTitle(startsAt) } : {}) });
  }
  async function addBlock(title: string, kind: SessionBlockKind = "sequence") { const id = await store.addBlock(sessionId, title, kind); setActiveBlockId(id); setBlockMenu(false); }
  async function publish() { const issues = validatePublish(stableSession); if (issues.length) { setPublishIssues(issues); return; } setPublishing(true); try { await store.publishSession(sessionId); } finally { setPublishing(false); } }
  function blocksDragEnd(event: DragEndEvent) { const { active, over } = event; if (!over || active.id === over.id) return; const oldIndex = stableSession.blocks.findIndex((block) => block.id === active.id); const newIndex = stableSession.blocks.findIndex((block) => block.id === over.id); void store.reorderBlocks(sessionId, arrayMove(stableSession.blocks, oldIndex, newIndex).map((block) => block.id)); }

  return <AppShell><div className="min-h-screen pb-24"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]/92 px-4 py-3 backdrop-blur-xl sm:px-7"><div className="mx-auto flex max-w-[1380px] items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Link href="/sessions" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={20} /></Link><div className="min-w-0"><p className="truncate text-sm font-black">{session.title}</p><div className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-[var(--ink-soft)]"><SaveIndicator saveState={store.saveState} connected={connected} /></div></div></div><div className="flex items-center gap-2"><div className="hidden items-center -space-x-2 sm:flex">{collaborators.map((person) => <Avatar key={person.id} {...person} name={person.fullName} />)}{collaborators.length > 0 && <span className="ml-4 text-xs font-bold text-[var(--ink-soft)]">{collaborators.length} redigerer</span>}</div><Button variant="secondary" className="hidden xl:inline-flex"><UserRoundPlus size={17} />Inviter trener</Button><Link href={`/sessions/${sessionId}/live`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:border-[var(--ink)]"><CirclePlay size={17} /><span className="hidden sm:inline">Start økten</span><span className="sm:hidden">Start</span></Link><Button onClick={() => void publish()} disabled={publishing || session.status === "published"}>{session.status === "published" ? <><Check size={17} /><span className="hidden sm:inline">Publisert</span></> : publishing ? "Publiserer…" : "Publiser"}</Button></div></div></header>
    <div className="mx-auto grid max-w-[1380px] gap-7 px-4 pt-7 sm:px-7 xl:grid-cols-[minmax(0,1fr)_330px]"><main className="min-w-0"><section className="rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_30px_rgba(16,32,29,.04)] sm:p-7"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Tag tone={session.status === "draft" ? "orange" : "green"}>{session.status === "draft" ? "Øktutkast" : "Publisert"}</Tag><HelpTip topic="session-publish" /></div><AutoField className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl" value={session.title} onSave={(value) => store.updateSession(sessionId, { title: value })} ariaLabel="Økttittel" /></div><MoreVertical className="text-[var(--ink-soft)]" size={20} /></div><div className="mt-7 grid gap-5 border-t border-[var(--line)] pt-6 sm:grid-cols-2"><Field label="Dato og klokkeslett"><SessionStartFields date={start.date} time={start.time} onChange={saveStart} /></Field><Field label="Sted"><div className="relative min-w-0"><MapPin className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><DebouncedInput className={`${inputClass} pl-10`} value={session.venue} placeholder="Bane eller sted" onSave={(value) => store.updateSession(sessionId, { venue: value })} /></div></Field><Field label="Planlagt varighet"><div className="relative min-w-0"><Clock3 className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><select className={`${inputClass} appearance-none pl-10`} value={session.plannedDurationMinutes} onChange={(event) => void store.updateSession(sessionId, { plannedDurationMinutes: Number(event.target.value) })}>{[45, 60, 75, 90, 105, 120].map((minutes) => <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /></div></Field><Field label="Mål for økten"><DebouncedInput className={inputClass} value={session.objective} placeholder="Hva skal laget bli bedre på?" onSave={(value) => store.updateSession(sessionId, { objective: value })} /></Field></div></section>
      <section className="mt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[var(--orange)]">Øktplan</p><div className="mt-2 flex items-center gap-2.5"><h2 className="text-3xl font-black tracking-[-.045em]">Planlegg økten</h2><HelpTip topic="session-builder" /></div></div><div className="relative"><Button variant="secondary" onClick={() => setBlockMenu((value) => !value)}><Plus size={18} />Legg til bolk<ChevronDown size={16} /></Button>{blockMenu && <div className="absolute right-0 top-13 z-10 w-[19rem] rounded-2xl border border-[var(--line)] bg-white p-2 shadow-xl">{blockPresets.map((preset) => <BlockMenuItem key={preset.title} icon={preset.icon} title={preset.title} description={preset.description} onClick={() => void addBlock(preset.title, preset.kind)} />)}
          <div className="my-1 border-t border-[var(--line)]" />
          <BlockMenuItem icon={Pencil} title="Egendefinert bolk …" description="Gi bolken ditt eget navn." accent onClick={() => { const title = prompt("Navn på bolken", "Egendefinert bolk"); if (title?.trim()) void addBlock(title.trim()); }} /></div>}</div></div>
        {session.blocks.length ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={blocksDragEnd}><SortableContext items={session.blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}><div className="mt-6 grid gap-5">{session.blocks.map((block, index) => <SortableBlockCard key={block.id} block={block} index={index} session={session} clock={blockClock(schedule, block.id)} active={activeBlockId === block.id} collaborators={collaborators.filter((person) => person.activeBlockId === block.id)} onActive={() => setActiveBlockId(block.id)} onPickExercise={() => setPickerBlock(block.id)} onPreviewItem={setPreviewItem} />)}</div></SortableContext></DndContext> : <div className="mt-6"><EmptyState icon={<Sparkles size={22} />} title="Start med en bolk" body="Legg til oppvarming, hoveddel, spill eller en egendefinert bolk." action={<Button onClick={() => void addBlock("Oppvarming")}><Plus size={17} />Legg til oppvarming</Button>} /></div>}
      </section></main>
      <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start"><section className="rounded-[24px] bg-[var(--ink)] p-5 text-white shadow-[var(--shadow)]"><p className="text-xs font-black uppercase tracking-[.14em] text-white/45">Tidskontroll</p><div className="mt-4 flex items-baseline gap-2"><strong className="text-4xl font-black tracking-[-.06em]">{builtMinutes}</strong><span className="text-white/55">av {session.plannedDurationMinutes} min</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className={cn("h-full rounded-full", difference > 0 ? "bg-[var(--orange)]" : "bg-[var(--lime)]")} style={{ width: `${Math.min(100, Math.round((builtMinutes / session.plannedDurationMinutes) * 100))}%` }} /></div><p className="mt-3 text-xs leading-5 text-white/55">{difference === 0 ? "Øktplanen samsvarer med planlagt varighet." : difference > 0 ? `${difference} minutter over planlagt tid.` : `${Math.abs(difference)} minutter er fortsatt tilgjengelig.`}</p></section><section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><h3 className="font-black">Aktive samarbeidspartnere</h3><span className="flex items-center gap-1.5 text-xs font-bold text-[#34745f]"><Radio size={13} className="animate-pulse" />Direkte</span></div><div className="mt-4 grid gap-3">{collaborators.map((person) => { const block = session.blocks.find((entry) => entry.id === person.activeBlockId); return <div key={person.id} className="flex items-center gap-3"><Avatar name={person.fullName} initials={person.initials} color={person.color} /><div><p className="text-sm font-bold">{person.fullName}</p><p className="text-xs text-[var(--ink-soft)]">{block ? `Redigerer ${block.title}` : "Ser på økten"}</p></div></div>; })}{!collaborators.length && <p className="text-sm leading-6 text-[var(--ink-soft)]">Du er den eneste treneren her akkurat nå.</p>}</div></section><section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5"><h3 className="font-black">Generelle notater</h3><DebouncedTextarea className={`${textareaClass} mt-3 min-h-36`} value={session.notes} placeholder="Utstyr, spillertilgjengelighet eller påminnelser …" onSave={(value) => store.updateSession(sessionId, { notes: value })} /></section><Button variant="danger" className="w-full" onClick={() => { if (confirm("Vil du slette denne økten? Dette kan ikke angres.")) void store.deleteSession(sessionId).then(() => router.push("/sessions")); }}><Trash2 size={17} />Slett økt</Button></aside></div>
    <ExercisePicker open={Boolean(pickerBlock)} blockId={pickerBlock} onClose={() => setPickerBlock(null)} sessionId={sessionId} />
    <ExerciseDetail key={previewItem?.id ?? "none"} exercise={previewItem ? sessionItemDetailSubject(previewItem) : null} onClose={() => setPreviewItem(null)} />
    <Modal open={publishIssues.length > 0} onClose={() => setPublishIssues([])} title="Noen opplysninger mangler" description="Fyll ut dette før økten deles med laget."><ul className="grid gap-3">{publishIssues.map((issue) => <li key={issue} className="flex items-center gap-3 rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#fde1d5] text-xs text-[#9c3913]">!</span>{issue}</li>)}</ul><div className="mt-6 flex justify-end"><Button onClick={() => setPublishIssues([])}>Fortsett planleggingen</Button></div></Modal>
  </div></AppShell>;
}

/** One entry in the "Legg til bolk" menu. `accent` marks the one that asks a question rather than adding a named block. */
function BlockMenuItem({ icon: Icon, title, description, accent, onClick }: { icon: typeof LayoutGrid; title: string; description: string; accent?: boolean; onClick(): void }) {
  return <button type="button" onClick={onClick} className={cn("flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition", accent ? "hover:bg-[#fff0e8]" : "hover:bg-black/5")}>
    <Icon size={17} className={cn("mt-0.5 shrink-0", accent ? "text-[var(--orange)]" : "text-[var(--ink-soft)]")} />
    <span className="min-w-0"><span className={cn("block text-sm font-bold", accent && "text-[var(--orange)]")}>{title}</span><span className="mt-0.5 block text-xs leading-4 text-[var(--ink-soft)]">{description}</span></span>
  </button>;
}

function SortableBlockCard({ block, index, session, clock, active, collaborators, onActive, onPickExercise, onPreviewItem }: { block: SessionBlock; index: number; session: PlannedSession; clock: { startsAt: Date } | null; active: boolean; collaborators: ReturnType<typeof useSessionRealtime>["collaborators"]; onActive(): void; onPickExercise(): void; onPreviewItem(item: SessionItem): void }) {
  const store = useGrep(); const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id }); const itemSensors = useReorderSensors();
  function itemDragEnd(event: DragEndEvent) { if (!event.over || event.active.id === event.over.id) return; const oldIndex = block.items.findIndex((item) => item.id === event.active.id); const newIndex = block.items.findIndex((item) => item.id === event.over?.id); void store.reorderItems(session.id, block.id, arrayMove(block.items, oldIndex, newIndex).map((item) => item.id)); }
  const stations = isStationBlock(block);
  const rotation = stationRotation(block);
  function setRotation(minutes: number) { void store.updateBlock(session.id, block.id, { rotationMinutes: Math.min(MAX_ROTATION_MINUTES, Math.max(MIN_ROTATION_MINUTES, minutes)) }); }
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .6 : 1 }} onPointerDown={onActive} className={cn("rounded-[24px] border bg-[var(--surface)] shadow-[0_7px_24px_rgba(16,32,29,.04)] transition", active ? "border-[#9bb8ad] ring-4 ring-[#bfe0cf]/35" : "border-[var(--line)]")}><header className="flex items-center gap-3 border-b border-[var(--line)] p-4 sm:px-5"><button {...attributes} {...listeners} className="grid h-9 w-8 shrink-0 touch-manipulation select-none place-items-center rounded-lg text-[var(--ink-soft)] [-webkit-touch-callout:none] hover:bg-black/5" aria-label={`Dra ${block.title}`}><GripVertical size={19} /></button>{clock ? <span className="shrink-0 rounded-xl bg-[var(--paper-deep)] px-2 py-1.5 text-xs font-black tabular-nums" title="Beregnet ut fra starttid og lengden på bolkene foran">{clockTime(clock.startsAt)}</span> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-black">{index + 1}</span>}{blockGlyph(block)}<AutoField className="min-w-0 flex-1 text-lg font-black" value={block.title} onSave={(value) => store.updateBlock(session.id, block.id, { title: value })} ariaLabel="Tittel på bolken" />{collaborators.map((person) => <Avatar key={person.id} name={person.fullName} initials={person.initials} color={person.color} size="sm" />)}<span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-xs font-black">{blockDuration(block)} min</span><Button variant="ghost" size="sm" className="px-2" aria-label={`Slett ${block.title}`} onClick={() => { if (confirm(`Vil du slette ${block.title}?`)) void store.deleteBlock(session.id, block.id); }}><Trash2 size={16} /></Button></header><div className="p-3 sm:p-4">{stations && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--paper)] px-3 py-2.5">
    <label className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[.11em] text-[var(--ink-soft)]"><span>Rotasjon</span>
      <span className="inline-flex items-center rounded-xl border border-[var(--line)] bg-white p-0.5">
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-black/5 disabled:opacity-40" onClick={() => setRotation(rotation - 1)} disabled={rotation <= MIN_ROTATION_MINUTES} aria-label="Kortere rotasjon">−</button>
        <input type="number" min={MIN_ROTATION_MINUTES} max={MAX_ROTATION_MINUTES} value={rotation} onChange={(event) => setRotation(Number(event.target.value))} aria-label={`Rotasjon i ${block.title}`} className="h-8 w-11 border-0 bg-transparent text-center text-sm font-black normal-case tracking-normal text-[var(--ink)] outline-none" />
        <span className="pr-1 text-xs font-bold normal-case tracking-normal text-[var(--ink-soft)]">min</span>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-black/5 disabled:opacity-40" onClick={() => setRotation(rotation + 1)} disabled={rotation >= MAX_ROTATION_MINUTES} aria-label="Lengre rotasjon">+</button>
      </span>
    </label>
    <p className="text-xs font-bold text-[var(--ink-soft)]">{block.items.length < MIN_STATIONS ? `Legg til minst ${MIN_STATIONS} stasjoner` : `${block.items.length} stasjoner × ${rotation} min = ${blockDuration(block)} min`}</p>
  </div>}<label className="mb-3 block rounded-2xl bg-[var(--paper)] p-3"><span className="text-[10px] font-black uppercase tracking-[.11em] text-[var(--ink-soft)]">Notat for bolken</span><DebouncedTextarea className="mt-1 min-h-16 w-full resize-y rounded-xl border border-transparent bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-[#8b9692] focus:border-[var(--orange)]" value={block.notes} placeholder={stations ? "Hvordan roterer laget, og hvem blåser i fløyta …" : "Utstyr, organisering eller fokus for denne bolken …"} onSave={(value) => store.updateBlock(session.id, block.id, { notes: value })} /></label>{block.items.length ? <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={itemDragEnd}><SortableContext items={block.items.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="grid gap-2.5">{block.items.map((item, itemIndex) => <SortableItemCard key={item.id} item={item} block={block} session={session} station={stations ? itemIndex + 1 : undefined} onPreview={() => onPreviewItem(item)} />)}</div></SortableContext></DndContext> : <p className="py-6 text-center text-sm text-[var(--ink-soft)]">{stations ? "Ingen stasjoner i denne bolken ennå." : "Ingen aktiviteter i denne bolken ennå."}</p>}<div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" onClick={onPickExercise}><Library size={16} />{stations ? "Legg til stasjon" : "Legg til øvelse"}</Button><Button variant="ghost" size="sm" onClick={() => void store.addCustomItem(session.id, block.id)}><Plus size={16} />{stations ? "Egendefinert stasjon" : "Egendefinert aktivitet"}</Button></div></div></article>;
}

/**
 * One row in a block. `station` is the number this activity carries when the
 * block runs its items in parallel: the minutes are then the block's rotation,
 * the same for every station, so the row drops its own duration field rather
 * than offering a number the database would overwrite.
 */
function SortableItemCard({ item, block, session, station, onPreview }: { item: SessionItem; block: SessionBlock; session: PlannedSession; station?: number; onPreview(): void }) {
  const store = useGrep(); const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  // A linked exercise shows the library's title, so renaming it here would be
  // overwritten on the next render. Only custom items — and items whose exercise
  // has been archived or deleted — keep an editable title.
  const fromLibrary = item.kind === "exercise" && Boolean(item.exerciseId) && store.exercises.some((exercise) => exercise.id === item.exerciseId);
  // Who runs this activity, picked from the session's own team rather than the
  // team currently selected in the sidebar — a coach can open a plan belonging
  // to either of their teams.
  const members = store.teams.find((team) => team.id === session.teamId)?.members ?? [];
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .65 : 1 }} className={cn("grid items-start gap-2 rounded-2xl border border-[var(--line)] bg-white p-2.5", station ? "grid-cols-[28px_44px_minmax(0,1fr)_34px] sm:grid-cols-[32px_54px_minmax(0,1fr)_36px]" : "grid-cols-[28px_44px_minmax(0,1fr)_66px_34px] sm:grid-cols-[32px_54px_minmax(0,1fr)_84px_36px]")}><button {...attributes} {...listeners} className="grid h-10 touch-manipulation select-none place-items-center text-[var(--ink-soft)] [-webkit-touch-callout:none]" aria-label={`Dra ${item.title}`}><GripVertical size={17} /></button><button type="button" onClick={onPreview} aria-label={`Vis ${item.title}`} className="group/media relative h-11 w-11 shrink-0 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)] sm:h-12 sm:w-12">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <ItemThumbnailPlaceholder item={item} />}<span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover/media:opacity-100 group-focus-visible/media:opacity-100"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/90"><Eye size={14} /></span></span>{station && <span className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-br-lg bg-[var(--ink)] text-[10px] font-black text-white">{station}</span>}</button><div className="min-w-0">{fromLibrary ? <p className="flex h-8 items-center truncate px-1 text-sm font-black" title="Tittelen hentes fra øvelsesbanken">{item.title}</p> : <DebouncedInput className="h-8 w-full rounded-lg border-0 bg-transparent px-1 text-sm font-black outline-none focus:bg-[var(--paper)]" value={item.title} onSave={(value) => store.updateItem(session.id, block.id, item.id, { title: value })} />}<DebouncedInput className="h-7 w-full truncate rounded-lg border-0 bg-transparent px-1 text-xs text-[var(--ink-soft)] outline-none focus:bg-[var(--paper)]" value={item.coachingNotes} placeholder="Legg til trenernotat …" onSave={(value) => store.updateItem(session.id, block.id, item.id, { coachingNotes: value })} /><CoachPicker item={item} members={members} onChange={(coachId) => void store.updateItem(session.id, block.id, item.id, { assignedCoachId: coachId })} /></div>{station ? null : <label className="relative"><input type="number" min="1" max="180" className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-2 pr-7 text-right text-sm font-black outline-none" value={item.durationMinutes} onChange={(event) => void store.updateItem(session.id, block.id, item.id, { durationMinutes: Math.max(1, Number(event.target.value)) })} aria-label={`Varighet for ${item.title}`} /><span className="pointer-events-none absolute right-2 top-3 text-[10px] font-bold text-[var(--ink-soft)]">m</span></label>}<Button variant="ghost" size="sm" className="px-2" aria-label={station ? `Fjern stasjon ${station}` : `Fjern ${item.title}`} onClick={() => void store.deleteItem(session.id, block.id, item.id)}><Trash2 size={15} /></Button></div>;
}

/**
 * Who runs this activity. The control has to read as a button: an unassigned
 * item shows a dashed call to action, an assigned one a solid chip with the
 * coach's avatar and a clear-out entry in the list. The native <select> is
 * kept — laid invisibly over the chip — so keyboard, screen readers and the
 * mobile wheel picker all keep working without a custom menu.
 */
function CoachPicker({ item, members, onChange }: { item: SessionItem; members: readonly Profile[]; onChange(coachId: string | null): void }) {
  const coach = assignedCoach(item, members);
  return <span className={cn("relative mt-1 inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pl-1 pr-2 text-xs font-bold transition focus-within:ring-[3px] focus-within:ring-[rgba(240,100,46,.35)]", coach ? "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--ink)]" : "border-dashed border-[#e2b39a] bg-[#fff4ee] text-[#9c3913] hover:border-[var(--orange)] hover:bg-[#fde1d5]")}>
    {coach ? <Avatar name={coach.fullName} initials={coach.initials} color={coach.color} size="sm" /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#fde1d5]"><UserRoundPlus size={13} /></span>}
    <span className="truncate">{coach ? coach.fullName : "Sett ansvarlig trener"}</span>
    <ChevronDown size={14} className="shrink-0 opacity-55" />
    <select className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" value={item.assignedCoachId ?? ""} onChange={(event) => onChange(event.target.value || null)} aria-label={`Ansvarlig trener for ${item.title}`}><option value="">Ingen ansvarlig trener</option>{coachAssignmentOptions(item, members).map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
  </span>;
}

function ExercisePicker({ open, blockId, sessionId, onClose }: { open: boolean; blockId: string | null; sessionId: string; onClose(): void }) {
  const { exercises, addExerciseItem } = useGrep(); const [query, setQuery] = useState(""); const [categories, setCategories] = useState<ExerciseCategory[]>([]); const [ageGroups, setAgeGroups] = useState<ExerciseAgeGroup[]>([]); const [preview, setPreview] = useState<Exercise | null>(null);
  // Curating favourites and samlinger in the library is worth nothing if they
  // are invisible here, which is where a plan is actually built.
  const [shortlist, setShortlist] = useState<ExerciseShortlist | null>(null);
  const shortlistIds = useShortlistIds(shortlist);
  const filter = useMemo(() => ({ query, categories, ageGroups, shortlistIds }), [query, categories, ageGroups, shortlistIds]);
  const filtered = useMemo(() => filterExercises(exercises, filter), [exercises, filter]);
  const counts = useMemo(() => countExerciseFacets(exercises, filter), [exercises, filter]);
  function resetFilters() { setQuery(""); setCategories([]); setAgeGroups([]); setShortlist(null); }
  // A samling is somebody's own list, and slicing it by topic and age on top
  // answers a question nobody asked — three exercises do not need narrowing.
  // So picking one drops the other axes and switches them off until it is put
  // down again; the search box stays, because finding a name inside a samling
  // is the one narrowing that still makes sense.
  function chooseShortlist(next: ExerciseShortlist | null) { setShortlist(next); setCategories([]); setAgeGroups([]); }
  function close() { setPreview(null); onClose(); }
  return <><Modal open={open} onClose={close} title="Legg til fra øvelsesbanken" description="Øvelsesdetaljene kopieres inn i økten, slik at planen ikke endres senere." size="lg"><div className="grid gap-3"><div className="relative"><Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk etter øvelser …" aria-label="Søk etter øvelser" autoFocus /></div><ShortlistChips value={shortlist} onChange={chooseShortlist} /><ExerciseCategoryFilter value={categories} onChange={setCategories} counts={counts} disabled={shortlist !== null} /><ExerciseAgeGroupFilter value={ageGroups} onChange={setAgeGroups} counts={counts} disabled={shortlist !== null} /><p className="text-xs font-semibold text-[var(--ink-soft)]">{filtered.length} øvelser</p></div>{filtered.length ? <div className="mt-4 grid max-h-[55vh] gap-3 overflow-y-auto pr-1 thin-scrollbar sm:grid-cols-2">{filtered.map((exercise) => <div key={exercise.id} className="group flex gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 text-left transition focus-within:border-[var(--ink)] hover:border-[var(--ink)]"><button type="button" className="group/media relative h-20 w-24 shrink-0 overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]" aria-label={`Vis detaljer for ${exercise.name}`} onClick={() => setPreview(exercise)}><ExerciseThumbnail exercise={exercise} className="h-full w-full" /><span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover/media:opacity-100 group-focus-visible/media:opacity-100"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/90"><Eye size={15} /></span></span></button><button type="button" className="min-w-0 flex-1 text-left" aria-label={`Legg ${exercise.name} til i bolken`} onClick={() => { if (blockId) void addExerciseItem(sessionId, blockId, exercise); close(); }}><span className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--orange)]">{exercise.category}</span><strong className="mt-1 block text-sm">{exercise.name}</strong><span className="clamp-2 mt-1 text-xs leading-5 text-[var(--ink-soft)]">{exercise.description}</span></button></div>)}</div> : <div className="mt-5 rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><p className="font-black">Fant ingen øvelser</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Prøv en annen kategori, aldersgruppe eller et annet søkeord.</p><Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>Nullstill filtre</Button></div>}</Modal>
    <ExerciseDetail key={preview?.id ?? "none"} exercise={open ? preview : null} onClose={() => setPreview(null)} /></>;
}

function AutoField({ value, onSave, className, ariaLabel }: { value: string; onSave(value: string): Promise<void>; className?: string; ariaLabel: string }) {
  return <DebouncedInput value={value} onSave={onSave} aria-label={ariaLabel} className={cn("w-full rounded-lg border-0 bg-transparent px-1 outline-none focus:bg-[var(--paper)]", className)} />;
}
function DebouncedInput({ value, onSave, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onSave(value: string): Promise<void> }) {
  const [local, setLocal] = useState(value); const saveRef = useRef(onSave);
  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => { const timer = window.setTimeout(() => setLocal(value), 0); return () => window.clearTimeout(timer); }, [value]);
  useEffect(() => { if (local === value) return; const timer = window.setTimeout(() => void saveRef.current(local), 550); return () => window.clearTimeout(timer); }, [local, value]);
  return <input {...props} value={local} onChange={(event) => setLocal(event.target.value)} />;
}
function DebouncedTextarea({ value, onSave, ...props }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & { value: string; onSave(value: string): Promise<void> }) {
  const [local, setLocal] = useState(value); const saveRef = useRef(onSave);
  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => { const timer = window.setTimeout(() => setLocal(value), 0); return () => window.clearTimeout(timer); }, [value]);
  useEffect(() => { if (local === value) return; const timer = window.setTimeout(() => void saveRef.current(local), 550); return () => window.clearTimeout(timer); }, [local, value]);
  return <textarea {...props} value={local} onChange={(event) => setLocal(event.target.value)} />;
}
