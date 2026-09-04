"use client";
/* eslint-disable @next/next/no-img-element -- session thumbnails snapshot arbitrary library media */

import { ArrowLeft, BookOpen, Calendar, CirclePlay, Clock3, Eye, LayoutList, MapPin, Pencil, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "./app-shell";
import { useGrep } from "./app-provider";
import { ExerciseDetail, sessionItemDetailSubject } from "./exercise-detail";
import { HelpTip } from "./help-tip";
import { WorkoutSession } from "./live-session";
import { TeamCrest } from "./team-crest";
import { Button, EmptyState, Tag } from "./ui";
import { useSessionRealtime } from "@/hooks/use-session-realtime";
import { blockDuration, sessionDuration } from "@/lib/session";
import type { SessionItem } from "@/lib/types";
import { cn, formatSessionDate, minutesLabel } from "@/lib/utils";

/**
 * `/sessions/<id>` is where the calendar sends a coach, so it reads the plan
 * rather than opening it for editing: the common thing to do with a session is
 * look at it, and every field in the builder saves the moment it is touched.
 * Editing is one click away at `/sessions/<id>/edit`. A started or finished
 * plan is locked in the database, so it keeps going to the workout view, which
 * is the read-only screen it already has.
 */
export function SessionViewScreen({ sessionId }: { sessionId: string }) {
  const { sessions } = useGrep();
  const session = sessions.find((entry) => entry.id === sessionId);
  return session?.status === "in_progress" || session?.status === "completed" ? <WorkoutSession sessionId={sessionId} /> : <SessionView sessionId={sessionId} />;
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);
  const [previewItem, setPreviewItem] = useState<SessionItem | null>(null);
  // A reader is a collaborator too: presence keeps them out of nobody's way and
  // a broadcast from whoever is editing refreshes the plan under them.
  useSessionRealtime(sessionId, store.user, null, () => store.reloadSession(sessionId), store.isDemoMode);
  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<Calendar size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." action={<Link href="/sessions" className="font-bold underline">Tilbake til øktkalenderen</Link>} /></div></AppShell>;

  const sessionTeam = store.teams.find((team) => team.id === session.teamId);
  const builtMinutes = sessionDuration(session);
  const difference = builtMinutes - session.plannedDurationMinutes;

  return <AppShell><div className="min-h-screen pb-24">
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]/92 px-4 py-3 backdrop-blur-xl sm:px-7"><div className="mx-auto flex max-w-[1000px] items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><Link href="/sessions" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-black/5" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={20} /></Link><div className="min-w-0"><p className="truncate text-sm font-black">{session.title}</p><p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ink-soft)]"><Eye size={12} />Visning</p></div></div>
      <div className="flex items-center gap-2">
        <Link href={`/sessions/${sessionId}/live`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:border-[var(--ink)]"><CirclePlay size={17} /><span className="hidden sm:inline">Start økten</span><span className="sm:hidden">Start</span></Link>
        <Link href={`/sessions/${sessionId}/edit`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--orange)] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(240,100,46,.22)] transition hover:-translate-y-0.5 hover:bg-[var(--orange-dark)]"><Pencil size={16} />Rediger</Link>
      </div>
    </div></header>

    <div className="mx-auto max-w-[1000px] px-4 pt-7 sm:px-7">
      <section className="rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_30px_rgba(16,32,29,.04)] sm:p-7">
        <div className="flex flex-wrap items-center gap-2.5">{sessionTeam && <TeamCrest team={sessionTeam} />}<Tag tone={session.status === "draft" ? "orange" : "green"}>{session.status === "draft" ? "Øktutkast" : "Publisert"}</Tag><HelpTip topic="session-publish" /></div>
        <h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">{session.title}</h1>
        <dl className="mt-6 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-2">
          <Detail icon={<Calendar size={17} />} label="Dato og klokkeslett" value={formatSessionDate(session.startsAt)} />
          <Detail icon={<MapPin size={17} />} label="Sted" value={session.venue || "Ikke angitt"} />
          <Detail icon={<Clock3 size={17} />} label="Planlagt varighet" value={minutesLabel(session.plannedDurationMinutes)} />
          <Detail icon={<Target size={17} />} label="Mål for økten" value={session.objective || "Ikke angitt"} />
        </dl>
        {session.blocks.length > 0 && <div className="mt-6 rounded-2xl bg-[var(--paper)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">Planlagt innhold</p><p className="text-sm font-black">{builtMinutes} av {session.plannedDurationMinutes} min</p></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className={cn("h-full rounded-full", difference > 0 ? "bg-[var(--orange)]" : "bg-[#34745f]")} style={{ width: `${Math.min(100, Math.round((builtMinutes / session.plannedDurationMinutes) * 100))}%` }} /></div>
          <p className="mt-2.5 text-xs font-semibold leading-5 text-[var(--ink-soft)]">{difference === 0 ? "Øktplanen samsvarer med planlagt varighet." : difference > 0 ? `${difference} minutter over planlagt tid.` : `${Math.abs(difference)} minutter er fortsatt ledige.`}</p>
        </div>}
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[var(--orange)]">Øktplan</p><h2 className="mt-2 text-3xl font-black tracking-[-.045em]">{session.blocks.length} {session.blocks.length === 1 ? "bolk" : "bolker"}</h2></div><span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-soft)]"><LayoutList size={16} />{minutesLabel(builtMinutes)}</span></div>
        {session.blocks.length ? <div className="mt-6 grid gap-5">{session.blocks.map((block, index) => <article key={block.id} className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_7px_24px_rgba(16,32,29,.04)]">
          <header className="flex items-center gap-3 border-b border-[var(--line)] p-4 sm:px-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-black">{index + 1}</span><h3 className="min-w-0 flex-1 truncate text-lg font-black">{block.title}</h3><span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-xs font-black">{blockDuration(block)} min</span></header>
          {block.notes && <p className="border-b border-[var(--line)] bg-[#f8f5ed] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)] sm:px-5"><span className="mr-2 text-[10px] font-black uppercase tracking-[.11em] text-[var(--orange)]">Notat for bolken</span>{block.notes}</p>}
          <div className="grid gap-2.5 p-3 sm:p-4">{block.items.length ? block.items.map((item) => <button key={item.id} type="button" onClick={() => setPreviewItem(item)} aria-label={`Vis ${item.title}`} className="group flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orange)]">
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl sm:h-12 sm:w-12">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-[var(--paper-deep)]">{item.kind === "exercise" ? <BookOpen size={17} /> : <Sparkles size={17} />}</span>}<span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover:opacity-100"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/90"><Eye size={14} /></span></span></span>
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><strong className="text-[15px] tracking-[-.015em]">{item.title}</strong><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{item.durationMinutes} min</span></span>{item.description && <span className="clamp-2 mt-1 block text-sm leading-6 text-[var(--ink-soft)]">{item.description}</span>}{item.coachingNotes && <span className="mt-2 block rounded-xl bg-[#fff0e8] px-3 py-2"><span className="text-[10px] font-black uppercase tracking-[.11em] text-[#9c3913]">Trenermoment</span><span className="mt-0.5 block text-sm font-semibold leading-6">{item.coachingNotes}</span></span>}</span>
          </button>) : <p className="py-6 text-center text-sm text-[var(--ink-soft)]">Ingen aktiviteter i denne bolken.</p>}</div>
        </article>)}</div> : <div className="mt-6"><EmptyState icon={<Sparkles size={22} />} title="Planen er tom" body="Økten har ingen bolker ennå. Åpne den i redigering for å bygge den opp." action={<Link href={`/sessions/${sessionId}/edit`}><Button><Pencil size={16} />Rediger økten</Button></Link>} /></div>}
      </section>

      {session.notes && <section className="mt-8 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-black">Generelle notater</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">{session.notes}</p></section>}
    </div>

    <ExerciseDetail key={previewItem?.id ?? "none"} exercise={previewItem ? sessionItemDetailSubject(previewItem) : null} onClose={() => setPreviewItem(null)} />
  </div></AppShell>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-[var(--ink-soft)]">{icon}</span><span className="min-w-0"><dt className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--ink-soft)]">{label}</dt><dd className="mt-0.5 text-sm font-bold leading-6">{value}</dd></span></div>;
}
