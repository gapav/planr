"use client";

import { ArrowRight, CalendarDays, CalendarRange, Clock3, LayoutList, MapPin, Pencil, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HelpTip } from "@/components/help-tip";
import { useGrep } from "@/components/app-provider";
import { CopySessionDialog, ReopenSessionDialog, SessionMenu } from "@/components/session-actions";
import { PageHeading } from "@/components/page-heading";
import { FocusDialog } from "@/components/focus-dialog";
import { SeasonOverview } from "@/components/season-overview";
import { Avatar, Button, EmptyState, Modal, Tag } from "@/components/ui";
import { dayKey } from "@/lib/fixtures";
import { focusAt, focusSpanLabel, freeFocusSpan, nextFocus, noteLines, weekOf } from "@/lib/focus";
import { calendarMonthGroups, deriveSessionTab, groupSessionsByMonth, isNearTerm, relativeDayLabel, sessionDuration, sessionPlanProgress, sessionPlanSummary, UNTITLED_SESSION_TITLE } from "@/lib/session";
import type { FocusPeriod, FocusPeriodInput, PlannedSession, SessionTab } from "@/lib/types";
import { cn, minutesLabel, sessionDateParts } from "@/lib/utils";

const tabs: Array<{ id: SessionTab; label: string }> = [{ id: "upcoming", label: "Kommende" }, { id: "drafts", label: "Utkast" }, { id: "past", label: "Gjennomførte" }];

export default function SessionsPage() {
  return <Suspense><SessionsRoute /></Suspense>;
}

function SessionsRoute() {
  const search = useSearchParams();
  const view = search.get("view");
  const initialTab: SessionTab = view === "past" || view === "drafts" ? view : "upcoming";
  const initialPlanningView = search.get("mode") === "season" ? "season" : "calendar";
  const initialSeasonFocus = search.get("focus");
  return <SessionsContent key={`${initialTab}-${initialPlanningView}-${initialSeasonFocus ?? ""}`} initialTab={initialTab} initialPlanningView={initialPlanningView} initialSeasonFocus={initialSeasonFocus} />;
}

