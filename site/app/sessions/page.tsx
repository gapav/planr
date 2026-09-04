"use client";

import { CalendarDays, Check, ChevronDown, Clock3, LayoutList, MapPin, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HelpTip } from "@/components/help-tip";
import { useGrep } from "@/components/app-provider";
import { TeamCrest } from "@/components/team-crest";
import { Avatar, Button, EmptyState, Modal, Tag } from "@/components/ui";
import { deriveSessionTab, groupSessionsByMonth, isNearTerm, relativeDayLabel, sessionDuration } from "@/lib/session";
import type { PlannedSession, SessionTab } from "@/lib/types";
import { cn, minutesLabel, sessionDateParts } from "@/lib/utils";

const tabs: Array<{ id: SessionTab; label: string }> = [{ id: "upcoming", label: "Kommende" }, { id: "drafts", label: "Utkast" }, { id: "past", label: "Gjennomførte" }];

export default function SessionsPage() {
  const { sessions, currentTeam, createSession, deleteSession } = useGrep(); const [tab, setTab] = useState<SessionTab>("upcoming"); const [creating, setCreating] = useState(false); const [pendingDelete, setPendingDelete] = useState<PlannedSession | null>(null); const [deleting, setDeleting] = useState(false); const router = useRouter();
  const current = useMemo(() => sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === tab).sort((a, b) => tab === "drafts" ? b.updatedAt.localeCompare(a.updatedAt) : tab === "upcoming" ? (a.startsAt ?? "").localeCompare(b.startsAt ?? "") : (b.startsAt ?? "").localeCompare(a.startsAt ?? "")), [sessions, currentTeam, tab]);
  const counts = useMemo(() => tabs.reduce((acc, entry) => { acc[entry.id] = sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === entry.id).length; return acc; }, {} as Record<SessionTab, number>), [sessions, currentTeam]);
  // The nearest session is lifted out of its month so the one plan being
  // prepared for is not one card among ten identical ones.
  const hero = tab === "upcoming" ? current[0] : undefined; const listed = hero ? current.slice(1) : current;
  async function startSession() { setCreating(true); try { const id = await createSession(); router.push(`/sessions/${id}/edit`); } finally { setCreating(false); } }
  // A failed delete rolls itself back in the provider and surfaces a notice, so
  // the dialog closes either way.
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); try { await deleteSession(pendingDelete.id); } catch { /* notice is shown by the provider */ } finally { setDeleting(false); setPendingDelete(null); } }
  if (!currentTeam) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<CalendarDays size={22} />} title="Opprett ditt første lag" body="Øktene tilhører et lag, slik at de riktige trenerne kan se og redigere dem." action={<Link href="/team" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--orange)] px-4 text-sm font-bold text-white">Opprett et lag</Link>} /></div></AppShell>;
  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10"><header className="flex items-start gap-4"><TeamCrest team={currentTeam} size="lg" className="mt-1" /><div><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">{currentTeam?.shortName}</p><div className="mt-2 flex items-center gap-2.5"><h1 className="text-4xl font-black tracking-[-.055em] sm:text-5xl">Øktkalender</h1><HelpTip topic="sessions-calendar" /></div><p className="mt-3 text-[var(--ink-soft)]">Alle øktplaner, fra første idé til siste heiarop.</p></div></header>
    <TabSelect tab={tab} onSelect={setTab} counts={counts} />
    {current.length ? (tab === "drafts"
      // Drafts sort by when they were last touched, so a calendar heading would
      // group them by a date the order does not follow.
      ? <ul className="mt-7 flex flex-col gap-2.5">{current.map((session) => <SessionRow key={session.id} session={session} tab={tab} onDelete={() => setPendingDelete(session)} />)}</ul>
      : <div className="mt-7 flex flex-col gap-6">
        {hero && <section><h2 className="mb-2.5 text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">Neste økt</h2><ul><SessionRow session={hero} tab={tab} hero onDelete={() => setPendingDelete(hero)} /></ul></section>}
        {groupSessionsByMonth(listed).map((group) => <section key={group.key}>
          <h2 className="sticky top-16 z-10 -mx-1 rounded-lg bg-[var(--paper)]/90 px-1 py-2 text-xs font-black uppercase tracking-[.16em] text-[var(--ink-soft)] backdrop-blur-sm lg:top-0">{group.label}<span className="opacity-60">{" · "}{group.sessions.length} {group.sessions.length === 1 ? "økt" : "økter"}</span></h2>
          <ul className="mt-1.5 flex flex-col gap-2.5">{group.sessions.map((session) => tab === "upcoming" && isNearTerm(session)
            ? <SessionRow key={session.id} session={session} tab={tab} onDelete={() => setPendingDelete(session)} />
            : <CompactSessionRow key={session.id} session={session} onDelete={() => setPendingDelete(session)} />)}</ul>
        </section>)}
      </div>) : <div className="mt-7"><EmptyState icon={tab === "drafts" ? <Sparkles size={22} /> : <CalendarDays size={22} />} title={tab === "drafts" ? "Ingen økter under planlegging" : tab === "upcoming" ? "Ingen planlagte økter ennå" : "Ingen gjennomførte økter"} body={tab === "drafts" ? "Start en øktplan og inviter trenerteamet til å bidra." : tab === "upcoming" ? "Publiser et utkast, så vises det automatisk her." : "Gjennomførte økter samles her for senere bruk."} /></div>}
    <CreateSessionCard onCreate={() => void startSession()} creating={creating} />
    <Modal open={Boolean(pendingDelete)} onClose={() => { if (!deleting) setPendingDelete(null); }} title="Vil du slette denne økten?" description="Planen, alle bolkene og aktivitetene blir slettet for hele laget. Dette kan ikke angres." size="sm">
      <p className="rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-bold">{pendingDelete?.title}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Behold økten</Button><Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}><Trash2 size={17} />{deleting ? "Sletter…" : "Slett økt"}</Button></div>
    </Modal>
  </div></AppShell>;
}

