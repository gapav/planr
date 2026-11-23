"use client";
/* eslint-disable @next/next/no-img-element -- session media uses coach-provided HTTPS URLs */

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Copy,
  Flag,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { getExerciseEmbedUrl, mediaKindOf } from "@/lib/media";
import { assignedCoaches, blockClock, blockDuration, coachNameList, isStationBlock, sessionSchedule, stationRotation } from "@/lib/session";
import type { Profile, SessionItem } from "@/lib/types";
import { clockTime, cn, formatSessionDate, minutesLabel, noteLines } from "@/lib/utils";
import { AppShell } from "./app-shell";
import { useGrep } from "./app-provider";
import { BlockNote } from "./block-note";
import { HelpTip } from "./help-tip";
import { MediaCreditLine } from "./media-credit";
import { MediaLinkCard } from "./media-link";
import { CopySessionDialog, ReopenSessionDialog } from "./session-actions";
import { TeamCrest } from "./team-crest";
import { AvatarStack, Button, EmptyState, LoadingState, Modal, PointList, Tag } from "./ui";

export function LiveSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);

  if (session?.status === "in_progress" || session?.status === "completed") return <WorkoutSession sessionId={sessionId} />;
  // Before the workspace has loaded every session is missing; only a settled
  // one can say this plan is gone.
  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20">{store.workspaceLoaded ? <EmptyState icon={<CalendarClock size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." action={<Link href="/sessions" className="font-bold underline">Tilbake til øktkalenderen</Link>} /> : <LoadingState>Henter økten …</LoadingState>}</div></AppShell>;

  return <SessionSetup sessionId={sessionId} />;
}