function SessionsContent({ initialTab, initialPlanningView, initialSeasonFocus }: { initialTab: SessionTab; initialPlanningView: "calendar" | "season"; initialSeasonFocus: string | null }) {
  const { sessions, fixtures, currentTeam, focusPeriods, user, createSession, deleteSession } = useGrep(); const [tab, setTab] = useState<SessionTab>(initialTab); const [planningView, setPlanningView] = useState<"calendar" | "season">(initialPlanningView); const [creating, setCreating] = useState(false); const [pendingDelete, setPendingDelete] = useState<PlannedSession | null>(null); const [deleting, setDeleting] = useState(false); const [copySource, setCopySource] = useState<PlannedSession | null>(null); const [reopenSource, setReopenSource] = useState<PlannedSession | null>(null); const router = useRouter();
  const current = useMemo(() => sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === tab).sort((a, b) => tab === "drafts" ? b.updatedAt.localeCompare(a.updatedAt) : tab === "upcoming" ? (a.startsAt ?? "").localeCompare(b.startsAt ?? "") : (b.startsAt ?? "").localeCompare(a.startsAt ?? "")), [sessions, currentTeam, tab]);
  const counts = useMemo(() => tabs.reduce((acc, entry) => { acc[entry.id] = sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === entry.id).length; return acc; }, {} as Record<SessionTab, number>), [sessions, currentTeam]);
  // The nearest session is lifted out of its month so the one plan being
  // prepared for is not one card among ten identical ones.
  const hero = tab === "upcoming" ? current[0] : undefined; const listed = hero ? current.slice(1) : current;
  async function startSession(startsAt?: string) { setCreating(true); try { const id = await createSession(startsAt); router.push(`/sessions/${id}/edit`); } catch { /* The provider shows the failure notice. */ } finally { setCreating(false); } }
  function choosePlanningView(next: "calendar" | "season") {
    setPlanningView(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "season") params.set("mode", "season");
    else { params.delete("mode"); params.delete("focus"); }
    const query = params.toString();
    router.replace(`/sessions${query ? `?${query}` : ""}`, { scroll: false });
  }
  // A failed delete rolls itself back in the provider and surfaces a notice, so
  // the dialog closes either way.
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); try { await deleteSession(pendingDelete.id); } catch { /* notice is shown by the provider */ } finally { setDeleting(false); setPendingDelete(null); } }
  if (!currentTeam) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20">{user?.isGlobalAdmin
    ? <EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag" body="Øktene tilhører et lag. Opprett lag og tildel trenere fra systemadministrasjonen." action={<Link href="/admin" className="grep-action">Gå til administrasjon</Link>} />
    : <EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag ennå" body="Øktene tilhører et lag, slik at de riktige trenerne kan se og redigere dem. Systemadministratoren gir deg tilgang." />}</div></AppShell>;
  return <AppShell><div className={cn("grep-page grep-calendar", planningView === "season" && "grep-season-page")}><PageHeading eyebrow={currentTeam.shortName} title={planningView === "season" ? "Sesongoverblikk" : "Øktkalender"} description={planningView === "season" ? "Fokus, kamper og treninger gjennom hele sesongen." : <>En god plan <ArrowRight size={16} className="inline-block -mt-0.5 align-middle text-[var(--accent)]" aria-hidden /> et samkjørt trenerteam.</>} actions={<>{(planningView === "season" || tab !== "past") && <Button size="lg" onClick={() => void startSession()} disabled={creating}><Plus size={18} />{creating ? "Oppretter…" : "Opprett økt"}</Button>}<HelpTip topic={planningView === "season" ? "season-overview" : "sessions-calendar"} /></>} />
    <div className="grep-planning-views grep-segments" role="group" aria-label="Planvisning"><button type="button" aria-pressed={planningView === "calendar"} onClick={() => choosePlanningView("calendar")}><CalendarDays size={16} />Økter</button><button type="button" aria-pressed={planningView === "season"} onClick={() => choosePlanningView("season")}><CalendarRange size={16} />Sesongoverblikk</button></div>
    {planningView === "season" ? <SeasonOverview teamId={currentTeam.id} sessions={sessions} fixtures={fixtures ?? []} focusPeriods={focusPeriods} initialFocus={initialSeasonFocus} onCreateTraining={startSession} /> : <>
    <CurrentFocus onOpenSeason={() => choosePlanningView("season")} />
    <TabSelect tab={tab} onSelect={setTab} counts={counts} />
    {tab === "drafts"
      // Drafts sort by when they were last touched, so a calendar heading would
      // group them by a date the order does not follow. One card holds them the
      // way a month holds its sessions.
      ? (current.length
        ? <ul className="grep-session-month grep-session-rows">{current.map((session) => <SessionRow key={session.id} session={session} tab={tab} onCopy={() => setCopySource(session)} onReopen={() => setReopenSource(session)} onDelete={() => setPendingDelete(session)} />)}</ul>
        : <div className="grep-session-sections"><EmptyState icon={<Sparkles size={22} />} title="Ingen økter under planlegging" body="Start en øktplan og inviter trenerteamet til å bidra." /></div>)
      // The empty state leads when nothing is planned — publishing a draft is
      // the thing to do then.
      : tab === "upcoming"
      ? <div className="grep-session-sections">
        {!current.length && <EmptyState icon={<CalendarDays size={22} />} title="Ingen planlagte økter ennå" body="Publiser et utkast, så vises det automatisk her." />}
        {hero && <section><ul><SessionRow session={hero} tab={tab} hero onCopy={() => setCopySource(hero)} onReopen={() => setReopenSource(hero)} onDelete={() => setPendingDelete(hero)} /></ul></section>}
        {calendarMonthGroups(listed).map((group) => <MonthSection key={group.key} group={group} tab={tab} onCopy={setCopySource} onReopen={setReopenSource} onDelete={setPendingDelete} />)}
      </div>
      : (current.length
        ? <div className="grep-session-sections">{groupSessionsByMonth(listed).map((group) => <MonthSection key={group.key} group={group} tab={tab} onCopy={setCopySource} onReopen={setReopenSource} onDelete={setPendingDelete} />)}</div>
        : <div className="grep-session-sections"><EmptyState icon={<CalendarDays size={22} />} title="Ingen gjennomførte økter" body="Gjennomførte økter samles her for senere bruk." /></div>)}
    </>}
    {/* Gjennomførte is a record of what has been, so it ends where the last
        workout did. The new plan belongs under the tabs you plan in. */}
    {copySource && <CopySessionDialog session={copySource} onClose={() => setCopySource(null)} />}
    {reopenSource && <ReopenSessionDialog session={reopenSource} onClose={() => setReopenSource(null)} />}
    <Modal open={Boolean(pendingDelete)} onClose={() => { if (!deleting) setPendingDelete(null); }} title="Vil du slette denne økten?" description="Planen, alle bolkene og aktivitetene blir slettet for hele laget. Dette kan ikke angres." size="sm">
      <p className="rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-semibold">{pendingDelete?.title}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Behold økten</Button><Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}><Trash2 size={17} />{deleting ? "Sletter…" : "Slett økt"}</Button></div>
    </Modal>
  </div></AppShell>;
}