// Creating a session is the only action here that is not a session, so it takes
// the shape of the rows it sits under rather than a header button: at the end of
// the list, separated and orange, it leaves the top of a phone screen to the
// next session — the thing the coach actually came to look at.
function CreateSessionCard({ onCreate, creating }: { onCreate(): void; creating: boolean }) {
  return <button type="button" onClick={onCreate} disabled={creating} className="mt-6 flex min-h-16 w-full items-center justify-center gap-2.5 rounded-2xl border border-[#efc7b1] bg-[#fdece3] px-4 text-[15px] font-black tracking-[-.015em] text-[#9c3913] shadow-[0_6px_20px_rgba(16,32,29,.03)] transition hover:-translate-y-0.5 hover:border-[var(--orange)] hover:bg-[#fbe1d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0">
    <Plus size={19} />{creating ? "Oppretter…" : "Opprett økt"}
  </button>;
}

// One dropdown instead of a three-way segmented control: the labels are long
// enough that the strip had to scroll sideways on a phone, and the tab you are
// on is the only one worth showing at rest.
function TabSelect({ tab, onSelect, counts }: { tab: SessionTab; onSelect(tab: SessionTab): void; counts: Record<SessionTab, number> }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0];
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={ref} className="relative mt-10 w-full sm:w-72">
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={cn("inline-flex min-h-12 w-full items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 text-left text-[15px] font-bold text-[var(--ink)] shadow-sm transition hover:border-[#aaa69b]", open && "border-[var(--orange)]")}>
      <span className="flex-1 truncate">{active.label}</span>
      <span className="rounded-full bg-[var(--ink)] px-2 py-0.5 text-[10px] text-white">{counts[active.id]}</span>
      <ChevronDown size={17} className={cn("shrink-0 text-[var(--ink-soft)] transition", open && "rotate-180")} />
    </button>
    {open && <div role="listbox" className="absolute left-0 top-[calc(100%+6px)] z-30 w-full rounded-2xl border border-[var(--line)] bg-white p-1.5 shadow-xl">
      {tabs.map((entry) => <button key={entry.id} type="button" role="option" aria-selected={entry.id === tab} onClick={() => { onSelect(entry.id); setOpen(false); }} className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold text-[var(--ink-soft)] transition hover:bg-[var(--paper)]", entry.id === tab && "bg-[var(--paper)] text-[var(--ink)]")}>
        <Check size={16} className={cn("shrink-0 text-[var(--orange)]", entry.id !== tab && "opacity-0")} />
        <span className="flex-1 truncate">{entry.label}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px]", entry.id === tab ? "bg-[var(--ink)] text-white" : "bg-black/5")}>{counts[entry.id]}</span>
      </button>)}
    </div>}
  </div>;
}

