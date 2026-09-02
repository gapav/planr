"use client";
/* eslint-disable @next/next/no-img-element -- session media uses coach-provided HTTPS URLs */

import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Clock3,
  Flag,
  ListChecks,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Shuffle,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { makePairs, makeTeams } from "@/lib/grouping";
import { getExerciseEmbedUrl, parseExerciseMedia } from "@/lib/media";
import { blockDuration } from "@/lib/session";
import type { PlayerGroup, SessionGroupingKind, SessionItem, TeamPlayer } from "@/lib/types";
import { cn, formatSessionDate, minutesLabel } from "@/lib/utils";
import { AppShell } from "./app-shell";
import { useGrep } from "./app-provider";
import { Button, EmptyState, Modal, Tag } from "./ui";

type SetupStep = "check-in" | "groups";

export function LiveSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);

  if (session?.status === "in_progress" || session?.status === "completed") return <WorkoutSession sessionId={sessionId} />;
  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<CalendarClock size={23} />} title="Session not found" body="It may have been removed or belong to another team." action={<Link href="/sessions" className="font-bold underline">Back to sessions</Link>} /></div></AppShell>;

  return <SessionSetup sessionId={sessionId} />;
}

function SessionSetup({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId)!;
  const players = useMemo(() => store.players.filter((player) => player.teamId === session.teamId).sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")), [session.teamId, store.players]);
  const presentIds = useMemo(() => new Set(store.attendance.filter((entry) => entry.sessionId === sessionId && entry.isPresent).map((entry) => entry.playerId)), [sessionId, store.attendance]);
  const presentPlayers = players.filter((player) => presentIds.has(player.id));
  const [step, setStep] = useState<SetupStep>("check-in");
  const [groupingKind, setGroupingKind] = useState<SessionGroupingKind>("teams");
  const [teamCount, setTeamCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const effectiveTeamCount = Math.min(Math.max(2, presentPlayers.length), teamCount);
  const grouping = store.groupings.find((entry) => entry.sessionId === sessionId && entry.kind === groupingKind);
  const groups = grouping?.groups ?? [];
  const attendanceStale = isGroupingStale(groups, presentIds);
  const configurationStale = groupingKind === "teams" && groups.length > 0 && groups.length !== effectiveTeamCount;
  const groupsReady = groups.length > 0 && !attendanceStale && !configurationStale;

  async function toggleAll(present: boolean) {
    await Promise.all(players.map((player) => store.setPlayerPresent(sessionId, player.id, present)));
  }

  async function generate() {
    if (presentPlayers.length < 2) return;
    setGenerating(true);
    setStartError("");
    try {
      const nextGroups = groupingKind === "teams" ? makeTeams(presentPlayers, effectiveTeamCount) : makePairs(presentPlayers);
      await store.saveGrouping(sessionId, groupingKind, nextGroups);
    } finally {
      setGenerating(false);
    }
  }

  async function startWorkout() {
    if (!groupsReady || session.status !== "published") return;
    setStarting(true);
    setStartError("");
    try {
      await store.startWorkout(sessionId, groupingKind);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "The session could not be started.");
    } finally {
      setStarting(false);
    }
  }

  return <AppShell immersive><div className="min-h-screen pb-16">
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4">
        <Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white transition hover:border-[var(--ink)]" aria-label="Back to sessions"><ArrowLeft size={19} /></Link>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-[.14em] text-[var(--orange)]">Session setup</p><h1 className="mt-0.5 truncate text-xl font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div>
        <Tag tone={session.status === "published" ? "green" : "orange"}>{session.status === "published" ? "Ready to start" : "Draft"}</Tag>
      </div>
    </header>

    <main className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8 sm:pt-10">
      <div className="grid gap-3 sm:grid-cols-2">
        <StepTab active={step === "check-in"} complete={presentPlayers.length >= 2} number="1" title="Check in" detail={`${presentPlayers.length} of ${players.length} players`} onClick={() => setStep("check-in")} />
        <StepTab active={step === "groups"} complete={groupsReady} number="2" title="Generate groups" detail={groupsReady ? `${groups.length} ${groupingKind}` : "Set up the draw"} onClick={() => setStep("groups")} />
      </div>

      {!players.length ? <div className="mt-7"><EmptyState icon={<UsersRound size={24} />} title="Import the player roster first" body="Add the Hoopit roster in Team settings, then return here to check players in." action={<Link href="/team" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--orange)] px-4 text-sm font-semibold text-white">Go to Team settings</Link>} /></div> : step === "check-in" ? <section className="mt-7 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Attendance</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Who is here today?</h2><p className="mt-2 text-sm text-[var(--ink-soft)]">Check players in before making teams or pairs.</p></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void toggleAll(true)}>Select all</Button><Button variant="ghost" size="sm" onClick={() => void toggleAll(false)}>Clear</Button></div></div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{players.map((player) => { const present = presentIds.has(player.id); return <button key={player.id} type="button" aria-pressed={present} onClick={() => void store.setPlayerPresent(sessionId, player.id, !present)} className={cn("flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition", present ? "border-[#83ad9c] bg-[#e8f3eb]" : "border-[var(--line)] bg-white hover:border-[#aaa69b]")}><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2", present ? "border-[#34745f] bg-[#34745f] text-white" : "border-[#c2c0b8]")}>{present && <Check size={16} strokeWidth={3} />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{player.fullName}</strong><small className="text-[var(--ink-soft)]">{player.jerseyNumber ? `#${player.jerseyNumber}` : "No number"}</small></span></button>; })}</div>
        <div className="mt-7 flex flex-col items-stretch justify-between gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center"><p className="text-sm font-semibold text-[var(--ink-soft)]">{presentPlayers.length < 2 ? "Check in at least two players to continue." : `${presentPlayers.length} players are ready for the draw.`}</p><Button disabled={presentPlayers.length < 2} onClick={() => setStep("groups")}>Continue to groups<ChevronRight size={17} /></Button></div>
      </section> : <section className="mt-7 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Draw settings</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Set up the groups</h2><p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">Choose one format, set the size, then generate when you are ready.</p>
          <fieldset className="mt-6"><legend className="text-sm font-black">Format</legend><div className="mt-2 grid grid-cols-2 gap-2"><FormatButton active={groupingKind === "teams"} icon={<UsersRound size={18} />} label="Teams" onClick={() => setGroupingKind("teams")} /><FormatButton active={groupingKind === "pairs"} icon={<UserRoundCheck size={18} />} label="Pairs" onClick={() => setGroupingKind("pairs")} /></div></fieldset>
          {groupingKind === "teams" && <label className="mt-6 block text-sm font-black"><span>Number of teams</span><div className="mt-2 flex items-center rounded-2xl border border-[var(--line)] bg-white p-1"><button type="button" className="grid h-10 w-11 place-items-center rounded-xl text-xl font-bold hover:bg-black/5" onClick={() => setTeamCount((count) => Math.max(2, count - 1))} aria-label="Fewer teams">−</button><input type="number" min={2} max={Math.max(2, presentPlayers.length)} value={effectiveTeamCount} onChange={(event) => setTeamCount(Math.max(2, Number(event.target.value) || 2))} className="h-10 min-w-0 flex-1 bg-transparent text-center text-lg font-black outline-none" /><button type="button" className="grid h-10 w-11 place-items-center rounded-xl text-xl font-bold hover:bg-black/5" onClick={() => setTeamCount((count) => Math.min(Math.max(2, presentPlayers.length), count + 1))} aria-label="More teams">+</button></div></label>}
          <div className="mt-6 rounded-2xl bg-[var(--paper)] p-4 text-sm leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--ink)]">{presentPlayers.length} checked in</strong><br />{groupingKind === "teams" ? `${effectiveTeamCount} balanced teams will be created.` : "Players will be paired, with one trio if needed."}</div>
          <Button className="mt-5 w-full" size="lg" disabled={presentPlayers.length < 2 || generating} onClick={() => void generate()}><Shuffle size={18} />{generating ? "Generating…" : groups.length ? "Generate again" : "Generate groups"}</Button>
          <Button className="mt-2 w-full" variant="ghost" onClick={() => setStep("check-in")}><ChevronLeft size={17} />Change attendance</Button>
        </div>

        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Preview</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{groupingKind === "teams" ? "Today’s teams" : "Today’s pairs"}</h2></div>{groupsReady && <Tag tone="green"><CheckCircle2 size={13} className="mr-1" />Ready</Tag>}</div>
          {attendanceStale || configurationStale ? <div className="mt-5 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-bold text-[#9c3913]">{attendanceStale ? "Attendance changed" : "Settings changed"} — generate again before starting.</div> : null}
          {groups.length ? <GroupsGrid groups={groups} players={players} className="mt-5" /> : <div className="mt-5 grid min-h-64 place-items-center rounded-[22px] border border-dashed border-[#c8c3b7] bg-white/40 px-6 text-center"><div><Shuffle className="mx-auto text-[var(--ink-soft)]" size={28} /><p className="mt-3 font-black">Your draw will appear here</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Set the options, then use Generate groups.</p></div></div>}
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            {session.status !== "published" && <p className="mb-3 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-bold text-[#9c3913]">Publish the session plan before starting the workout.</p>}
            {startError && <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{startError}</p>}
            <Button size="lg" className="w-full" disabled={!groupsReady || session.status !== "published" || starting} onClick={() => void startWorkout()}><CirclePlay size={19} />{starting ? "Starting…" : "Start workout"}</Button>
            <p className="mt-3 text-center text-xs leading-5 text-[var(--ink-soft)]"><LockKeyhole size={12} className="mr-1 inline" />Starting locks attendance and groups for the workout.</p>
          </div>
        </div>
      </section>}
    </main>
  </div></AppShell>;
}

export function WorkoutSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);
  const players = useMemo(() => store.players.filter((player) => player.teamId === session?.teamId).sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")), [session?.teamId, store.players]);
  const presentIds = useMemo(() => new Set(store.attendance.filter((entry) => entry.sessionId === sessionId && entry.isPresent).map((entry) => entry.playerId)), [sessionId, store.attendance]);
  const presentPlayers = players.filter((player) => presentIds.has(player.id));
  const groupingKind = session?.groupingKind ?? "teams";
  const groups = store.groupings.find((entry) => entry.sessionId === sessionId && entry.kind === groupingKind)?.groups ?? [];
  const runnerTop = useRef<HTMLDivElement>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SessionItem | null>(null);
  const [confirmUndoStart, setConfirmUndoStart] = useState(false);
  const [undoingStart, setUndoingStart] = useState(false);
  const [undoStartError, setUndoStartError] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finished = session?.status === "completed";
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
      setUndoStartError(error instanceof Error ? error.message : "The workout start could not be undone.");
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
      setFinishError(error instanceof Error ? error.message : "The workout could not be finished.");
    } finally {
      setFinishing(false);
    }
  }

  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<CalendarClock size={23} />} title="Session not found" body="It may have been removed or belong to another team." /></div></AppShell>;

  return <AppShell immersive><div className="min-h-screen pb-28 sm:pb-16">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--ink)] px-3 py-3 text-white shadow-lg sm:px-8 sm:py-4">
      <div className="mx-auto flex max-w-[1080px] items-center gap-2 sm:gap-4"><Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="Back to sessions"><ArrowLeft size={19} /></Link><div className="min-w-0 flex-1">{finished ? <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-white/55 sm:text-[11px]"><CheckCircle2 size={13} />Workout finished</div> : <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-[var(--lime)] sm:text-[11px]"><span className="h-2 w-2 rounded-full bg-[var(--lime)]" />Workout in progress</div>}<h1 className="mt-0.5 truncate text-base font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div><Button variant="secondary" className="h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => setOverviewOpen(true)} aria-label="Session overview"><ListChecks size={17} /><span className="hidden sm:inline">Overview</span></Button><Button variant="secondary" className="h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => setTeamsOpen(true)} aria-label={`Show ${groupingKind === "pairs" ? "pairs" : "teams"}`}><UsersRound size={17} /><span className="hidden sm:inline">{groupingKind === "pairs" ? "Pairs" : "Teams"}</span></Button>{!finished && <Button className="hidden sm:inline-flex" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Finish workout</Button>}</div>
    </header>

    <main ref={runnerTop} className="mx-auto max-w-[1080px] scroll-mt-24 px-4 pt-5 sm:px-8 sm:pt-8">
      <div className="grid grid-cols-3 gap-2 sm:gap-3"><InfoPill icon={<Clock3 size={18} />} label="Duration" value={minutesLabel(session.plannedDurationMinutes)} /><InfoPill icon={<MapPin size={18} />} label="Venue" value={session.venue || "Not set"} /><InfoPill icon={<UsersRound size={18} />} label="Checked in" value={`${presentPlayers.length} players`} /></div>

      {session.blocks.length ? <>
        <nav className="hide-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Session blocks">{session.blocks.map((block, index) => <button key={block.id} type="button" aria-current={index === safeBlockIndex ? "step" : undefined} onClick={() => showBlock(index)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-black transition", index === safeBlockIndex ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--ink)]")}><span className={cn("grid h-6 w-6 place-items-center rounded-lg text-[11px]", index === safeBlockIndex ? "bg-white/15" : "bg-[var(--paper-deep)] text-[var(--ink)]")}>{index + 1}</span>{block.title}</button>)}</nav>

        {currentBlock && <section aria-labelledby="current-block-title" className="mt-4 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(16,32,29,.07)]"><header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-deep)] px-4 py-4 sm:px-6 sm:py-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--orange)] text-sm font-black text-white">{safeBlockIndex + 1}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">Current block</p><h2 id="current-block-title" className="truncate text-2xl font-black tracking-[-.04em] sm:text-3xl">{currentBlock.title}</h2></div><Tag tone="neutral">{blockDuration(currentBlock)} min</Tag></header>{currentBlock.notes && <div className="border-b border-[var(--line)] bg-[#f8f5ed] px-4 py-3 text-sm font-semibold leading-6 text-[var(--ink-soft)] sm:px-6"><span className="mr-2 text-[10px] font-black uppercase tracking-[.11em] text-[var(--orange)]">Block note</span>{currentBlock.notes}</div>}<div className="grid gap-3 p-3 sm:p-5">{currentBlock.items.length ? currentBlock.items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="group rounded-[20px] border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--ink)] hover:shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-deep)] text-xs font-black">{itemIndex + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black tracking-[-.025em]">{item.title}</h3><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{item.durationMinutes} min</span></div>{item.description && <p className="mt-2 clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{item.description}</p>}{item.coachingNotes && <div className="mt-3 rounded-xl bg-[#fff0e8] px-3.5 py-3"><p className="text-[10px] font-black uppercase tracking-[.11em] text-[#9c3913]">Coaching point</p><p className="mt-1 text-sm font-semibold leading-6">{item.coachingNotes}</p></div>}<span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[var(--orange)]"><CirclePlay size={15} />View exercise</span></div></div></button>) : <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No activities in this block.</p>}</div></section>}

        <div className="mt-5 hidden items-center justify-between gap-3 sm:flex">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Undo start</Button> : <Button variant="secondary" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Previous block</Button>}<p className="text-sm font-black text-[var(--ink-soft)]">Block {safeBlockIndex + 1} of {session.blocks.length}</p>{safeBlockIndex < session.blocks.length - 1 ? <Button onClick={() => showBlock(safeBlockIndex + 1)}>Next block<ChevronRight size={18} /></Button> : !finished ? <Button onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Finish workout</Button> : <span />}</div>
      </> : <div className="mt-5"><EmptyState icon={<ListChecks size={24} />} title="No activities in this plan" body="The session is locked and has no workout blocks to display." /></div>}

      {finished && <p className="mt-5 text-center text-sm font-bold text-[var(--ink-soft)]">Finished {formatSessionDate(session.completedAt ?? null)}</p>}
    </main>

    {session.blocks.length > 0 && <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(16,32,29,.1)] backdrop-blur-xl sm:hidden" aria-label="Block navigation">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" className="min-w-0 px-3" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Undo start</Button> : <Button variant="secondary" className="min-w-0 px-3" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Previous</Button>}<span className="px-1 text-center text-xs font-black text-[var(--ink-soft)]">{safeBlockIndex + 1} / {session.blocks.length}</span>{safeBlockIndex < session.blocks.length - 1 ? <Button className="min-w-0 px-3" onClick={() => showBlock(safeBlockIndex + 1)}>Next<ChevronRight size={18} /></Button> : !finished ? <Button className="min-w-0 px-3" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Finish</Button> : <Button className="min-w-0 px-3" variant="secondary" onClick={() => setOverviewOpen(true)}><ListChecks size={17} />Overview</Button>}</nav>}

    <Modal open={teamsOpen} onClose={() => setTeamsOpen(false)} title={groupingKind === "pairs" ? "Today’s pairs" : "Today’s teams"} description={`${presentPlayers.length} checked-in players · groups are locked for this workout`} size="lg">
      {groups.length ? <GroupsGrid groups={groups} players={players} /> : <div className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><UsersRound className="mx-auto text-[var(--ink-soft)]" size={25} /><p className="mt-2 text-sm font-bold">No saved groups are available.</p></div>}
    </Modal>
    <Modal open={overviewOpen} onClose={() => setOverviewOpen(false)} title="Session overview" description={`${session.blocks.length} ${session.blocks.length === 1 ? "block" : "blocks"} · ${minutesLabel(session.plannedDurationMinutes)}`} size="lg">
      {session.objective && <section className="mb-4 rounded-2xl bg-[var(--paper)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--orange)]">Session objective</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--ink-soft)]">{session.objective}</p></section>}
      <div className="grid gap-3">{session.blocks.map((block, index) => <button key={block.id} type="button" onClick={() => showBlock(index)} aria-label={`Go to ${block.title}`} className={cn("rounded-2xl border p-4 text-left transition hover:border-[var(--ink)]", index === safeBlockIndex ? "border-[#83ad9c] bg-[#e8f3eb]" : "border-[var(--line)] bg-white")}><div className="flex items-center gap-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black", index === safeBlockIndex ? "bg-[#34745f] text-white" : "bg-[var(--paper-deep)]")}>{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate">{block.title}</strong><small className="text-[var(--ink-soft)]">{block.items.length} {block.items.length === 1 ? "activity" : "activities"}</small></span><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{blockDuration(block)} min</span><ChevronRight size={17} className="shrink-0 text-[var(--ink-soft)]" /></div>{block.items.length > 0 && <ul className="mt-3 grid gap-1.5 pl-12 text-xs text-[var(--ink-soft)]">{block.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3"><span>{item.title}</span><span className="shrink-0 font-bold">{item.durationMinutes} min</span></li>)}</ul>}</button>)}</div>
      {session.notes && <section className="mt-4 rounded-2xl border border-[var(--line)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--orange)]">Session notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">{session.notes}</p></section>}
    </Modal>
    <Modal open={confirmUndoStart} onClose={() => { if (!undoingStart) setConfirmUndoStart(false); }} title="Undo workout start?" description="The session returns to Ready to start. Attendance and groups stay saved, so you can correct them or start again." size="sm">
      {undoStartError && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{undoStartError}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmUndoStart(false)} disabled={undoingStart}>Keep workout running</Button><Button onClick={() => void undoStart()} disabled={undoingStart}><RotateCcw size={17} />{undoingStart ? "Undoing…" : "Undo start"}</Button></div>
    </Modal>
    <Modal open={confirmFinish} onClose={() => { if (!finishing) setConfirmFinish(false); }} title="Finish this workout?" description="The session moves to Past. The plan, attendance and groups stay locked as a record of the session." size="sm">
      {finishError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{finishError}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>Keep going</Button><Button onClick={() => void finishWorkout()} disabled={finishing}><Flag size={17} />{finishing ? "Finishing…" : "Finish workout"}</Button></div>
    </Modal>
    <Modal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)} title={selectedItem?.title ?? "Exercise"} description={selectedItem ? `${selectedItem.durationMinutes} minutes · read only` : undefined} size="lg">
      {selectedItem && <ExerciseDetail item={selectedItem} />}
    </Modal>
  </div></AppShell>;
}

