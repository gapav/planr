"use client";

import { CalendarDays, CirclePlay, Clock3, Eye, LayoutList, MapPin, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { Avatar, Button, EmptyState, Modal, Tag } from "@/components/ui";
import { deriveSessionTab, sessionDuration } from "@/lib/session";
import type { PlannedSession, SessionTab } from "@/lib/types";
import { cn, minutesLabel, sessionDateParts } from "@/lib/utils";

const tabs: Array<{ id: SessionTab; label: string }> = [{ id: "upcoming", label: "Upcoming" }, { id: "drafts", label: "Drafts" }, { id: "past", label: "Past" }];

export default function SessionsPage() {
  const { sessions, currentTeam, createSession, deleteSession } = useGrep(); const [tab, setTab] = useState<SessionTab>("upcoming"); const [creating, setCreating] = useState(false); const [pendingDelete, setPendingDelete] = useState<PlannedSession | null>(null); const [deleting, setDeleting] = useState(false); const router = useRouter();
  const current = useMemo(() => sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === tab).sort((a, b) => tab === "drafts" ? b.updatedAt.localeCompare(a.updatedAt) : tab === "upcoming" ? (a.startsAt ?? "").localeCompare(b.startsAt ?? "") : (b.startsAt ?? "").localeCompare(a.startsAt ?? "")), [sessions, currentTeam, tab]);
  async function startSession() { setCreating(true); try { const id = await createSession(); router.push(`/sessions/${id}`); } finally { setCreating(false); } }
  // A failed delete rolls itself back in the provider and surfaces a notice, so
  // the dialog closes either way.
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); try { await deleteSession(pendingDelete.id); } catch { /* notice is shown by the provider */ } finally { setDeleting(false); setPendingDelete(null); } }
  if (!currentTeam) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<CalendarDays size={22} />} title="Create your first team" body="Sessions belong to a team so the right coaches can see and edit them." action={<Link href="/team" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--orange)] px-4 text-sm font-bold text-white">Set up a team</Link>} /></div></AppShell>;
  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">{currentTeam?.shortName}</p><h1 className="mt-2 text-4xl font-black tracking-[-.055em] sm:text-5xl">Session library</h1><p className="mt-3 text-[var(--ink-soft)]">Every plan from first thought to final whistle.</p></div><Button size="lg" onClick={() => void startSession()} disabled={creating}><Plus size={19} />{creating ? "Creating…" : "Create session"}</Button></header>
    <div className="mt-10 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)] p-1.5 sm:w-fit">{tabs.map((entry) => { const count = sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === entry.id).length; return <button key={entry.id} onClick={() => setTab(entry.id)} className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold text-[var(--ink-soft)] transition", tab === entry.id && "bg-[var(--surface)] text-[var(--ink)] shadow-sm")}>{entry.label}<span className={cn("rounded-full px-2 py-0.5 text-[10px]", tab === entry.id ? "bg-[var(--ink)] text-white" : "bg-black/5")}>{count}</span></button>; })}</div>
    {current.length ? <ul className="mt-7 grid gap-2.5">{current.map((session) => <SessionRow key={session.id} session={session} tab={tab} onDelete={() => setPendingDelete(session)} />)}</ul> : <div className="mt-7"><EmptyState icon={tab === "drafts" ? <Sparkles size={22} /> : <CalendarDays size={22} />} title={tab === "drafts" ? "No sessions being planned" : tab === "upcoming" ? "Nothing scheduled yet" : "No past sessions"} body={tab === "drafts" ? "Start a plan and invite your coaching team into the details." : tab === "upcoming" ? "Publish a draft and it will appear here automatically." : "Completed sessions will collect here for reference."} action={tab !== "past" ? <Button onClick={() => void startSession()}><Plus size={17} />Create session</Button> : undefined} /></div>}
    <Modal open={Boolean(pendingDelete)} onClose={() => { if (!deleting) setPendingDelete(null); }} title="Delete this session?" description="The plan, its blocks and every activity inside it are removed for the whole team. This cannot be undone." size="sm">
      <p className="rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-bold">{pendingDelete?.title}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Keep session</Button><Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}><Trash2 size={17} />{deleting ? "Deleting…" : "Delete session"}</Button></div>
    </Modal>
  </div></AppShell>;
}

