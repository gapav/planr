import { dayKey, monthKey, monthLabel, shiftMonth } from "./fixtures";
import { isoWeekNumber } from "./session";
import { savedTeamColors, teamPalette } from "./team-palette";
import type { FocusPeriod, PlannedSession, TeamFixture } from "./types";

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

export interface SeasonMatchTeam { name: string; accent: string }

// Which of the club's teams a match is for. The importer recognises them by
// name; a match it could not place is still somebody's, and goes under its home
// side, as the match calendar colours it.
function matchTeamNames(fixture: TeamFixture) {
  return fixture.ourTeams.length ? fixture.ourTeams : [fixture.homeTeam];
}

/**
 * The club's teams with a match this season, in the colours the match calendar
 * gives them (latest import wins), sorted by name so a team keeps its place in
 * every week's row of dots.
 */
export function seasonMatchTeams(weeks: readonly SeasonWeek[]): SeasonMatchTeam[] {
  const fixtures = weeks.flatMap((week) => week.fixtures);
  const colors = savedTeamColors(fixtures);
  const names = [...new Set(fixtures.flatMap(matchTeamNames))].sort((a, b) => a.localeCompare(b, "nb"));
  return names.map((name) => ({ name, accent: teamPalette(name, colors[name]).accent }));
}

/** The teams that play in one week: one dot each, however many matches they have. */
export function weekMatchTeams(week: SeasonWeek, teams: readonly SeasonMatchTeam[]): SeasonMatchTeam[] {
  const playing = new Set(week.fixtures.flatMap(matchTeamNames));
  return teams.filter((team) => playing.has(team.name));
}

/** The week columns a focus covers, clipped to the season; null if it lies wholly outside. */
export function focusColumns(weeks: readonly SeasonWeek[], focus: Pick<FocusPeriod, "startsOn" | "weeks">): { from: number; to: number } | null {
  if (!weeks.length) return null;
  const from = Math.round((dayNumber(focus.startsOn) - dayNumber(weeks[0].start)) / 7);
  const to = from + focus.weeks - 1;
  if (to < 0 || from >= weeks.length) return null;
  return { from: Math.max(0, from), to: Math.min(weeks.length - 1, to) };
}
