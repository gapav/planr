import { dayKey, monthKey, monthLabel, shiftMonth } from "./fixtures";
import { isoWeekNumber } from "./session";
import type { MonthFocus, PlannedSession, TeamFixture } from "./types";

export interface SeasonMonth {
  key: string;
  label: string;
  focus: MonthFocus | null;
  sessions: PlannedSession[];
  fixtures: TeamFixture[];
}

export interface SeasonWeek {
  index: number;
  start: string;
  end: string;
  number: number;
  month: string;
  sessions: PlannedSession[];
  fixtures: TeamFixture[];
}

export interface SeasonMonthSpan { key: string; label: string; from: number; to: number }

const DAY_MS = 24 * 60 * 60 * 1000;
function dayNumber(key: string) { return Date.parse(`${key}T00:00:00Z`) / DAY_MS; }
function dayFromNumber(number: number) { return new Date(number * DAY_MS).toISOString().slice(0, 10); }
export function shiftDay(key: string, days: number) { return dayFromNumber(dayNumber(key) + days); }
function mondayOnOrBefore(key: string) {
  const day = dayNumber(key);
  return dayFromNumber(day - (new Date(day * DAY_MS).getUTCDay() + 6) % 7);
}

/** A Grep season runs from August through July, including the summer break. */
export function seasonStartYear(now: Date, timeZone?: string) {
  const [year, month] = monthKey(now, timeZone).split("-").map(Number);
  return month >= 8 ? year : year - 1;
}

export function seasonMonthKeys(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => shiftMonth(`${startYear}-08`, index));
}

/** Whole Monday–Sunday columns, including the partial weeks at both ends. */
export function seasonWeeks(startYear: number, teamId: string, sessions: PlannedSession[], fixtures: TeamFixture[], timeZone?: string): SeasonWeek[] {
  const first = mondayOnOrBefore(`${startYear}-08-01`);
  const last = mondayOnOrBefore(`${startYear + 1}-07-31`);
  const firstMonth = `${startYear}-08`;
  const lastMonth = `${startYear + 1}-07`;
  const weeks = Array.from({ length: Math.round((dayNumber(last) - dayNumber(first)) / 7) + 1 }, (_, index) => {
    const start = shiftDay(first, index * 7);
    const thursday = shiftDay(start, 3);
    const calendarMonth = thursday.slice(0, 7);
    return { index, start, end: shiftDay(start, 6), number: isoWeekNumber(new Date(`${thursday}T12:00:00Z`), "UTC"), month: calendarMonth < firstMonth ? firstMonth : calendarMonth > lastMonth ? lastMonth : calendarMonth, sessions: [], fixtures: [] } as SeasonWeek;
  });
  function indexFor(date: string) { return Math.floor((dayNumber(date) - dayNumber(first)) / 7); }
  for (const session of sessions) {
    if (session.teamId !== teamId || !session.startsAt) continue;
    const date = dayKey(session.startsAt, timeZone);
    const index = indexFor(date);
    if (index >= 0 && index < weeks.length && date >= `${startYear}-08-01` && date <= `${startYear + 1}-07-31`) weeks[index].sessions.push(session);
  }
  for (const fixture of fixtures) {
    if (fixture.teamId !== teamId) continue;
    const date = dayKey(fixture.startsAt, timeZone);
    const index = indexFor(date);
    if (index >= 0 && index < weeks.length && date >= `${startYear}-08-01` && date <= `${startYear + 1}-07-31`) weeks[index].fixtures.push(fixture);
  }
  for (const week of weeks) {
    week.sessions.sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    week.fixtures.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return weeks;
}

export function seasonMonthSpans(weeks: readonly SeasonWeek[]): SeasonMonthSpan[] {
  const spans: SeasonMonthSpan[] = [];
  for (const week of weeks) {
    const last = spans.at(-1);
    if (last?.key === week.month) last.to = week.index;
    else spans.push({ key: week.month, label: monthLabel(week.month), from: week.index, to: week.index });
  }
  return spans;
}

/** Keep dated drafts in the overview: they are plans even before publication. */
export function seasonMonths(startYear: number, teamId: string, sessions: PlannedSession[], fixtures: TeamFixture[], focuses: MonthFocus[], timeZone?: string): SeasonMonth[] {
  const byMonth = new Map(seasonMonthKeys(startYear).map((key) => [key, { key, label: monthLabel(key), focus: null, sessions: [], fixtures: [] } as SeasonMonth]));
  for (const focus of focuses) {
    if (focus.teamId === teamId) {
      const month = byMonth.get(focus.month);
      if (month) month.focus = focus;
    }
  }
  for (const session of sessions) {
    if (session.teamId !== teamId || !session.startsAt) continue;
    byMonth.get(monthKey(session.startsAt, timeZone))?.sessions.push(session);
  }
  for (const fixture of fixtures) {
    if (fixture.teamId !== teamId) continue;
    byMonth.get(monthKey(fixture.startsAt, timeZone))?.fixtures.push(fixture);
  }
  for (const month of byMonth.values()) {
    month.sessions.sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    month.fixtures.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return [...byMonth.values()];
}
