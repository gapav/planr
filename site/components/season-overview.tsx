"use client";

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { dayKey, monthKey } from "@/lib/fixtures";
import { autoSessionTitle, combineSessionStart, DEFAULT_SESSION_TIME } from "@/lib/session";
import { seasonMonthSpans, seasonMonths, seasonStartYear, seasonWeeks, shiftDay, type SeasonMonth, type SeasonWeek } from "@/lib/season";
import type { MonthFocus, PlannedSession, TeamFixture } from "@/lib/types";
import { cn } from "@/lib/utils";

type Selection = { type: "month"; key: string } | { type: "week"; index: number };
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

export function SeasonOverview({ teamId, sessions, fixtures, monthFocus, initialMonth, onEditFocus, onCreateTraining }: {
  teamId: string;
  sessions: PlannedSession[];
  fixtures: TeamFixture[];
  monthFocus: MonthFocus[];
  initialMonth: string | null;
  onEditFocus(month: { key: string; label: string }): void;
  onCreateTraining(startsAt: string): Promise<void>;
}) {
  const [year, setYear] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [todayDay, setTodayDay] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      const requestedMonth = initialMonth && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(initialMonth) ? initialMonth : null;
      const target = requestedMonth ?? monthKey(now);
      const [targetYear, targetMonth] = target.split("-").map(Number);
      setTodayDay(dayKey(now));
      setYear((current) => current ?? (requestedMonth ? targetMonth >= 8 ? targetYear : targetYear - 1 : seasonStartYear(now)));
      setSelection((current) => current ?? { type: "month", key: target });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [initialMonth]);

  const months = useMemo(() => year === null ? [] : seasonMonths(year, teamId, sessions, fixtures, monthFocus), [year, teamId, sessions, fixtures, monthFocus]);
  const weeks = useMemo(() => year === null ? [] : seasonWeeks(year, teamId, sessions, fixtures), [year, teamId, sessions, fixtures]);
  const spans = useMemo(() => seasonMonthSpans(weeks), [weeks]);
  const todayWeek = todayDay ? weeks.find((week) => week.start <= todayDay && todayDay <= week.end) : null;
  const scrollToWeek = selection?.type === "week" ? selection.index : selection?.type === "month" ? spans.find((span) => span.key === selection.key)?.from : todayWeek?.index;

  useEffect(() => {
    const element = scroller.current;
    if (!element || scrollToWeek === undefined) return;
    const column = element.querySelector<HTMLElement>(`[data-season-week="${scrollToWeek}"]`);
    if (column) element.scrollLeft = Math.max(0, column.offsetLeft - element.clientWidth / 3);
  }, [year, scrollToWeek]);

  const selectedMonth = selection?.type === "month" ? months.find((month) => month.key === selection.key) ?? null : null;
  const selectedWeek = selection?.type === "week" ? weeks[selection.index] ?? null : null;
  const detailMonth = selectedMonth ?? (selectedWeek ? months.find((month) => month.key === selectedWeek.month) ?? null : null);
  if (year === null || !todayDay || !detailMonth) return <div className="season-loading" role="status">Henter sesongen …</div>;
  const todayMonth = todayDay.slice(0, 7);
  const seasonLabel = `${year}/${String(year + 1).slice(-2)}`;
  const detailSessions = selectedWeek?.sessions ?? selectedMonth?.sessions ?? [];
  const detailFixtures = selectedWeek?.fixtures ?? selectedMonth?.fixtures ?? [];
  const detailTitle = selectedWeek ? `Uke ${selectedWeek.number}` : detailMonth.label;
  const detailDates = selectedWeek ? `${dayLabel(selectedWeek.start)}–${dayLabel(selectedWeek.end)}` : "";
  // A week can cross a calendar-month boundary. Show both focuses so an early
  // October session never appears to inherit September's plan (or vice versa).
  const focusMonths = selectedWeek
    ? [...new Set([selectedWeek.start.slice(0, 7), selectedWeek.end.slice(0, 7)])].map((key) => months.find((month) => month.key === key)).filter((month): month is SeasonMonth => Boolean(month))
    : [detailMonth];
  const canEditFocus = selectedMonth && selectedMonth.key >= todayMonth;
  const canCreateTraining = selectedWeek && selectedWeek.end >= todayDay && selectedWeek.start <= `${year + 1}-07-31`;

  function moveSeason(delta: number) {
    const next = year! + delta;
    setYear(next);
    setSelection({ type: "month", key: `${next}-08` });
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
    const date = [shiftDay(week.start, 1), `${year}-08-01`, todayDay].sort().at(-1)!;
    const startsAt = combineSessionStart(date, DEFAULT_SESSION_TIME);
    if (!startsAt) return;
    setCreating(true);
    try { await onCreateTraining(startsAt); } finally { setCreating(false); }
  }

  const col = (index: number) => index + 2;
  return <div className="season-overview">
    <header className="season-heading">
      <div><p className="season-eyebrow">Sesongoverblikk</p><h2>Sesong {seasonLabel}</h2><p>Se fokus, kamper og treninger uke for uke. Velg en måned eller uke for å planlegge videre.</p></div>
      <div className="season-navigation" role="group" aria-label="Velg sesong">
        <button type="button" aria-label="Forrige sesong" onClick={() => moveSeason(-1)}><ChevronLeft size={18} /></button><span>{seasonLabel}</span><button type="button" aria-label="Neste sesong" onClick={() => moveSeason(1)}><ChevronRight size={18} /></button>
      </div>
    </header>

    <section className="season-calendar" aria-label="Sesongkalender">
      <div className="season-scroll" ref={scroller}>
        <div className="season-grid" style={{ gridTemplateColumns: `var(--season-label-width) repeat(${weeks.length}, minmax(var(--season-week-width), 1fr))`, ["--season-weeks" as string]: weeks.length }}>
          <span className="season-row-label" style={{ gridRow: 1, gridColumn: 1 }} />
          {spans.map((span) => <button key={span.key} type="button" className={cn("season-month-head", selection?.type === "month" && selection.key === span.key && "is-selected")} style={{ gridRow: 1, gridColumn: `${col(span.from)} / ${col(span.to) + 1}` }} onClick={() => select({ type: "month", key: span.key })} aria-pressed={selection?.type === "month" && selection.key === span.key} aria-label={span.label}>{monthShort(span.key)}</button>)}

          <span className="season-row-label season-row-label-small" style={{ gridRow: 2, gridColumn: 1 }}>Uke</span>
          {weeks.map((week) => <span key={week.index} data-season-week={week.index} className={cn("season-week-number", todayWeek?.index === week.index && "is-today")} style={{ gridRow: 2, gridColumn: col(week.index) }}>{week.number}</span>)}

          <span className="season-row-label" style={{ gridRow: 3, gridColumn: 1 }}>Fokus</span>
          {spans.map((span) => {
            const month = months.find((candidate) => candidate.key === span.key)!;
            const selected = selection?.type === "month" && selection.key === span.key;
            return <button key={span.key} type="button" className={cn("season-focus-bar", month.focus ? "has-focus" : "is-empty", selected && "is-selected")} style={{ gridRow: 3, gridColumn: `${col(span.from)} / ${col(span.to) + 1}` }} onClick={() => select({ type: "month", key: span.key })} aria-pressed={selected} aria-label={`Fokus for ${month.label}: ${month.focus?.note ?? (month.key >= todayMonth ? "Ikke satt" : "Ingen fokus ble satt")}`} title={month.focus?.note ?? undefined}><span>{month.focus?.note ?? (month.key >= todayMonth ? "Sett fokus" : "Ingen fokus")}</span></button>;
          })}

          <span className="season-row-label" style={{ gridRow: 4, gridColumn: 1 }}>Kamper</span>
          {weeks.map((week) => <WeekCell key={`matches-${week.index}`} week={week} kind="matches" selected={selection?.type === "week" && selection.index === week.index} onClick={() => select({ type: "week", index: week.index })} column={col(week.index)} />)}

          <span className="season-row-label" style={{ gridRow: 5, gridColumn: 1 }}>Treninger</span>
          {weeks.map((week) => <WeekCell key={`training-${week.index}`} week={week} kind="training" selected={selection?.type === "week" && selection.index === week.index} onClick={() => select({ type: "week", index: week.index })} column={col(week.index)} />)}

          {todayWeek && <span className="season-today-line" style={{ gridRow: "2 / 6", gridColumn: col(todayWeek.index) }} aria-hidden="true" />}
        </div>
      </div>
      <div className="season-legend"><span><i className="season-legend-dot is-published" />Publisert økt</span><span><i className="season-legend-dot" />Utkast</span><span><i className="season-legend-match" />Kamp</span></div>
    </section>

    <section id="season-detail" className="season-detail" aria-labelledby="season-detail-heading" tabIndex={-1}>
      <div className="season-detail-header"><div><p className="season-eyebrow">{selectedWeek ? "Denne uka" : "Denne måneden"}</p><h3 id="season-detail-heading">{detailTitle}</h3>{detailDates && <p className="season-detail-dates">{detailDates}</p>}</div><div className="season-detail-actions">{canEditFocus && <button type="button" className="season-detail-edit" onClick={() => onEditFocus({ key: detailMonth.key, label: detailMonth.label })}><Pencil size={15} />{detailMonth.focus ? "Rediger fokus" : "Sett fokus"}</button>}{canCreateTraining && <button type="button" className="season-detail-add" disabled={creating} onClick={() => void createInWeek(selectedWeek)}><Plus size={15} />{creating ? "Oppretter…" : "Planlegg økt denne uka"}</button>}</div></div>
      <div className="season-detail-focus-list">{focusMonths.map((month) => <div key={month.key} className={cn("season-detail-focus", !month.focus && "is-empty")}><Target size={19} aria-hidden="true" /><div><strong>Fokus · {month.label}</strong><p>{month.focus?.note ?? (month.key >= todayMonth ? "Hva skal laget jobbe mest med denne måneden?" : "Ingen fokus ble satt for denne måneden.")}</p>{selectedWeek && month.key >= todayMonth && <button type="button" className="season-focus-edit" onClick={() => onEditFocus({ key: month.key, label: month.label })}>{month.focus ? "Rediger fokus" : "Sett fokus"}</button>}</div></div>)}</div>
      <div className="season-detail-columns">
        <div><h4><Trophy size={17} />Kamper <span>{detailFixtures.length}</span></h4>{detailFixtures.length ? <ul>{detailFixtures.map((fixture) => <li key={fixture.id} className="season-match"><span><strong>{fixture.homeTeam} – {fixture.awayTeam}</strong><small>{matchDate.format(new Date(fixture.startsAt))}{fixture.venue ? ` · ${fixture.venue}` : ""}</small></span></li>)}</ul> : <p className="season-detail-empty">Ingen kamper i kalenderen.</p>}</div>
        <div><h4><CalendarDays size={17} />Treninger <span>{detailSessions.length}</span></h4>{detailSessions.length ? <ul>{detailSessions.map((session) => <li key={session.id}><Link href={`/sessions/${session.id}`}><span><strong>{session.title || autoSessionTitle(session.startsAt!)}</strong><small>{sessionDate.format(new Date(session.startsAt!))} · {sessionStatus(session)}</small></span><ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul> : <p className="season-detail-empty">Ingen daterte økter ennå.</p>}</div>
      </div>
    </section>
  </div>;
}

function WeekCell({ week, kind, selected, onClick, column }: { week: SeasonWeek; kind: "matches" | "training"; selected: boolean; onClick(): void; column: number }) {
  const events = kind === "matches" ? week.fixtures : week.sessions;
  const noun = kind === "matches" ? countLabel(events.length, "kamp", "kamper") : countLabel(events.length, "trening", "treninger");
  return <button type="button" className={cn("season-week-cell", kind === "matches" ? "is-match-row" : "is-training-row", selected && "is-selected")} style={{ gridRow: kind === "matches" ? 4 : 5, gridColumn: column }} onClick={onClick} aria-pressed={selected} aria-label={`Uke ${week.number}, ${dayLabel(week.start)}–${dayLabel(week.end)}: ${noun}`} title={noun}>
    {kind === "matches" ? (week.fixtures.length > 0 && <span className="season-match-count">{week.fixtures.length}</span>) : <span className="season-training-dots" aria-hidden="true">{week.sessions.slice(0, 4).map((session) => <i key={session.id} className={session.status === "draft" ? "" : "is-published"} />)}{week.sessions.length > 4 && <small>+{week.sessions.length - 4}</small>}</span>}
  </button>;
}
