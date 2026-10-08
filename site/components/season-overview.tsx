"use client";

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FocusDialog } from "@/components/focus-dialog";
import { dayKey } from "@/lib/fixtures";
import { focusAt, focusOverlapsRange, focusSpanLabel, freeFocusSpan, noteLines, teamFocuses } from "@/lib/focus";
import { autoSessionTitle, combineSessionStart, DEFAULT_SESSION_TIME } from "@/lib/session";
import { focusColumns, seasonMatchTeams, seasonMonthSpans, seasonStartYear, seasonWeeks, shiftDay, type SeasonMatchTeam, type SeasonWeek, weekMatchTeams } from "@/lib/season";
import type { FocusPeriod, FocusPeriodInput, PlannedSession, TeamFixture } from "@/lib/types";
import { cn } from "@/lib/utils";

type Selection = { type: "week"; index: number } | { type: "focus"; id: string };
type DialogState = { focus: FocusPeriod } | { initial: FocusPeriodInput } | null;
const dayFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("nb-NO", { month: "short", timeZone: "UTC" });
const sessionDate = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const matchDate = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function dayLabel(key: string) { return dayFormat.format(new Date(`${key}T12:00:00Z`)); }
function monthShort(key: string) { return monthFormat.format(new Date(`${key}-15T12:00:00Z`)); }
function countLabel(count: number, singular: string, plural: string) { return `${count} ${count === 1 ? singular : plural}`; }
function sessionStatus(session: PlannedSession) {
  if (session.status === "draft") return "Utkast";
  if (session.status === "in_progress") return "Pågår";
  if (session.status === "completed") return "Gjennomført";
  return "Publisert";
}
const emptyFocus = (span: { startsOn: string; weeks: number }): FocusPeriodInput => ({ title: "", note: "", notes: "", ...span });

/**
 * The season, August to July, as a grid of weeks: the team's focuses as bars
 * over the weeks they run — Spenst's phases row — then matches and training.
 * Drag across free weeks in the Fokus row (or tap one) to set a new focus;
 * click a bar or a week to read it in full below. The months are only labels:
 * a focus runs over weeks, and so does everything the detail shows.
 *
 * `initialFocus` opens the season on that focus (the builder links to the one
 * its session falls in); otherwise it opens on whatever is running today.
 */