function SessionRow({ session, tab, hero = false, onDelete }: { session: PlannedSession; tab: SessionTab; hero?: boolean; onDelete(): void }) {
  const { currentTeam, user } = useGrep(); const built = sessionDuration(session); const progress = session.plannedDurationMinutes ? Math.min(100, Math.round((built / session.plannedDurationMinutes) * 100)) : 0; const updater = currentTeam?.members.find((member) => member.id === session.updatedBy) ?? currentTeam?.members[0];
  const inProgress = session.status === "in_progress"; const date = sessionDateParts(session.startsAt); const relative = relativeDayLabel(session.startsAt); const [menuOpen, setMenuOpen] = useState(false);
  // In-progress and completed plans are locked in the database, so the menu
  // drops the edit entry rather than offering a screen that would bounce back.
  const locked = inProgress || session.status === "completed";
  // Every row in a tab shares that tab's status, so only the one status that
  // does set a row apart is worth a chip. Same for the coach: it is the
  // signed-in one on every row until a team has more than one.
  const otherUpdater = updater && updater.id !== user?.id ? updater : null;
  const blockTitles = hero ? session.blocks.map((block) => block.title.trim()).filter(Boolean) : [];
  // The whole card opens the plan — Start and Rediger live in the plan view, so
  // the row carries no action but the menu, which opts back in to pointer
  // events. An open menu has to outrank the rows stacked after it.
  return <li className={cn("group relative rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_6px_20px_rgba(16,32,29,.03)] transition hover:border-[#b7b2a6] hover:shadow-[var(--shadow)] sm:p-5", hero && "border-[#e9b79c] shadow-[0_10px_30px_rgba(240,100,46,.10)] hover:border-[var(--orange)]", menuOpen && "z-20")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--orange)]" />
    <div className="pointer-events-none relative flex flex-wrap items-start gap-x-4 gap-y-3.5 sm:flex-nowrap sm:items-center sm:gap-5">
      <div className={cn("grid h-14 w-14 shrink-0 place-content-center justify-items-center rounded-2xl border border-[var(--line)] text-center sm:h-16 sm:w-16", inProgress ? "border-transparent bg-[var(--orange)] text-white" : "bg-[var(--paper-deep)]")}>
        {date ? <><span className={cn("text-[10px] font-black uppercase tracking-[.14em]", inProgress ? "text-white/70" : "text-[var(--ink-soft)]")}>{date.weekday}</span><span className="text-2xl font-black leading-none tracking-[-.05em]">{date.day}</span><span className={cn("text-[10px] font-bold uppercase tracking-[.1em]", inProgress ? "text-white/70" : "text-[var(--ink-soft)]")}>{date.month}</span></> : <span className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--ink-soft)]">Ingen dato</span>}
      </div>
      <div className="min-w-0 flex-1 basis-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h3 className="truncate text-lg font-black tracking-[-.035em] transition group-hover:text-[var(--orange)] sm:text-xl">{session.title}</h3>{inProgress && <Tag tone="orange">Pågår</Tag>}{relative && <Tag tone={relative === "I dag" && !inProgress ? "orange" : "neutral"}>{relative}</Tag>}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-sm text-[var(--ink-soft)] sm:gap-x-4">
          <span className="flex items-center gap-1.5"><Clock3 size={15} />{date ? `${date.time} · ${minutesLabel(session.plannedDurationMinutes)}` : `${minutesLabel(session.plannedDurationMinutes)} planlagt`}</span>
          <span className="flex min-w-0 items-center gap-1.5"><MapPin size={15} /><span className="truncate">{session.venue || "Sted ikke angitt"}</span></span>
          <span className="flex items-center gap-1.5"><LayoutList size={15} />{session.blocks.length} {session.blocks.length === 1 ? "bolk" : "bolker"}</span>
          {otherUpdater && <span className="flex items-center gap-1.5"><Avatar name={otherUpdater.fullName} initials={otherUpdater.initials} color={otherUpdater.color} size="sm" /><span className="truncate">{otherUpdater.fullName}</span></span>}
        </div>
        {blockTitles.length > 0 && <p className="mt-2.5 truncate text-sm font-semibold text-[var(--ink-soft)]">{blockTitles.join(" · ")}</p>}
        {tab === "drafts" && <div className="mt-3 flex items-center gap-3"><div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full bg-[var(--orange)] transition-all" style={{ width: `${progress}%` }} /></div><span className="text-xs font-bold text-[var(--ink-soft)]">{built} av {session.plannedDurationMinutes} min planlagt</span></div>}
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center justify-end">
        <RowMenu open={menuOpen} onOpenChange={setMenuOpen} title={session.title} editHref={locked ? null : `/sessions/${session.id}/edit`} deleteDisabled={inProgress} onDelete={onDelete} />
      </div>
    </div>
  </li>;
}

