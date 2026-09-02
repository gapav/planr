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
  Shuffle,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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

  return <AppShell><div className="min-h-screen pb-16">
    <header className="border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-xl sm:px-8">
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
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SessionItem | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finished = session?.status === "completed";

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

  return <AppShell><div className="min-h-screen pb-16">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--ink)] px-4 py-4 text-white shadow-lg sm:px-8">
      <div className="mx-auto flex max-w-[1080px] items-center gap-3 sm:gap-4"><Link href="/sessions" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="Back to sessions"><ArrowLeft size={19} /></Link><div className="min-w-0 flex-1">{finished ? <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.14em] text-white/55"><CheckCircle2 size={13} />Workout finished</div> : <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.14em] text-[var(--lime)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lime)]" />Workout in progress</div>}<h1 className="mt-0.5 truncate text-lg font-black tracking-[-.035em] sm:text-2xl">{session.title}</h1></div><Button variant="secondary" onClick={() => setTeamsOpen(true)}><UsersRound size={17} /><span className="hidden sm:inline">Show {groupingKind === "pairs" ? "pairs" : "teams"}</span><span className="sm:hidden">Groups</span></Button>{!finished && <Button onClick={() => { setFinishError(""); setConfirmFinish(true); }}><Flag size={17} /><span className="hidden sm:inline">Finish workout</span><span className="sm:hidden">Finish</span></Button>}</div>
    </header>

    <main className="mx-auto max-w-[1080px] px-4 pt-7 sm:px-8 sm:pt-9">
      <div className="grid gap-3 sm:grid-cols-3"><InfoPill icon={<Clock3 size={18} />} label="Duration" value={minutesLabel(session.plannedDurationMinutes)} /><InfoPill icon={<MapPin size={18} />} label="Venue" value={session.venue || "Not set"} /><InfoPill icon={<UsersRound size={18} />} label="Checked in" value={`${presentPlayers.length} players`} /></div>

      <section className="mt-7 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_12px_40px_rgba(16,32,29,.07)] sm:p-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Workout plan</p><h2 className="mt-1 text-3xl font-black tracking-[-.045em]">The whole session</h2>{session.objective && <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{session.objective}</p>}{finished && <p className="mt-2 text-sm font-bold text-[var(--ink-soft)]">Finished {formatSessionDate(session.completedAt ?? null)}</p>}</div><Tag tone="neutral"><LockKeyhole size={12} className="mr-1" />{finished ? "Completed" : "Read only"}</Tag></div></section>

      {session.blocks.length ? <div className="mt-5 grid gap-5">{session.blocks.map((block, blockIndex) => <section key={block.id} className="overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]"><header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-deep)] px-4 py-4 sm:px-6"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-xs font-black text-white">{blockIndex + 1}</span><h3 className="min-w-0 flex-1 truncate text-xl font-black tracking-[-.03em]">{block.title}</h3><Tag tone="neutral">{blockDuration(block)} min</Tag></header>{block.notes && <div className="border-b border-[var(--line)] bg-[#f8f5ed] px-4 py-3 text-sm font-semibold leading-6 text-[var(--ink-soft)] sm:px-6"><span className="mr-2 text-[10px] font-black uppercase tracking-[.11em] text-[var(--orange)]">Block note</span>{block.notes}</div>}<div className="grid gap-3 p-4 sm:p-5">{block.items.length ? block.items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="group rounded-[20px] border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--ink)] hover:shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-deep)] text-xs font-black">{itemIndex + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><h4 className="text-lg font-black tracking-[-.025em]">{item.title}</h4><span className="shrink-0 text-sm font-black text-[var(--ink-soft)]">{item.durationMinutes} min</span></div>{item.description && <p className="mt-2 clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{item.description}</p>}{item.coachingNotes && <div className="mt-3 rounded-xl bg-[#fff0e8] px-3.5 py-3"><p className="text-[10px] font-black uppercase tracking-[.11em] text-[#9c3913]">Coaching point</p><p className="mt-1 text-sm font-semibold leading-6">{item.coachingNotes}</p></div>}<span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[var(--orange)]"><CirclePlay size={15} />View exercise</span></div></div></button>) : <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No activities in this block.</p>}</div></section>)}</div> : <div className="mt-5"><EmptyState icon={<ListChecks size={24} />} title="No activities in this plan" body="The session is locked and has no workout blocks to display." /></div>}

      {session.notes && <section className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--orange)]">Session notes</p><p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{session.notes}</p></section>}
    </main>

    <Modal open={teamsOpen} onClose={() => setTeamsOpen(false)} title={groupingKind === "pairs" ? "Today’s pairs" : "Today’s teams"} description={`${presentPlayers.length} checked-in players · groups are locked for this workout`} size="lg">
      {groups.length ? <GroupsGrid groups={groups} players={players} /> : <div className="rounded-2xl bg-[var(--paper)] px-5 py-8 text-center"><UsersRound className="mx-auto text-[var(--ink-soft)]" size={25} /><p className="mt-2 text-sm font-bold">No saved groups are available.</p></div>}
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
  return <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)]">{icon}</span><span className="min-w-0"><small className="block text-[10px] font-black uppercase tracking-[.12em] text-[var(--ink-soft)]">{label}</small><strong className="mt-0.5 block truncate text-sm">{value}</strong></span></div>;
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