// The way into a workout. Grep holds no player data (decision 12), so there is
// nothing to set up here: the page is the plan at a glance and one button.
function SessionSetup({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId)!;
  // The plan's own team, not whichever team the sidebar has selected: a coach
  // can open a session link for a team they are not currently switched to.
  const sessionTeam = store.teams.find((team) => team.id === session.teamId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const published = session.status === "published";
  const blockCount = session.blocks.length;

  async function startWorkout() {
    if (!published) return;
    setStarting(true);
    setStartError("");
    try {
      await store.startWorkout(sessionId);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Økten kunne ikke startes.");
    } finally {
      setStarting(false);
    }
  }

  return <AppShell immersive><div className="min-h-screen pb-16">
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4">
        <Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] transition hover:border-[var(--ink)]" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={19} /></Link>
        {sessionTeam && <TeamCrest team={sessionTeam} />}
        <div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-[.14em] text-[var(--accent)]">Klargjør økten</p><h1 className="mt-0.5 truncate text-xl font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div>
        <Tag tone={published ? "green" : "neutral"}>{published ? "Klar til start" : "Utkast"}</Tag>
        <HelpTip topic="session-day" />
      </div>
    </header>

    <main className="mx-auto max-w-[560px] px-4 pt-7 sm:px-8 sm:pt-10">
      <section className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-7">
        <p className="text-xs font-black uppercase tracking-[.13em] text-[var(--accent)]">Dagens økt</p>
        <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{session.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{formatSessionDate(session.startsAt)} · {blockCount} {blockCount === 1 ? "bolk" : "bolker"} · {minutesLabel(session.plannedDurationMinutes)}</p>
        {session.objective && <p className="mt-4 rounded-2xl bg-[var(--paper)] p-4 text-sm font-semibold leading-6 text-[var(--ink-soft)]">{session.objective}</p>}
        <div className="mt-6 border-t border-[var(--line)] pt-5">
          {!published && <p className="mb-3 rounded-2xl bg-[var(--warn-bg)] px-4 py-3 text-sm font-bold text-[var(--warn-ink)]">Publiser øktplanen før økten startes.</p>}
          {startError && <p role="alert" className="mb-3 rounded-2xl bg-[var(--danger-bg)] px-4 py-3 text-sm font-bold text-[var(--danger)]">{startError}</p>}
          <Button size="lg" className="w-full" disabled={!published || starting} onClick={() => void startWorkout()}><CirclePlay size={19} />{starting ? "Starter…" : "Start økten"}</Button>
          <p className="mt-3 text-center text-xs leading-5 text-[var(--ink-soft)]"><LockKeyhole size={12} className="mr-1 inline" />Når økten startes, låses planen.</p>
        </div>
      </section>
    </main>
  </div></AppShell>;
}

export function WorkoutSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);
  // The plan's own team, not whichever team the sidebar has selected: a coach
  // can open a session link for a team they are not currently switched to.
  const sessionTeam = store.teams.find((team) => team.id === session?.teamId);
  const runnerTop = useRef<HTMLDivElement>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SessionItem | null>(null);
  const [confirmUndoStart, setConfirmUndoStart] = useState(false);
  const [undoingStart, setUndoingStart] = useState(false);
  const [undoStartError, setUndoStartError] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finished = session?.status === "completed";
  const schedule = session ? sessionSchedule(session) : null;
  const safeBlockIndex = session?.blocks.length ? Math.min(activeBlockIndex, session.blocks.length - 1) : 0;
  const currentBlock = session?.blocks[safeBlockIndex];

  function showBlock(index: number) {
    if (!session?.blocks[index]) return;
    setActiveBlockIndex(index);
    setOverviewOpen(false);
    runnerTop.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function undoStart() {
    setUndoingStart(true);
    setUndoStartError("");
    try {
      await store.undoWorkoutStart(sessionId);
      setConfirmUndoStart(false);
    } catch (error) {
      setUndoStartError(error instanceof Error ? error.message : "Starten av økten kunne ikke angres.");
    } finally {
      setUndoingStart(false);
    }
  }

  async function finishWorkout() {
    setFinishing(true);
    setFinishError("");
    try {
      await store.finishWorkout(sessionId);
      setConfirmFinish(false);
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : "Økten kunne ikke avsluttes.");
    } finally {
      setFinishing(false);
    }
  }

  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20">{store.workspaceLoaded ? <EmptyState icon={<CalendarClock size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." /> : <LoadingState>Henter økten …</LoadingState>}</div></AppShell>;

  return <AppShell immersive><div className="min-h-screen pb-28 sm:pb-16">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--chrome)] px-3 py-3 text-[var(--on-chrome)] shadow-lg sm:px-8 sm:py-4">
      <div className="mx-auto flex max-w-[1080px] items-center gap-2 sm:gap-4"><Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={19} /></Link>{sessionTeam && <TeamCrest team={sessionTeam} className="border-white/15 bg-white/10 text-[var(--on-chrome)]" />}<div className="min-w-0 flex-1">{finished ? <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-white/55 sm:text-[11px]"><CheckCircle2 size={13} />Økten er avsluttet</div> : <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-[var(--lime)] sm:text-[11px]"><span className="h-2 w-2 rounded-full bg-[var(--lime)]" />Økten pågår</div>}<h1 className="mt-0.5 truncate text-base font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div><Button variant="secondary" className="h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => setOverviewOpen(true)} aria-label="Øktoversikt"><ListChecks size={17} /><span className="hidden sm:inline">Oversikt</span></Button>{!finished && <Button className="hidden sm:inline-flex" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt økten</Button>}</div>
    </header>

    <main ref={runnerTop} className="mx-auto max-w-[1080px] scroll-mt-24 px-4 pt-5 sm:px-8 sm:pt-8">
      {session.blocks.length ? <>
        <nav className="hide-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Øktens bolker">{session.blocks.map((block, index) => <button key={block.id} type="button" aria-current={index === safeBlockIndex ? "step" : undefined} onClick={() => showBlock(index)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-black transition", index === safeBlockIndex ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--ink)]")}><span className={cn("grid h-6 w-6 place-items-center rounded-lg text-[11px]", index === safeBlockIndex ? "bg-[var(--paper)]/15" : "bg-[var(--paper-deep)] text-[var(--ink)]")}>{index + 1}</span>{block.title}</button>)}</nav>

        {currentBlock && <section aria-labelledby="current-block-title" className="mt-4 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(16,32,29,.07)]"><header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-deep)] px-4 py-4 sm:px-6 sm:py-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-fill)] text-sm font-black text-[var(--on-accent)]">{safeBlockIndex + 1}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">{(() => { const clock = blockClock(schedule, currentBlock.id); return clock ? <span className="tabular-nums">{clockTime(clock.startsAt)}–{clockTime(clock.endsAt)}</span> : "Gjeldende bolk"; })()}</p><h2 id="current-block-title" className="truncate text-2xl font-black tracking-[-.04em] sm:text-3xl">{currentBlock.title}</h2></div>{isStationBlock(currentBlock) && currentBlock.items.length > 0 && <Tag tone="neutral">{currentBlock.items.length} × {stationRotation(currentBlock)} min</Tag>}<Tag tone="neutral">{blockDuration(currentBlock)} min</Tag></header>{isStationBlock(currentBlock) && <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--paper-deep)]/60 px-4 py-2.5 text-xs font-bold text-[var(--ink-soft)] sm:px-6"><LayoutGrid size={14} />Stasjonene går samtidig. {currentBlock.items.length > 0 ? `${currentBlock.items.length} grupper, rotasjon hvert ${stationRotation(currentBlock)}. minutt.` : ""}</div>}{currentBlock.notes && <BlockNote notes={currentBlock.notes} className="sm:px-6" />}<div className={cn("grid gap-3 p-3 sm:p-5", isStationBlock(currentBlock) && "sm:grid-cols-2")}>{currentBlock.items.length ? currentBlock.items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="group rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-left transition hover:border-[var(--ink)] hover:shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-deep)] text-xs font-black">{itemIndex + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black tracking-[-.025em]">{item.title}</h3>{!isStationBlock(currentBlock) && <span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{item.durationMinutes} min</span>}</div><ItemCoach item={item} members={sessionTeam?.members ?? []} />{item.description && <p className="mt-2 clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{item.description}</p>}{item.coachingNotes && <div className="mt-3 rounded-xl bg-[var(--warn-bg)] px-3.5 py-3"><p className="text-[10px] font-black uppercase tracking-[.11em] text-[var(--warn-ink)]">Stikkord</p><PointList points={noteLines(item.coachingNotes)} className="mt-1 text-sm font-semibold leading-6" /></div>}<span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[var(--accent)]"><CirclePlay size={15} />Vis øvelsen</span></div></div></button>) : <p className="py-8 text-center text-sm text-[var(--ink-soft)]">{isStationBlock(currentBlock) ? "Ingen stasjoner i denne bolken." : "Ingen aktiviteter i denne bolken."}</p>}</div></section>}

        <div className="mt-5 hidden items-center justify-between gap-3 sm:flex">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Angre start</Button> : <Button variant="secondary" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Forrige bolk</Button>}<p className="text-sm font-black text-[var(--ink-soft)]">Bolk {safeBlockIndex + 1} av {session.blocks.length}</p>{safeBlockIndex < session.blocks.length - 1 ? <Button onClick={() => showBlock(safeBlockIndex + 1)}>Neste bolk<ChevronRight size={18} /></Button> : !finished ? <Button onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt økten</Button> : <span />}</div>
      </> : <div className="mt-5"><EmptyState icon={<ListChecks size={24} />} title="Ingen aktiviteter i denne planen" body="Økten er låst og har ingen bolker å vise." /></div>}

      {/* A finished workout used to end here, in a line of grey text. The two
          things a coach actually wants from last week's plan belong on it:
          running it again, which is what copying is for, and putting right a
          session finished too early. */}
      {finished && <section className="mt-6 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 text-center shadow-[0_7px_24px_rgba(16,32,29,.04)]">
        <p className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--ink-soft)]"><CheckCircle2 size={16} />Avsluttet {formatSessionDate(session.completedAt ?? null)}</p>
        <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={() => setConfirmReopen(true)}><RotateCcw size={17} />Gjenåpne økt</Button>
          <Button onClick={() => setCopying(true)}><Copy size={17} />Kopier økt</Button>
        </div>
      </section>}
    </main>

    {session.blocks.length > 0 && <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(16,32,29,.1)] backdrop-blur-xl sm:hidden" aria-label="Navigasjon mellom bolker">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" className="min-w-0 px-3" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Angre start</Button> : <Button variant="secondary" className="min-w-0 px-3" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Forrige</Button>}<span className="px-1 text-center text-xs font-black text-[var(--ink-soft)]">{safeBlockIndex + 1} / {session.blocks.length}</span>{safeBlockIndex < session.blocks.length - 1 ? <Button className="min-w-0 px-3" onClick={() => showBlock(safeBlockIndex + 1)}>Neste<ChevronRight size={18} /></Button> : !finished ? <Button className="min-w-0 px-3" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt</Button> : <Button className="min-w-0 px-3" variant="secondary" onClick={() => setOverviewOpen(true)}><ListChecks size={17} />Oversikt</Button>}</nav>}

    <Modal open={overviewOpen} onClose={() => setOverviewOpen(false)} title="Øktoversikt" description={`${session.blocks.length} ${session.blocks.length === 1 ? "bolk" : "bolker"} · ${minutesLabel(session.plannedDurationMinutes)}`} size="lg">
      {session.objective && <section className="mb-4 rounded-2xl bg-[var(--paper)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--accent)]">Mål for økten</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--ink-soft)]">{session.objective}</p></section>}
      <div className="grid gap-3">{session.blocks.map((block, index) => <button key={block.id} type="button" onClick={() => showBlock(index)} aria-label={`Gå til ${block.title}`} className={cn("rounded-2xl border p-4 text-left transition hover:border-[var(--ink)]", index === safeBlockIndex ? "border-[var(--success-line)] bg-[var(--success-bg)]" : "border-[var(--line)] bg-[var(--surface-raised)]")}><div className="flex items-center gap-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black", index === safeBlockIndex ? "bg-[var(--success-fill)] text-[var(--on-accent)]" : "bg-[var(--paper-deep)]")}>{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate">{block.title}</strong><small className="text-[var(--ink-soft)]">{isStationBlock(block) ? `${block.items.length} ${block.items.length === 1 ? "stasjon" : "stasjoner"} × ${stationRotation(block)} min` : `${block.items.length} ${block.items.length === 1 ? "aktivitet" : "aktiviteter"}`}</small></span><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{blockDuration(block)} min</span><ChevronRight size={17} className="shrink-0 text-[var(--ink-soft)]" /></div>{block.items.length > 0 && <ul className="mt-3 grid gap-1.5 pl-12 text-xs text-[var(--ink-soft)]">{block.items.map((item, itemIndex) => { const coaches = assignedCoaches(item, sessionTeam?.members ?? []); return <li key={item.id} className="flex items-start justify-between gap-3"><span>{isStationBlock(block) && <span className="font-bold">{itemIndex + 1}. </span>}{item.title}{coaches.length > 0 && <span className="font-bold"> · {coachNameList(coaches.map((coach) => coach.fullName))}</span>}</span>{!isStationBlock(block) && <span className="shrink-0 font-bold">{item.durationMinutes} min</span>}</li>; })}</ul>}</button>)}</div>
      {session.notes && <section className="mt-4 rounded-2xl border border-[var(--line)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--accent)]">Øktnotater</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">{session.notes}</p></section>}
    </Modal>
    <Modal open={confirmUndoStart} onClose={() => { if (!undoingStart) setConfirmUndoStart(false); }} title="Vil du angre starten av økten?" description="Økten går tilbake til «Klar til start», slik at du kan korrigere planen eller starte på nytt." size="sm">
      {undoStartError && <p role="alert" className="mb-4 rounded-2xl bg-[var(--danger-bg)] px-4 py-3 text-sm font-bold text-[var(--danger)]">{undoStartError}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmUndoStart(false)} disabled={undoingStart}>Fortsett økten</Button><Button onClick={() => void undoStart()} disabled={undoingStart}><RotateCcw size={17} />{undoingStart ? "Angrer …" : "Angre start"}</Button></div>
    </Modal>
    <Modal open={confirmFinish} onClose={() => { if (!finishing) setConfirmFinish(false); }} title="Vil du avslutte denne økten?" description="Økten flyttes til «Gjennomførte». Planen forblir låst som dokumentasjon." size="sm">
      {finishError && <p className="mb-4 rounded-2xl bg-[var(--danger-bg)] px-4 py-3 text-sm font-bold text-[var(--danger)]">{finishError}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>Fortsett økten</Button><Button onClick={() => void finishWorkout()} disabled={finishing}><Flag size={17} />{finishing ? "Avslutter…" : "Avslutt økten"}</Button></div>
    </Modal>
    {confirmReopen && <ReopenSessionDialog session={session} onClose={() => setConfirmReopen(false)} />}
    {copying && <CopySessionDialog session={session} onClose={() => setCopying(false)} />}
    <Modal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)} title={selectedItem?.title ?? "Øvelse"} description={selectedItem ? `${selectedItem.durationMinutes} minutter · skrivebeskyttet` : undefined} size="lg">
      {selectedItem && <ExerciseDetail item={selectedItem} />}
    </Modal>
  </div></AppShell>;
}