// Sessions further out than the coming week, and every finished one, are things
// you read rather than act on: the same card, one line tall, carrying the date
// and the title only. Everything else is one tap away in the plan itself.
function CompactSessionRow({ session, onDelete }: { session: PlannedSession; onDelete(): void }) {
  const date = sessionDateParts(session.startsAt); const [menuOpen, setMenuOpen] = useState(false); const locked = session.status === "in_progress" || session.status === "completed";
  return <li className={cn("group relative rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_6px_20px_rgba(16,32,29,.03)] transition hover:border-[#b7b2a6] hover:shadow-[var(--shadow)]", menuOpen && "z-20 border-[#b7b2a6]")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--orange)]" />
    <div className="pointer-events-none relative flex items-center gap-3 py-1 pl-4 pr-2">
      <span className="w-[4.25rem] shrink-0 text-xs font-black uppercase tracking-[.1em] text-[var(--ink-soft)]">{date ? `${date.weekday} ${date.day}` : "Uten dato"}</span>
      <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-.015em] transition group-hover:text-[var(--orange)]">{session.title}</h3>
      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
        <RowMenu open={menuOpen} onOpenChange={setMenuOpen} title={session.title} editHref={locked ? null : `/sessions/${session.id}/edit`} deleteDisabled={session.status === "in_progress"} onDelete={onDelete} />
      </div>
    </div>
  </li>;
}

// Editing and deleting sit behind a menu so a thumb reaching for the card
// itself cannot land on either. Pointerdown and Escape close it; the trigger
// toggles.
function RowMenu({ open, onOpenChange, title, editHref, deleteDisabled, onDelete }: { open: boolean; onOpenChange(open: boolean): void; title: string; editHref: string | null; deleteDisabled: boolean; onDelete(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!ref.current?.contains(event.target as Node)) onOpenChange(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open, onOpenChange]);
  return <div ref={ref} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Flere valg for ${title}`} onClick={() => onOpenChange(!open)} className={cn("grid h-11 w-11 place-items-center rounded-xl border border-transparent text-[var(--ink-soft)] transition hover:border-[var(--line)] hover:bg-[var(--paper)] hover:text-[var(--ink)]", open && "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]")}><MoreHorizontal size={19} /></button>
    {open && <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-xl border border-[var(--line)] bg-white p-1.5 text-sm font-semibold shadow-xl">
      {editHref && <><Link href={editHref} role="menuitem" autoFocus onClick={() => onOpenChange(false)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[var(--ink)] transition hover:bg-[var(--paper)]"><Pencil size={16} />Rediger</Link>
      <div className="my-1.5 h-px bg-[var(--line)]" /></>}
      <button type="button" role="menuitem" autoFocus={!editHref} disabled={deleteDisabled} onClick={() => { onOpenChange(false); onDelete(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[var(--danger)] transition enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"><Trash2 size={16} />Slett økt</button>
      {deleteDisabled && <p className="px-3 pb-1 pt-1.5 text-xs font-normal leading-5 text-[var(--ink-soft)]">Avslutt økten før den kan slettes.</p>}
    </div>}
  </div>;
}