function StepTab({ active, complete, number, title, detail, onClick }: { active: boolean; complete: boolean; number: string; title: string; detail: string; onClick(): void }) {
  return <button type="button" onClick={onClick} className={cn("flex items-center gap-4 rounded-[22px] border p-4 text-left transition", active ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[var(--shadow)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[#aaa69b]")}><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black", active ? "bg-[var(--orange)] text-white" : complete ? "bg-[#dcecdf] text-[#285546]" : "bg-[var(--paper-deep)]")}>{complete && !active ? <Check size={18} strokeWidth={3} /> : number}</span><span className="min-w-0"><strong className="block">{title}</strong><small className={active ? "text-white/60" : "text-[var(--ink-soft)]"}>{detail}</small></span></button>;
}

function FormatButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick(): void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-black transition", active ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white hover:border-[#aaa69b]")}>{icon}{label}</button>;
}

function GroupsGrid({ groups, players, className, compact = false }: { groups: PlayerGroup[]; players: TeamPlayer[]; className?: string; compact?: boolean }) {
  return <div className={cn("grid gap-3", !compact && "sm:grid-cols-2", className)}>{groups.map((group) => <article key={group.id} className={cn("rounded-2xl border border-[var(--line)] bg-white", compact ? "p-3.5" : "p-4")}><p className="text-xs font-black uppercase tracking-[.09em] text-[var(--ink-soft)]">{group.label}</p><ul className="mt-2 grid gap-1.5">{group.playerIds.map((id) => <li key={id} className="flex items-center gap-2 text-sm font-bold"><span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]" />{players.find((player) => player.id === id)?.fullName ?? "Removed player"}</li>)}</ul></article>)}</div>;
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 sm:flex sm:items-center sm:gap-3 sm:px-4"><span className="mb-2 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] sm:mb-0 sm:h-10 sm:w-10">{icon}</span><span className="min-w-0"><small className="block truncate text-[9px] font-black uppercase tracking-[.1em] text-[var(--ink-soft)] sm:text-[10px] sm:tracking-[.12em]">{label}</small><strong className="mt-0.5 block truncate text-xs sm:text-sm">{value}</strong></span></div>;
}

function ExerciseDetail({ item }: { item: SessionItem }) {
  let mediaKind: ReturnType<typeof parseExerciseMedia>["kind"] | null = null;
  let embedUrl: string | null = null;
  if (item.mediaUrl) {
    try {
      mediaKind = parseExerciseMedia(item.mediaUrl).kind;
      embedUrl = getExerciseEmbedUrl(item.mediaUrl);
    } catch {
      mediaKind = null;
    }
  }

  return <div className="grid gap-5">
    {item.mediaUrl && embedUrl ? <div className="aspect-video overflow-hidden rounded-[20px] bg-black"><iframe src={embedUrl} title={`${item.title} video`} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : item.mediaUrl && mediaKind === "video" ? <video src={item.mediaUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-[20px] bg-black object-contain" /> : item.mediaUrl && mediaKind === "image" ? <img src={item.mediaUrl} alt={item.title} className="max-h-[55vh] w-full rounded-[20px] bg-[var(--paper)] object-contain" /> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="max-h-[45vh] w-full rounded-[20px] bg-[var(--paper)] object-contain" /> : null}
    {item.description && <section><p className="text-xs font-black uppercase tracking-[.12em] text-[var(--orange)]">Instructions</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">{item.description}</p></section>}
    {item.coachingNotes && <section className="rounded-2xl bg-[#fff0e8] p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-[#9c3913]">Coaching point</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{item.coachingNotes}</p></section>}
    {!item.mediaUrl && !item.description && !item.coachingNotes && <p className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center text-sm text-[var(--ink-soft)]">No additional exercise details are available.</p>}
  </div>;
}

function isGroupingStale(groups: PlayerGroup[], presentIds: Set<string>) {
  if (!groups.length) return false;
  const groupedIds = new Set(groups.flatMap((group) => group.playerIds));
  return groupedIds.size !== presentIds.size || [...presentIds].some((id) => !groupedIds.has(id));
}