export function SeasonOverview({ teamId, sessions, fixtures, focusPeriods, initialFocus, onCreateTraining }: {
  teamId: string;
  sessions: PlannedSession[];
  fixtures: TeamFixture[];
  focusPeriods: FocusPeriod[];
  initialFocus: string | null;
  onCreateTraining(startsAt: string): Promise<void>;
}) {
  const [year, setYear] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [todayDay, setTodayDay] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const scroller = useRef<HTMLDivElement>(null);

  const requestedFocus = initialFocus ? focusPeriods.find((focus) => focus.id === initialFocus && focus.teamId === teamId) ?? null : null;
  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setTodayDay(dayKey(now));
      setYear((current) => current ?? seasonStartYear(requestedFocus ? new Date(`${requestedFocus.startsOn}T12:00:00Z`) : now));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [requestedFocus]);

  const weeks = useMemo(() => year === null ? [] : seasonWeeks(year, teamId, sessions, fixtures), [year, teamId, sessions, fixtures]);
  const spans = useMemo(() => seasonMonthSpans(weeks), [weeks]);
  const matchTeams = useMemo(() => seasonMatchTeams(weeks), [weeks]);
  // The team's focuses that reach into this season, with the columns they cover.
  const seasonFocuses = useMemo(() => teamFocuses(focusPeriods, teamId).flatMap((focus) => {
    const span = focusColumns(weeks, focus);
    return span ? [{ focus, span }] : [];
  }), [focusPeriods, teamId, weeks]);
  const takenWeeks = useMemo(() => new Set(seasonFocuses.flatMap(({ span }) => Array.from({ length: span.to - span.from + 1 }, (_, offset) => span.from + offset))), [seasonFocuses]);
  const todayWeek = todayDay ? weeks.find((week) => week.start <= todayDay && todayDay <= week.end) : null;
  // What the detail shows: the week or focus picked, or until then the focus
  // asked for, else the one running today, else this week — or, in another
  // season, its first focus or week. A pick that no longer exists (a focus
  // deleted, or moved out of the season) falls back the same way.
  const shown = useMemo<Selection | null>(() => {
    if (year === null || !todayDay || !weeks.length) return null;
    if (selection?.type === "week" && weeks[selection.index]) return selection;
    if (selection?.type === "focus" && seasonFocuses.some((entry) => entry.focus.id === selection.id)) return selection;
    const inSeason = (focus: FocusPeriod | null) => focus && seasonFocuses.some((entry) => entry.focus.id === focus.id) ? focus : null;
    const focus = inSeason(requestedFocus) ?? inSeason(focusAt(focusPeriods, teamId, todayDay)) ?? (todayWeek ? null : seasonFocuses[0]?.focus ?? null);
    return focus ? { type: "focus", id: focus.id } : { type: "week", index: todayWeek?.index ?? 0 };
  }, [year, todayDay, weeks, selection, seasonFocuses, requestedFocus, focusPeriods, teamId, todayWeek]);
  const selectedFocusEntry = shown?.type === "focus" ? seasonFocuses.find((entry) => entry.focus.id === shown.id) ?? null : null;
  const scrollToWeek = shown?.type === "week" ? shown.index : selectedFocusEntry?.span.from;

  useEffect(() => {
    const element = scroller.current;
    if (!element || scrollToWeek === undefined) return;
    const column = element.querySelector<HTMLElement>(`[data-season-week="${scrollToWeek}"]`);
    if (column) element.scrollLeft = Math.max(0, column.offsetLeft - element.clientWidth / 3);
  }, [year, scrollToWeek]);

  // A click on a free week (a drag of one) opens a focus of the usual length
  // from there; a longer drag means exactly the weeks dragged over.
  const openCreate = useCallback((from: number, to: number) => {
    const start = weeks[Math.min(from, to)]; const end = weeks[Math.max(from, to)];
    if (!start || !end) return;
    setDialog({ initial: emptyFocus(from === to ? freeFocusSpan(focusPeriods, teamId, start.start) : { startsOn: start.start, weeks: end.index - start.index + 1 }) });
  }, [weeks, focusPeriods, teamId]);

  // Finish a drag wherever the pointer is let go — outside the grid included.
  useEffect(() => {
    if (!drag) return;
    const finish = () => {
      const current = dragRef.current;
      setDrag(null);
      if (current) openCreate(current.from, current.to);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [drag, openCreate]);

  const selectedWeek = shown?.type === "week" ? weeks[shown.index] ?? null : null;
  const selectedFocus = selectedFocusEntry?.focus ?? null;
  const loading = year === null || !todayDay || (!selectedWeek && !selectedFocus);
  if (loading) return <div className="season-loading" role="status">Henter sesongen …</div>;
  const seasonLabel = `${year}/${String(year + 1).slice(-2)}`;
  const focusWeeks = selectedFocusEntry ? weeks.slice(selectedFocusEntry.span.from, selectedFocusEntry.span.to + 1) : [];
  const detailSessions = selectedWeek?.sessions ?? focusWeeks.flatMap((week) => week.sessions);
  const detailFixtures = selectedWeek?.fixtures ?? focusWeeks.flatMap((week) => week.fixtures);
  const detailTitle = selectedFocus ? selectedFocus.title : `Uke ${selectedWeek!.number}`;
  const detailDates = selectedFocus ? focusSpanLabel(selectedFocus) : `${dayLabel(selectedWeek!.start)}–${dayLabel(selectedWeek!.end)}`;
  // A week lies in at most one focus.
  const weekFocus = selectedWeek ? seasonFocuses.find((entry) => focusOverlapsRange(entry.focus, selectedWeek.start, selectedWeek.end))?.focus ?? null : null;
  const canCreateTraining = selectedWeek && selectedWeek.end >= todayDay! && selectedWeek.start <= `${year + 1}-07-31`;

  function moveSeason(delta: number) {
    setYear(year! + delta);
    setSelection(null);
  }

  function select(next: Selection) {
    setSelection(next);
    window.requestAnimationFrame(() => {
      const detail = document.getElementById("season-detail");
      detail?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      detail?.focus({ preventScroll: true });
    });
  }

  async function createInWeek(week: SeasonWeek) {
    if (creating) return;
    const date = [shiftDay(week.start, 1), `${year}-08-01`, todayDay!].sort().at(-1)!;
    const startsAt = combineSessionStart(date, DEFAULT_SESSION_TIME);
    if (!startsAt) return;
    setCreating(true);
    try { await onCreateTraining(startsAt); } finally { setCreating(false); }
  }

  // "Nytt fokus" from the keyboard: the first free weeks from today, or from
  // the start of the season when looking at another one.
  const newFocusDefault = () => emptyFocus(freeFocusSpan(focusPeriods, teamId, todayWeek ? todayDay! : weeks[0].start));
  const inDrag = (index: number) => drag !== null && index >= Math.min(drag.from, drag.to) && index <= Math.max(drag.from, drag.to);
  const col = (index: number) => index + 2;
  return <div className="season-overview">
    <header className="season-heading">
      <div><p className="season-eyebrow">Sesongoverblikk</p><h2>Sesong {seasonLabel}</h2><p>Se fokus, kamper og treninger uke for uke. Dra over ledige uker i Fokus-raden for å sette et nytt fokus.</p></div>
      <div className="season-heading-actions">
        <button type="button" className="season-new-focus" onClick={() => setDialog({ initial: newFocusDefault() })}><Plus size={16} />Nytt fokus</button>
        <div className="season-navigation" role="group" aria-label="Velg sesong">
          <button type="button" aria-label="Forrige sesong" onClick={() => moveSeason(-1)}><ChevronLeft size={18} /></button><span>{seasonLabel}</span><button type="button" aria-label="Neste sesong" onClick={() => moveSeason(1)}><ChevronRight size={18} /></button>
        </div>
      </div>
    </header>

    <section className="season-calendar" aria-label="Sesongkalender">
      <div className="season-scroll" ref={scroller}>
        <div className="season-grid" style={{ gridTemplateColumns: `var(--season-label-width) repeat(${weeks.length}, minmax(var(--season-week-width), 1fr))`, ["--season-weeks" as string]: weeks.length }}>
          <span className="season-row-label" style={{ gridRow: 1, gridColumn: 1 }} />
          {spans.map((span) => <span key={span.key} className="season-month-head" style={{ gridRow: 1, gridColumn: `${col(span.from)} / ${col(span.to) + 1}` }} title={span.label}>{monthShort(span.key)}</span>)}

          <span className="season-row-label season-row-label-small" style={{ gridRow: 2, gridColumn: 1 }}>Uke</span>
          {weeks.map((week) => <span key={week.index} data-season-week={week.index} className={cn("season-week-number", todayWeek?.index === week.index && "is-today")} style={{ gridRow: 2, gridColumn: col(week.index) }}>{week.number}</span>)}

          <span className="season-row-label" style={{ gridRow: 3, gridColumn: 1 }}>Fokus</span>
          {weeks.map((week) => {
            const free = !takenWeeks.has(week.index);
            return <span
              key={`focus-cell-${week.index}`}
              className={cn("season-focus-cell", free && "is-free", inDrag(week.index) && "is-dragging")}
              style={{ gridRow: 3, gridColumn: col(week.index) }}
              // Mouse and pen drag out a span. A finger has to be free to scroll
              // the season sideways, so touch taps instead: a tap fires
              // pointerup, a scroll ends in pointercancel.
              onPointerDown={(event) => { if (!free || event.pointerType === "touch" || event.button !== 0) return; event.preventDefault(); setDrag({ from: week.index, to: week.index }); }}
              onPointerUp={(event) => { if (free && event.pointerType === "touch") openCreate(week.index, week.index); }}
              onPointerEnter={() => { if (drag && free) setDrag({ ...drag, to: week.index }); }}
              aria-hidden="true"
            />;
          })}
          {!seasonFocuses.length && !drag && <span className="season-focus-hint" style={{ gridRow: 3, gridColumn: `2 / ${weeks.length + 2}` }} aria-hidden="true">Dra over ukene for å sette fokus</span>}
          {seasonFocuses.map(({ focus, span }) => {
            const selected = shown?.type === "focus" && shown.id === focus.id;
            return <button key={focus.id} type="button" className={cn("season-focus-bar", selected && "is-selected")} style={{ gridRow: 3, gridColumn: `${col(span.from)} / ${col(span.to) + 1}` }} onClick={() => select({ type: "focus", id: focus.id })} aria-pressed={selected} aria-label={`Fokus: ${focus.title}, ${focusSpanLabel(focus)}`} title={focus.note.trim() ? `${focus.title} — ${focus.note.trim()}` : focus.title}><span>{focus.title}</span></button>;
          })}

          <span className="season-row-label" style={{ gridRow: 4, gridColumn: 1 }}>Kamper</span>
          {weeks.map((week) => <WeekCell key={`matches-${week.index}`} week={week} kind="matches" teams={matchTeams} selected={shown?.type === "week" && shown.index === week.index} onClick={() => select({ type: "week", index: week.index })} column={col(week.index)} />)}

          <span className="season-row-label" style={{ gridRow: 5, gridColumn: 1 }}>Treninger</span>
          {weeks.map((week) => <WeekCell key={`training-${week.index}`} week={week} kind="training" teams={matchTeams} selected={shown?.type === "week" && shown.index === week.index} onClick={() => select({ type: "week", index: week.index })} column={col(week.index)} />)}

          {todayWeek && <span className="season-today-line" style={{ gridRow: "2 / 6", gridColumn: col(todayWeek.index) }} aria-hidden="true" />}
        </div>
      </div>
      <div className="season-legend"><span><i className="season-legend-dot is-published" />Publisert økt</span><span><i className="season-legend-dot" />Utkast</span>{matchTeams.map((team) => <span key={team.name}><i className="season-legend-team" style={{ background: team.accent }} />{team.name}</span>)}</div>
    </section>

    {seasonFocuses.length > 0 && <section className="season-focus-cards" aria-label="Fokus gjennom sesongen">
      {seasonFocuses.map(({ focus, span }) => {
        const inFocus = weeks.slice(span.from, span.to + 1);
        const sessionCount = inFocus.reduce((total, week) => total + week.sessions.length, 0);
        const fixtureCount = inFocus.reduce((total, week) => total + week.fixtures.length, 0);
        const points = noteLines(focus.notes);
        const selected = shown?.type === "focus" && shown.id === focus.id;
        const current = focusOverlapsRange(focus, todayDay!, todayDay!);
        return <button key={focus.id} type="button" className={cn("season-focus-card", selected && "is-selected")} onClick={() => select({ type: "focus", id: focus.id })} aria-pressed={selected}>
          <span className="season-focus-card-head"><strong>{focus.title}</strong>{current && <span className="season-focus-now">Nå</span>}<ChevronRight size={16} aria-hidden="true" /></span>
          <small>{[focusSpanLabel(focus), countLabel(sessionCount, "økt", "økter"), fixtureCount ? countLabel(fixtureCount, "kamp", "kamper") : null].filter(Boolean).join(" · ")}</small>
          {focus.note.trim() && <p className="season-focus-card-line">{focus.note}</p>}
          {points.length > 0 && <ul>{points.map((point, index) => <li key={index}>{point}</li>)}</ul>}
        </button>;
      })}
    </section>}

    <section id="season-detail" className="season-detail" aria-labelledby="season-detail-heading" tabIndex={-1}>
      <div className="season-detail-header">
        <div><p className="season-eyebrow">{selectedFocus ? "Fokus" : "Uke"}</p><h3 id="season-detail-heading" className={cn(selectedFocus && "is-focus")}>{detailTitle}</h3>{detailDates && <p className="season-detail-dates">{detailDates}</p>}</div>
        <div className="season-detail-actions">
          {selectedFocus && <button type="button" className="season-detail-edit" onClick={() => setDialog({ focus: selectedFocus })}><Pencil size={15} />Rediger fokus</button>}
          {canCreateTraining && <button type="button" className="season-detail-add" disabled={creating} onClick={() => void createInWeek(selectedWeek)}><Plus size={15} />{creating ? "Oppretter…" : "Planlegg økt denne uka"}</button>}
        </div>
      </div>
      <div className="season-detail-focus-list">
        {selectedFocus
          ? <div className="season-detail-focus"><Target size={19} aria-hidden="true" /><div>{focusContent(selectedFocus) ?? <p className="season-detail-focus-empty">Ingen beskrivelse ennå.</p>}</div></div>
          : weekFocus
          ? <div className="season-detail-focus"><Target size={19} aria-hidden="true" /><div><small>Fokus · {focusSpanLabel(weekFocus)}</small><strong>{weekFocus.title}</strong>{focusContent(weekFocus)}<button type="button" className="season-focus-edit" onClick={() => select({ type: "focus", id: weekFocus.id })}>Åpne fokuset</button></div></div>
          : <div className="season-detail-focus is-empty"><Target size={19} aria-hidden="true" /><div><small>Fokus</small><p>Ingen fokus denne uka.</p><button type="button" className="season-focus-edit" onClick={() => setDialog({ initial: emptyFocus(freeFocusSpan(focusPeriods, teamId, selectedWeek!.start)) })}>Sett fokus</button></div></div>}
      </div>
      <div className="season-detail-columns">
        <div><h4><Trophy size={17} />Kamper <span>{detailFixtures.length}</span></h4>{detailFixtures.length ? <ul>{detailFixtures.map((fixture) => <li key={fixture.id} className="season-match"><span><strong>{fixture.homeTeam} – {fixture.awayTeam}</strong><small>{matchDate.format(new Date(fixture.startsAt))}{fixture.venue ? ` · ${fixture.venue}` : ""}</small></span></li>)}</ul> : <p className="season-detail-empty">Ingen kamper i kalenderen.</p>}</div>
        <div><h4><CalendarDays size={17} />Treninger <span>{detailSessions.length}</span></h4>{detailSessions.length ? <ul>{detailSessions.map((session) => <li key={session.id}><Link href={`/sessions/${session.id}`}><span><strong>{session.title || autoSessionTitle(session.startsAt!)}</strong><small>{sessionDate.format(new Date(session.startsAt!))} · {sessionStatus(session)}</small></span><ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul> : <p className="season-detail-empty">Ingen daterte økter ennå.</p>}</div>
      </div>
    </section>

    {dialog && <FocusDialog
      key={"focus" in dialog ? dialog.focus.id : `${dialog.initial.startsOn}-${dialog.initial.weeks}`}
      focus={"focus" in dialog ? dialog.focus : null}
      initial={"focus" in dialog ? { title: dialog.focus.title, note: dialog.focus.note, notes: dialog.focus.notes, startsOn: dialog.focus.startsOn, weeks: dialog.focus.weeks } : dialog.initial}
      onClose={() => setDialog(null)}
      onSaved={(id) => setSelection({ type: "focus", id })}
    />}
  </div>;
}

/** The sentence and the points, or nothing when the focus has only its name. */
function focusContent(focus: FocusPeriod) {
  const points = noteLines(focus.notes);
  if (!focus.note.trim() && !points.length) return null;
  return <>
    {focus.note.trim() && <p>{focus.note}</p>}
    {points.length > 0 && <ul>{points.map((point, index) => <li key={index}>{point}</li>)}</ul>}
  </>;
}

function WeekCell({ week, kind, teams, selected, onClick, column }: { week: SeasonWeek; kind: "matches" | "training"; teams: readonly SeasonMatchTeam[]; selected: boolean; onClick(): void; column: number }) {
  const events = kind === "matches" ? week.fixtures : week.sessions;
  const playing = kind === "matches" ? weekMatchTeams(week, teams) : [];
  const noun = kind === "matches" ? `${countLabel(events.length, "kamp", "kamper")}${playing.length ? ` (${playing.map((team) => team.name).join(", ")})` : ""}` : countLabel(events.length, "trening", "treninger");
  return <button type="button" className={cn("season-week-cell", kind === "matches" ? "is-match-row" : "is-training-row", selected && "is-selected")} style={{ gridRow: kind === "matches" ? 4 : 5, gridColumn: column }} onClick={onClick} aria-pressed={selected} aria-label={`Uke ${week.number}, ${dayLabel(week.start)}–${dayLabel(week.end)}: ${noun}`} title={noun}>
    {kind === "matches" ? <span className="season-match-dots" aria-hidden="true">{playing.map((team) => <i key={team.name} style={{ background: team.accent }} />)}</span> : <span className="season-training-dots" aria-hidden="true">{week.sessions.slice(0, 4).map((session) => <i key={session.id} className={session.status === "draft" ? "" : "is-published"} />)}{week.sessions.length > 4 && <small>+{week.sessions.length - 4}</small>}</span>}
  </button>;
}