/**
 * Who runs this activity in the hall. Nothing is drawn when nobody was named:
 * an activity is the whole coaching team's by default, and a "Ingen ansvarlig"
 * line on every card would bury the few that were handed to someone.
 */
function ItemCoach({ item, members }: { item: SessionItem; members: Profile[] }) {
  const coaches = assignedCoaches(item, members);
  if (!coaches.length) return null;
  return <p className="mt-2 flex items-center gap-1.5"><AvatarStack people={coaches} /><span className="text-xs font-bold text-[var(--ink-soft)]">{coachNameList(coaches.map((coach) => coach.fullName))} har denne</span></p>;
}

function ExerciseDetail({ item }: { item: SessionItem }) {
  // A kind means the url parsed, so the embed lookup cannot throw.
  const mediaKind = mediaKindOf(item);
  const embedUrl = item.mediaUrl && mediaKind ? getExerciseEmbedUrl(item.mediaUrl) : null;

  return <div className="grid gap-5">
    {item.mediaUrl && embedUrl ? <div className="aspect-video overflow-hidden rounded-[20px] bg-black"><iframe src={embedUrl} title={`${item.title} video`} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : item.mediaUrl && mediaKind === "video" ? <video src={item.mediaUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-[20px] bg-black object-contain" /> : item.mediaUrl && mediaKind === "image" ? <img src={item.mediaUrl} alt={item.title} className="max-h-[55vh] w-full rounded-[20px] bg-[var(--paper)] object-contain" /> : item.mediaUrl && mediaKind === "link" ? <MediaLinkCard mediaUrl={item.mediaUrl} /> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="max-h-[45vh] w-full rounded-[20px] bg-[var(--paper)] object-contain" /> : null}
    <MediaCreditLine mediaUrl={item.mediaUrl} />
    {item.description && <section><p className="text-xs font-black uppercase tracking-[.12em] text-[var(--accent)]">Instruksjoner</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">{item.description}</p></section>}
    {item.coachingNotes && <section className="rounded-2xl border border-[var(--line)] p-4"><p className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink-soft)]"><MessageCircle size={15} aria-hidden="true" className="text-[var(--accent)]" />Stikkord</p><PointList points={noteLines(item.coachingNotes)} className="mt-2 text-sm font-semibold leading-6" /></section>}
    {!item.mediaUrl && !item.description && !item.coachingNotes && <p className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center text-sm text-[var(--ink-soft)]">Ingen flere øvelsesdetaljer er tilgjengelige.</p>}
  </div>;
}
