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
  FastForward,
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
import { TeamCrest } from "./team-crest";
import { Button, EmptyState, Modal, Tag } from "./ui";

type SetupStep = "check-in" | "groups";

export function LiveSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);

  if (session?.status === "in_progress" || session?.status === "completed") return <WorkoutSession sessionId={sessionId} />;
  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<CalendarClock size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." action={<Link href="/sessions" className="font-bold underline">Tilbake til øktkalenderen</Link>} /></div></AppShell>;

  return <SessionSetup sessionId={sessionId} />;
}

function SessionSetup({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId)!;
  // The plan's own team, not whichever team the sidebar has selected: a coach
  // can open a session link for a team they are not currently switched to.
  const sessionTeam = store.teams.find((team) => team.id === session.teamId);
  const players = useMemo(() => store.players.filter((player) => player.teamId === session.teamId).sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")), [session.teamId, store.players]);
  const presentIds = useMemo(() => new Set(store.attendance.filter((entry) => entry.sessionId === sessionId && entry.isPresent).map((entry) => entry.playerId)), [sessionId, store.attendance]);
  const presentPlayers = players.filter((player) => presentIds.has(player.id));
  const [step, setStep] = useState<SetupStep>("check-in");
  const [groupingKind, setGroupingKind] = useState<SessionGroupingKind>("teams");
  const [teamCount, setTeamCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [confirmSkipSetup, setConfirmSkipSetup] = useState(false);
  const [skippingSetup, setSkippingSetup] = useState(false);
  const [skipSetupError, setSkipSetupError] = useState("");
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
      setStartError(error instanceof Error ? error.message : "Økten kunne ikke startes.");
    } finally {
      setStarting(false);
    }
  }

  async function startWithoutSetup() {
    if (session.status !== "published") return;
    setSkippingSetup(true);
    setSkipSetupError("");
    try {
      await store.startWorkoutWithoutSetup(sessionId);
      setConfirmSkipSetup(false);
    } catch (error) {
      setSkipSetupError(error instanceof Error ? error.message : "Økten kunne ikke startes uten oppsett.");
    } finally {
      setSkippingSetup(false);
    }
  }

  return <AppShell immersive><div className="min-h-screen pb-16">
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4">
        <Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white transition hover:border-[var(--ink)]" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={19} /></Link>
        {sessionTeam && <TeamCrest team={sessionTeam} />}
        <div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-[.14em] text-[var(--orange)]">Klargjør økten</p><h1 className="mt-0.5 truncate text-xl font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div>
        <Tag tone={session.status === "published" ? "green" : "orange"}>{session.status === "published" ? "Klar til start" : "Utkast"}</Tag>
      </div>
    </header>

    <main className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8 sm:pt-10">
      <div className="grid gap-3 sm:grid-cols-2">
        <StepTab active={step === "check-in"} complete={presentPlayers.length >= 2} number="1" title="Registrer oppmøte" detail={`${presentPlayers.length} av ${players.length} spillere`} onClick={() => setStep("check-in")} />
        <StepTab active={step === "groups"} complete={groupsReady} number="2" title="Generer grupper" detail={groupsReady ? `${groups.length} ${groupingKind === "teams" ? "lag" : "par"}` : "Sett opp trekningen"} onClick={() => setStep("groups")} />
      </div>

      {session.status === "published" && <section className="mt-4 flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-[0_6px_20px_rgba(16,32,29,.03)] sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)]"><FastForward size={18} /></span><div><p className="font-black">Vil du gå rett til treningen?</p><p className="mt-1 text-sm leading-5 text-[var(--ink-soft)]">Start uten å registrere oppmøte eller dele inn i lag.</p></div></div><Button variant="secondary" className="shrink-0" onClick={() => { setSkipSetupError(""); setConfirmSkipSetup(true); }}><FastForward size={17} />Hopp over oppsett</Button></section>}

      {!players.length ? <div className="mt-7"><EmptyState icon={<UsersRound size={24} />} title="Importer spillerlisten først" body="Legg til Hoopit-listen under Laginnstillinger, og gå deretter tilbake hit for å registrere oppmøte." action={<Link href="/team" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--orange)] px-4 text-sm font-semibold text-white">Gå til Laginnstillinger</Link>} /></div> : step === "check-in" ? <section className="mt-7 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Oppmøte</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Hvem er til stede i dag?</h2><p className="mt-2 text-sm text-[var(--ink-soft)]">Registrer oppmøte før du lager lag eller par.</p></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void toggleAll(true)}>Velg alle</Button><Button variant="ghost" size="sm" onClick={() => void toggleAll(false)}>Nullstill</Button></div></div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{players.map((player) => { const present = presentIds.has(player.id); return <button key={player.id} type="button" aria-pressed={present} onClick={() => void store.setPlayerPresent(sessionId, player.id, !present)} className={cn("flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition", present ? "border-[#83ad9c] bg-[#e8f3eb]" : "border-[var(--line)] bg-white hover:border-[#aaa69b]")}><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2", present ? "border-[#34745f] bg-[#34745f] text-white" : "border-[#c2c0b8]")}>{present && <Check size={16} strokeWidth={3} />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{player.fullName}</strong><small className="text-[var(--ink-soft)]">{player.jerseyNumber ? `#${player.jerseyNumber}` : "Uten nummer"}</small></span></button>; })}</div>
        <div className="mt-7 flex flex-col items-stretch justify-between gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center"><p className="text-sm font-semibold text-[var(--ink-soft)]">{presentPlayers.length < 2 ? "Registrer minst to spillere for å fortsette." : `${presentPlayers.length} spillere er klare for trekning.`}</p><Button disabled={presentPlayers.length < 2} onClick={() => setStep("groups")}>Fortsett til grupper<ChevronRight size={17} /></Button></div>
      </section> : <section className="mt-7 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Innstillinger for trekning</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Sett opp gruppene</h2><p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">Velg format og størrelse, og generer når du er klar.</p>
          <fieldset className="mt-6"><legend className="text-sm font-black">Format</legend><div className="mt-2 grid grid-cols-2 gap-2"><FormatButton active={groupingKind === "teams"} icon={<UsersRound size={18} />} label="Lag" onClick={() => setGroupingKind("teams")} /><FormatButton active={groupingKind === "pairs"} icon={<UserRoundCheck size={18} />} label="Par" onClick={() => setGroupingKind("pairs")} /></div></fieldset>
          {groupingKind === "teams" && <label className="mt-6 block text-sm font-black"><span>Antall lag</span><div className="mt-2 flex items-center rounded-2xl border border-[var(--line)] bg-white p-1"><button type="button" className="grid h-10 w-11 place-items-center rounded-xl text-xl font-bold hover:bg-black/5" onClick={() => setTeamCount((count) => Math.max(2, count - 1))} aria-label="Færre lag">−</button><input type="number" min={2} max={Math.max(2, presentPlayers.length)} value={effectiveTeamCount} onChange={(event) => setTeamCount(Math.max(2, Number(event.target.value) || 2))} className="h-10 min-w-0 flex-1 bg-transparent text-center text-lg font-black outline-none" /><button type="button" className="grid h-10 w-11 place-items-center rounded-xl text-xl font-bold hover:bg-black/5" onClick={() => setTeamCount((count) => Math.min(Math.max(2, presentPlayers.length), count + 1))} aria-label="Flere lag">+</button></div></label>}
          <div className="mt-6 rounded-2xl bg-[var(--paper)] p-4 text-sm leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--ink)]">{presentPlayers.length} registrert</strong><br />{groupingKind === "teams" ? `Det opprettes ${effectiveTeamCount} jevne lag.` : "Spillerne deles i par, med én trio ved behov."}</div>
          <Button className="mt-5 w-full" size="lg" disabled={presentPlayers.length < 2 || generating} onClick={() => void generate()}><Shuffle size={18} />{generating ? "Genererer…" : groups.length ? "Generer på nytt" : "Generer grupper"}</Button>
          <Button className="mt-2 w-full" variant="ghost" onClick={() => setStep("check-in")}><ChevronLeft size={17} />Endre oppmøte</Button>
        </div>

        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_35px_rgba(16,32,29,.05)] sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Forhåndsvisning</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{groupingKind === "teams" ? "Dagens lag" : "Dagens par"}</h2></div>{groupsReady && <Tag tone="green"><CheckCircle2 size={13} className="mr-1" />Klar</Tag>}</div>
          {attendanceStale || configurationStale ? <div className="mt-5 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-bold text-[#9c3913]">{attendanceStale ? "Oppmøtet er endret" : "Innstillingene er endret"} — generer på nytt før start.</div> : null}
          {groups.length ? <GroupsGrid groups={groups} players={players} className="mt-5" /> : <div className="mt-5 grid min-h-64 place-items-center rounded-[22px] border border-dashed border-[#c8c3b7] bg-white/40 px-6 text-center"><div><Shuffle className="mx-auto text-[var(--ink-soft)]" size={28} /><p className="mt-3 font-black">Trekningen vises her</p><p className="mt-1 text-sm text-[var(--ink-soft)]">Velg innstillinger og trykk deretter på «Generer grupper».</p></div></div>}
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            {session.status !== "published" && <p className="mb-3 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-bold text-[#9c3913]">Publiser øktplanen før økten startes.</p>}
            {startError && <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{startError}</p>}
            <Button size="lg" className="w-full" disabled={!groupsReady || session.status !== "published" || starting} onClick={() => void startWorkout()}><CirclePlay size={19} />{starting ? "Starter…" : "Start økten"}</Button>
            <p className="mt-3 text-center text-xs leading-5 text-[var(--ink-soft)]"><LockKeyhole size={12} className="mr-1 inline" />Når økten startes, låses oppmøtet og gruppene.</p>
          </div>
        </div>
      </section>}
    </main>
    <Modal open={confirmSkipSetup} onClose={() => { if (!skippingSetup) setConfirmSkipSetup(false); }} title="Starte uten oppmøte og grupper?" description="Du går rett til treningen. Eventuelt oppmøte og grupper som allerede er lagret, beholdes, men brukes ikke i denne gjennomføringen." size="sm">
      {skipSetupError && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{skipSetupError}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmSkipSetup(false)} disabled={skippingSetup}>Fortsett med oppsett</Button><Button onClick={() => void startWithoutSetup()} disabled={skippingSetup}><FastForward size={17} />{skippingSetup ? "Starter …" : "Hopp over og start"}</Button></div>
    </Modal>
  </div></AppShell>;
}

export function WorkoutSession({ sessionId }: { sessionId: string }) {
  const store = useGrep();
  const session = store.sessions.find((entry) => entry.id === sessionId);
  // The plan's own team, not whichever team the sidebar has selected: a coach
  // can open a session link for a team they are not currently switched to.
  const sessionTeam = store.teams.find((team) => team.id === session?.teamId);
  const players = useMemo(() => store.players.filter((player) => player.teamId === session?.teamId).sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")), [session?.teamId, store.players]);
  const presentIds = useMemo(() => new Set(store.attendance.filter((entry) => entry.sessionId === sessionId && entry.isPresent).map((entry) => entry.playerId)), [sessionId, store.attendance]);
  const presentPlayers = players.filter((player) => presentIds.has(player.id));
  const setupSkipped = session?.groupingKind == null;
  const groupingKind = session?.groupingKind ?? "teams";
  const groups = setupSkipped ? [] : store.groupings.find((entry) => entry.sessionId === sessionId && entry.kind === groupingKind)?.groups ?? [];
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

  if (!session) return <AppShell><div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<CalendarClock size={23} />} title="Økten ble ikke funnet" body="Den kan ha blitt slettet eller tilhøre et annet lag." /></div></AppShell>;

  return <AppShell immersive><div className="min-h-screen pb-28 sm:pb-16">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--ink)] px-3 py-3 text-white shadow-lg sm:px-8 sm:py-4">
      <div className="mx-auto flex max-w-[1080px] items-center gap-2 sm:gap-4"><Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="Tilbake til øktkalenderen"><ArrowLeft size={19} /></Link>{sessionTeam && <TeamCrest team={sessionTeam} className="border-white/15 bg-white/10 text-white" />}<div className="min-w-0 flex-1">{finished ? <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-white/55 sm:text-[11px]"><CheckCircle2 size={13} />Økten er avsluttet</div> : <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-[var(--lime)] sm:text-[11px]"><span className="h-2 w-2 rounded-full bg-[var(--lime)]" />Økten pågår</div>}<h1 className="mt-0.5 truncate text-base font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div><Button variant="secondary" className="h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => setOverviewOpen(true)} aria-label="Øktoversikt"><ListChecks size={17} /><span className="hidden sm:inline">Oversikt</span></Button>{!setupSkipped && <Button variant="secondary" className="h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => setTeamsOpen(true)} aria-label={`Vis ${groupingKind === "pairs" ? "par" : "lag"}`}><UsersRound size={17} /><span className="hidden sm:inline">{groupingKind === "pairs" ? "Par" : "Lag"}</span></Button>}{!finished && <Button className="hidden sm:inline-flex" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt økten</Button>}</div>
    </header>

    <main ref={runnerTop} className="mx-auto max-w-[1080px] scroll-mt-24 px-4 pt-5 sm:px-8 sm:pt-8">
      <div className="grid grid-cols-3 gap-2 sm:gap-3"><InfoPill icon={<Clock3 size={18} />} label="Varighet" value={minutesLabel(session.plannedDurationMinutes)} /><InfoPill icon={<MapPin size={18} />} label="Sted" value={session.venue || "Ikke angitt"} /><InfoPill icon={setupSkipped ? <FastForward size={18} /> : <UsersRound size={18} />} label={setupSkipped ? "Oppsett" : "Registrert"} value={setupSkipped ? "Hoppet over" : `${presentPlayers.length} spillere`} /></div>

      {session.blocks.length ? <>
        <nav className="hide-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Øktens bolker">{session.blocks.map((block, index) => <button key={block.id} type="button" aria-current={index === safeBlockIndex ? "step" : undefined} onClick={() => showBlock(index)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-black transition", index === safeBlockIndex ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--ink)]")}><span className={cn("grid h-6 w-6 place-items-center rounded-lg text-[11px]", index === safeBlockIndex ? "bg-white/15" : "bg-[var(--paper-deep)] text-[var(--ink)]")}>{index + 1}</span>{block.title}</button>)}</nav>

        {currentBlock && <section aria-labelledby="current-block-title" className="mt-4 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(16,32,29,.07)]"><header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-deep)] px-4 py-4 sm:px-6 sm:py-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--orange)] text-sm font-black text-white">{safeBlockIndex + 1}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">Gjeldende bolk</p><h2 id="current-block-title" className="truncate text-2xl font-black tracking-[-.04em] sm:text-3xl">{currentBlock.title}</h2></div><Tag tone="neutral">{blockDuration(currentBlock)} min</Tag></header>{currentBlock.notes && <div className="border-b border-[var(--line)] bg-[#f8f5ed] px-4 py-3 text-sm font-semibold leading-6 text-[var(--ink-soft)] sm:px-6"><span className="mr-2 text-[10px] font-black uppercase tracking-[.11em] text-[var(--orange)]">Notat for bolken</span>{currentBlock.notes}</div>}<div className="grid gap-3 p-3 sm:p-5">{currentBlock.items.length ? currentBlock.items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="group rounded-[20px] border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--ink)] hover:shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-deep)] text-xs font-black">{itemIndex + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black tracking-[-.025em]">{item.title}</h3><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{item.durationMinutes} min</span></div>{item.description && <p className="mt-2 clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{item.description}</p>}{item.coachingNotes && <div className="mt-3 rounded-xl bg-[#fff0e8] px-3.5 py-3"><p className="text-[10px] font-black uppercase tracking-[.11em] text-[#9c3913]">Trenermoment</p><p className="mt-1 text-sm font-semibold leading-6">{item.coachingNotes}</p></div>}<span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[var(--orange)]"><CirclePlay size={15} />Vis øvelsen</span></div></div></button>) : <p className="py-8 text-center text-sm text-[var(--ink-soft)]">Ingen aktiviteter i denne bolken.</p>}</div></section>}

        <div className="mt-5 hidden items-center justify-between gap-3 sm:flex">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Angre start</Button> : <Button variant="secondary" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Forrige bolk</Button>}<p className="text-sm font-black text-[var(--ink-soft)]">Bolk {safeBlockIndex + 1} av {session.blocks.length}</p>{safeBlockIndex < session.blocks.length - 1 ? <Button onClick={() => showBlock(safeBlockIndex + 1)}>Neste bolk<ChevronRight size={18} /></Button> : !finished ? <Button onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt økten</Button> : <span />}</div>
      </> : <div className="mt-5"><EmptyState icon={<ListChecks size={24} />} title="Ingen aktiviteter i denne planen" body="Økten er låst og har ingen bolker å vise." /></div>}

      {finished && <p className="mt-5 text-center text-sm font-bold text-[var(--ink-soft)]">Avsluttet {formatSessionDate(session.completedAt ?? null)}</p>}
    </main>

    {session.blocks.length > 0 && <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(16,32,29,.1)] backdrop-blur-xl sm:hidden" aria-label="Navigasjon mellom bolker">{safeBlockIndex === 0 && !finished ? <Button variant="secondary" className="min-w-0 px-3" onClick={() => { setUndoStartError(""); setConfirmUndoStart(true); }}><RotateCcw size={17} />Angre start</Button> : <Button variant="secondary" className="min-w-0 px-3" disabled={safeBlockIndex === 0} onClick={() => showBlock(safeBlockIndex - 1)}><ChevronLeft size={18} />Forrige</Button>}<span className="px-1 text-center text-xs font-black text-[var(--ink-soft)]">{safeBlockIndex + 1} / {session.blocks.length}</span>{safeBlockIndex < session.blocks.length - 1 ? <Button className="min-w-0 px-3" onClick={() => showBlock(safeBlockIndex + 1)}>Neste<ChevronRight size={18} /></Button> : !finished ? <Button className="min-w-0 px-3" onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} />Avslutt</Button> : <Button className="min-w-0 px-3" variant="secondary" onClick={() => setOverviewOpen(true)}><ListChecks size={17} />Oversikt</Button>}</nav>}

    {!setupSkipped && <Modal open={teamsOpen} onClose={() => setTeamsOpen(false)} title={groupingKind === "pairs" ? "Dagens par" : "Dagens lag"} description={`${presentPlayers.length} registrerte spillere · gruppene er låst for denne økten`} size="lg">
      {groups.length ? <GroupsGrid groups={groups} players={players} /> : <div className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><UsersRound className="mx-auto text-[var(--ink-soft)]" size={25} /><p className="mt-2 text-sm font-bold">Ingen lagrede grupper er tilgjengelige.</p></div>}
    </Modal>}
    <Modal open={overviewOpen} onClose={() => setOverviewOpen(false)} title="Øktoversikt" description={`${session.blocks.length} ${session.blocks.length === 1 ? "bolk" : "bolker"} · ${minutesLabel(session.plannedDurationMinutes)}`} size="lg">
      {session.objective && <section className="mb-4 rounded-2xl bg-[var(--paper)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--orange)]">Mål for økten</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--ink-soft)]">{session.objective}</p></section>}
      <div className="grid gap-3">{session.blocks.map((block, index) => <button key={block.id} type="button" onClick={() => showBlock(index)} aria-label={`Gå til ${block.title}`} className={cn("rounded-2xl border p-4 text-left transition hover:border-[var(--ink)]", index === safeBlockIndex ? "border-[#83ad9c] bg-[#e8f3eb]" : "border-[var(--line)] bg-white")}><div className="flex items-center gap-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black", index === safeBlockIndex ? "bg-[#34745f] text-white" : "bg-[var(--paper-deep)]")}>{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate">{block.title}</strong><small className="text-[var(--ink-soft)]">{block.items.length} {block.items.length === 1 ? "aktivitet" : "aktiviteter"}</small></span><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{blockDuration(block)} min</span><ChevronRight size={17} className="shrink-0 text-[var(--ink-soft)]" /></div>{block.items.length > 0 && <ul className="mt-3 grid gap-1.5 pl-12 text-xs text-[var(--ink-soft)]">{block.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3"><span>{item.title}</span><span className="shrink-0 font-bold">{item.durationMinutes} min</span></li>)}</ul>}</button>)}</div>
      {session.notes && <section className="mt-4 rounded-2xl border border-[var(--line)] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--orange)]">Øktnotater</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">{session.notes}</p></section>}
    </Modal>
    <Modal open={confirmUndoStart} onClose={() => { if (!undoingStart) setConfirmUndoStart(false); }} title="Vil du angre starten av økten?" description="Økten går tilbake til «Klar til start». Oppmøte og grupper beholdes, slik at du kan korrigere dem eller starte på nytt." size="sm">
      {undoStartError && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{undoStartError}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmUndoStart(false)} disabled={undoingStart}>Fortsett økten</Button><Button onClick={() => void undoStart()} disabled={undoingStart}><RotateCcw size={17} />{undoingStart ? "Angrer …" : "Angre start"}</Button></div>
    </Modal>
    <Modal open={confirmFinish} onClose={() => { if (!finishing) setConfirmFinish(false); }} title="Vil du avslutte denne økten?" description="Økten flyttes til «Gjennomførte». Planen, oppmøtet og gruppene forblir låst som dokumentasjon." size="sm">
      {finishError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-[var(--danger)]">{finishError}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>Fortsett økten</Button><Button onClick={() => void finishWorkout()} disabled={finishing}><Flag size={17} />{finishing ? "Avslutter…" : "Avslutt økten"}</Button></div>
    </Modal>
    <Modal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)} title={selectedItem?.title ?? "Øvelse"} description={selectedItem ? `${selectedItem.durationMinutes} minutter · skrivebeskyttet` : undefined} size="lg">
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
  return <div className={cn("grid gap-3", !compact && "sm:grid-cols-2", className)}>{groups.map((group) => <article key={group.id} className={cn("rounded-2xl border border-[var(--line)] bg-white", compact ? "p-3.5" : "p-4")}><p className="text-xs font-black uppercase tracking-[.09em] text-[var(--ink-soft)]">{group.label}</p><ul className="mt-2 grid gap-1.5">{group.playerIds.map((id) => <li key={id} className="flex items-center gap-2 text-sm font-bold"><span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]" />{players.find((player) => player.id === id)?.fullName ?? "Fjernet spiller"}</li>)}</ul></article>)}</div>;
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
    {item.description && <section><p className="text-xs font-black uppercase tracking-[.12em] text-[var(--orange)]">Instruksjoner</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">{item.description}</p></section>}
    {item.coachingNotes && <section className="rounded-2xl bg-[#fff0e8] p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-[#9c3913]">Trenermoment</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{item.coachingNotes}</p></section>}
    {!item.mediaUrl && !item.description && !item.coachingNotes && <p className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center text-sm text-[var(--ink-soft)]">Ingen flere øvelsesdetaljer er tilgjengelige.</p>}
  </div>;
}

function isGroupingStale(groups: PlayerGroup[], presentIds: Set<string>) {
  if (!groups.length) return false;
  const groupedIds = new Set(groups.flatMap((group) => group.playerIds));
  return groupedIds.size !== presentIds.size || [...presentIds].some((id) => !groupedIds.has(id));
}