// One month of the calendar: the heading and the sessions in it, as one card.
function MonthSection({ group, tab, onCopy, onReopen, onDelete }: { group: { key: string; label: string; sessions: PlannedSession[] }; tab: SessionTab; onCopy(session: PlannedSession): void; onReopen(session: PlannedSession): void; onDelete(session: PlannedSession): void }) {
  return <section>
    <h2 className="grep-session-month-heading">{group.label}<span>{" · "}{group.sessions.length} {group.sessions.length === 1 ? "økt" : "økter"}</span></h2>
    <ul className="grep-session-month grep-session-rows">{group.sessions.map((session) => tab === "upcoming" && isNearTerm(session)
      ? <SessionRow key={session.id} session={session} tab={tab} onCopy={() => onCopy(session)} onReopen={() => onReopen(session)} onDelete={() => onDelete(session)} />
      : <CompactSessionRow key={session.id} session={session} onCopy={() => onCopy(session)} onReopen={() => onReopen(session)} onDelete={() => onDelete(session)} />)}</ul>
  </section>;
}

const focusDateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });

/**
 * The focus running today, at the head of the calendar: what the sessions
 * below are meant to steer. It is a run of weeks, set and laid out in the
 * season overview; here it can be read and edited, and when nothing is running
 * the card says what comes next and offers to set one from this week.
 *
 * Still no accent: in this list the apricot means "the next thing you act on",
 * and a focus is context for the plans, not one of them.
 */