function SessionRow({ session, tab, onDelete }: { session: PlannedSession; tab: SessionTab; onDelete(): void }) {
  const { currentTeam } = useGrep(); const built = sessionDuration(session); const progress = session.plannedDurationMinutes ? Math.min(100, Math.round((built / session.plannedDurationMinutes) * 100)) : 0; const updater = currentTeam?.members.find((member) => member.id === session.updatedBy) ?? currentTeam?.members[0];
  const inProgress = session.status === "in_progress"; const date = sessionDateParts(session.startsAt);
  // In-progress and completed plans are locked in the database, so the row
  // offers a read-only view instead of pretending it can be edited.
  const locked = inProgress || session.status === "completed";
  return <li className="group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_6px_20px_rgba(16,32,29,.03)] transition hover:border-[#b7b2a6] hover:shadow-[var(--shadow)] sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className={cn("grid h-16 w-16 shrink-0 place-content-center justify-items-center rounded-2xl border border-[var(--line)] text-center", inProgress ? "border-transparent bg-[var(--orange)] text-white" : "bg-[var(--paper-deep)]")}>
        {date ? <><span className={cn("text-[10px] font-black uppercase tracking-[.14em]", inProgress ? "text-white/70" : "text-[var(--ink-soft)]")}>{date.weekday}</span><span className="text-2xl font-black leading-none tracking-[-.05em]">{date.day}</span><span className={cn("text-[10px] font-bold uppercase tracking-[.1em]", inProgress ? "text-white/70" : "text-[var(--ink-soft)]")}>{date.month}</span></> : <span className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--ink-soft)]">No date</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><Link href={`/sessions/${session.id}`} className="truncate text-xl font-black tracking-[-.035em] transition hover:text-[var(--orange)]">{session.title}</Link><Tag tone={inProgress ? "orange" : tab === "drafts" ? "orange" : tab === "upcoming" ? "green" : "neutral"}>{inProgress ? "In progress" : tab === "drafts" ? "Draft" : tab === "upcoming" ? "Scheduled" : "Completed"}</Tag></div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--ink-soft)]">
          <span className="flex items-center gap-1.5"><Clock3 size={15} />{date ? `${date.time} · ${minutesLabel(session.plannedDurationMinutes)}` : `${minutesLabel(session.plannedDurationMinutes)} planned`}</span>
          <span className="flex min-w-0 items-center gap-1.5"><MapPin size={15} /><span className="truncate">{session.venue || "Venue not set"}</span></span>
          <span className="flex items-center gap-1.5"><LayoutList size={15} />{session.blocks.length} {session.blocks.length === 1 ? "block" : "blocks"}</span>
          {updater && <span className="flex items-center gap-1.5"><Avatar name={updater.fullName} initials={updater.initials} color={updater.color} size="sm" /><span className="truncate">{updater.fullName}</span></span>}
        </div>
        {tab === "drafts" && <div className="mt-3 flex items-center gap-3"><div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full bg-[var(--orange)] transition-all" style={{ width: `${progress}%` }} /></div><span className="text-xs font-bold text-[var(--ink-soft)]">{built} of {session.plannedDurationMinutes} min built</span></div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {tab === "upcoming" && <Link href={`/sessions/${session.id}/live`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--orange)] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(240,100,46,.22)] transition hover:-translate-y-0.5 hover:bg-[var(--orange-dark)]"><CirclePlay size={17} />{inProgress ? "Continue" : "Start"}</Link>}
        <Link href={`/sessions/${session.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:border-[var(--ink)]">{locked ? <><Eye size={17} />View plan</> : <><Pencil size={16} />Edit</>}</Link>
        <button type="button" onClick={onDelete} disabled={inProgress} title={inProgress ? "Finish the workout before deleting it" : "Delete session"} aria-label={`Delete ${session.title}`} className="grid h-11 w-11 place-items-center rounded-xl border border-transparent text-[var(--ink-soft)] transition enabled:hover:border-[#e8bcbc] enabled:hover:bg-red-50 enabled:hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={17} /></button>
      </div>
    </div>
  </li>;
}