function CurrentFocus({ onOpenSeason }: { onOpenSeason(): void }) {
  const { currentTeam, focusPeriods, user } = useGrep();
  const [dialog, setDialog] = useState<{ focus: FocusPeriod | null; initial: FocusPeriodInput } | null>(null);
  const today = dayKey(new Date());
  const focus = focusAt(focusPeriods, currentTeam?.id, today);
  const upcoming = focus ? null : nextFocus(focusPeriods, currentTeam?.id, today);
  // The whole coaching team writes the same focus, so the card says whose
  // words are standing — your own name included, since "who set this" is the
  // question the by-line answers. A coach who has left the team is no longer
  // in `members`, so only the credit survives.
  const author = focus ? currentTeam?.members.find((member) => member.id === focus.updatedBy) ?? null : null;
  const creditName = focus ? focus.updatedBy === user?.id ? "deg" : author?.fullName ?? "en tidligere trener" : null;
  if (!currentTeam) return null;
  const points = focus ? noteLines(focus.notes) : [];
  return <section className={cn("grep-current-focus", !focus && "is-empty")} aria-labelledby="current-focus-heading">
    <div className="grep-current-focus-head">
      <h2 id="current-focus-heading"><Target size={14} />Nåværende fokus{focus && <span>· {focusSpanLabel(focus)}</span>}</h2>
      <button type="button" className="grep-current-focus-link" onClick={onOpenSeason}>Se sesongen<ArrowRight size={14} aria-hidden /></button>
    </div>
    {focus ? <>
      <strong className="grep-current-focus-title">{focus.title}</strong>
      {focus.note.trim() && <p>{focus.note}</p>}
      {points.length > 0 && <ul>{points.map((point, index) => <li key={index}>{point}</li>)}</ul>}
      <div className="grep-current-focus-foot">
        <span className="grep-session-focus-by">
          {author && <Avatar name={author.fullName} initials={author.initials} color={author.color} size="sm" />}
          <span>Satt av {creditName} · {focusDateFormat.format(new Date(focus.updatedAt))}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => setDialog({ focus, initial: { title: focus.title, note: focus.note, notes: focus.notes, startsOn: focus.startsOn, weeks: focus.weeks } })}><Pencil size={14} />Rediger fokus</Button>
      </div>
    </> : <div className="grep-current-focus-foot">
      <p>{upcoming ? <>Ingen fokus nå. Neste er <strong>{upcoming.title}</strong> fra uke {weekOf(upcoming.startsOn)}.</> : "Ingen fokus nå. Hva skal laget jobbe mest med de neste ukene?"}</p>
      <Button variant="secondary" size="sm" onClick={() => setDialog({ focus: null, initial: { title: "", note: "", notes: "", ...freeFocusSpan(focusPeriods, currentTeam.id, today) } })}><Plus size={14} />Sett fokus</Button>
    </div>}
    {dialog && <FocusDialog focus={dialog.focus} initial={dialog.initial} onClose={() => setDialog(null)} />}
  </section>;
}

// Full labels stay visible on desktop; the native selector fits narrow screens.
function TabSelect({ tab, onSelect, counts }: { tab: SessionTab; onSelect(tab: SessionTab): void; counts: Record<SessionTab, number> }) {
  return <div className="grep-calendar-controls">
    <div className="grep-segments grep-calendar-desktop-tabs" role="group" aria-label="Vis økter">
      {tabs.map((entry) => <button key={entry.id} aria-pressed={tab === entry.id} onClick={() => onSelect(entry.id)}>{entry.label}<span>{counts[entry.id]}</span></button>)}
    </div>
    <label className="grep-calendar-mobile-select"><span>Vis økter</span><select value={tab} onChange={(event) => onSelect(event.target.value as SessionTab)}>{tabs.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} ({counts[entry.id]})</option>)}</select></label>
  </div>;
}

// The date badge the match calendar wears, told the way a training session has
// to be read: the weekday first, because a coach plans "onsdag", and the month
// under it so a plan five weeks out still says which one it is.
function SessionDate({ session, live }: { session: PlannedSession; live: boolean }) {
  const date = sessionDateParts(session.startsAt);
  if (!date) return <span className={cn("grep-match-date", live && "grep-session-live")}><strong>—</strong><span>uten dato</span></span>;
  return <span className={cn("grep-match-date", live && "grep-session-live")}><span>{date.weekday}</span><strong>{date.day}</strong><span>{date.month}</span></span>;
}

// The row's date column, on the tabs that are ordered by date. A session still
// waiting for one keeps the column's width so the titles stay in line, and says
// nothing rather than repeating "uten dato" down the card.
function SessionDay({ date }: { date: ReturnType<typeof sessionDateParts> }) {
  return <span className="grep-session-day">{date ? `${date.weekday} ${date.day}` : ""}</span>;
}

function SessionRow({ session, tab, hero = false, onCopy, onReopen, onDelete }: { session: PlannedSession; tab: SessionTab; hero?: boolean; onCopy(): void; onReopen(): void; onDelete(): void }) {
  const { currentTeam, user } = useGrep(); const built = sessionDuration(session); const progress = sessionPlanProgress(session); const updater = currentTeam?.members.find((member) => member.id === session.updatedBy) ?? currentTeam?.members[0];
  const inProgress = session.status === "in_progress"; const date = sessionDateParts(session.startsAt); const relative = relativeDayLabel(session.startsAt); const [menuOpen, setMenuOpen] = useState(false);
  // Every row in a tab shares that tab's status, so only the one status that
  // does set a row apart is worth a chip. Same for the coach: it is the
  // signed-in one on every row until a team has more than one.
  const otherUpdater = updater && updater.id !== user?.id ? updater : null;
  const blockTitles = hero ? session.blocks.map((block) => block.title.trim()).filter(Boolean) : [];
  // The whole card opens the plan — Start and Rediger live in the plan view, so
  // the row carries no action but the menu, which opts back in to pointer
  // events. An open menu has to outrank the rows stacked after it.
  return <li className={cn(hero ? "grep-session-featured" : "grep-session-row", menuOpen && "grep-session-open")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="grep-session-hit" />
    {hero ? <SessionDate session={session} live={inProgress} /> : tab !== "drafts" && <SessionDay date={date} />}
    <span className="grep-session-copy">
      {hero && <h2 className="grep-eyebrow">Neste økt</h2>}
      <span className="grep-session-headline"><h3>{session.title}</h3>{inProgress && <Tag tone="orange">Pågår</Tag>}{relative && <Tag tone={relative === "I dag" && !inProgress ? "orange" : "neutral"}>{relative}</Tag>}</span>
      <span className="grep-match-meta">
        {/* Drafts are ordered by what was last touched, so they carry no date
            column to line up under; the few that do have a date say so here. */}
        <span><Clock3 size={14} />{date ? `${tab === "drafts" ? `${date.weekday} ${date.day} · ` : ""}${date.time} · ${minutesLabel(session.plannedDurationMinutes)}` : `${minutesLabel(session.plannedDurationMinutes)} planlagt`}</span>
        <span><MapPin size={14} /><span className="grep-session-venue">{session.venue || "Sted ikke angitt"}</span></span>
        <span><LayoutList size={14} />{session.blocks.length} {session.blocks.length === 1 ? "bolk" : "bolker"}</span>
        {otherUpdater && <span><Avatar name={otherUpdater.fullName} initials={otherUpdater.initials} color={otherUpdater.color} size="sm" />{otherUpdater.fullName}</span>}
      </span>
      {blockTitles.length > 0 && <span className="grep-session-blocks">{blockTitles.join(" · ")}</span>}
      {tab === "drafts" && <span className="grep-session-progress"><span className="grep-session-bar"><span style={{ width: `${progress}%` }} /></span><small>{built} av {session.plannedDurationMinutes} min planlagt</small></span>}
    </span>
    <span className="grep-session-actions">
      <SessionMenu session={session} open={menuOpen} onOpenChange={setMenuOpen} onCopy={onCopy} onReopen={onReopen} onDelete={onDelete} />
    </span>
  </li>;
}

// Sessions further out than the coming week, and every finished one, are things
// you read rather than act on: the same row, one line tall. Still one line — the
// point of the compact row is that a plan four weeks out does not compete with
// the one on Thursday. The date column has the day, the middle the session's
// name, and the right-hand end how much of the plan is there — a bar of built
// against planned minutes, so the ones still needing work show down the month
// at a glance. Everything else is one tap away in the plan itself.
function CompactSessionRow({ session, onCopy, onReopen, onDelete }: { session: PlannedSession; onCopy(): void; onReopen(): void; onDelete(): void }) {
  const date = sessionDateParts(session.startsAt); const [menuOpen, setMenuOpen] = useState(false);
  return <li className={cn("grep-session-row grep-session-compact", menuOpen && "grep-session-open")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="grep-session-hit" />
    <SessionDay date={date} />
    <span className="grep-session-copy"><span className="grep-session-headline"><h3>{session.title.trim() || UNTITLED_SESSION_TITLE}</h3></span></span>
    <span className="grep-session-plan"><span className="grep-session-bar" aria-hidden="true"><span style={{ width: `${sessionPlanProgress(session)}%` }} /></span>{sessionPlanSummary(session)}</span>
    <span className="grep-session-actions">
      <SessionMenu session={session} open={menuOpen} onOpenChange={setMenuOpen} onCopy={onCopy} onReopen={onReopen} onDelete={onDelete} />
    </span>
  </li>;
}
