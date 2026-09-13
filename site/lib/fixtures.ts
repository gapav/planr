import { teamPalette } from "./team-palette";
import { CLUB_TIME_ZONE } from "./time";
import type { TeamFixture, TeamFixtureInput } from "./types";

// The export the clubs get out of the tournament system is one row per match
// for a whole division, with Norwegian headings. Column order is not stable
// between reports, so the header row is matched by name the same way the roster
// import does it.
const aliases = {
  date: ["dato", "kampdato", "date"],
  time: ["tid", "kl", "klokkeslett", "starttid", "time"],
  matchNumber: ["kampnr", "kampnummer", "kamp nr", "kampid", "match no", "match number"],
  homeTeam: ["hjemmelag", "hjemme", "home", "home team"],
  awayTeam: ["bortelag", "borte", "away", "away team"],
  result: ["h-b", "resultat", "hjemme-borte", "result", "score"],
  venue: ["bane", "arena", "hall", "sted", "spillested", "venue"],
  organizer: ["arrangør", "arrangor", "organizer"],
  tournament: ["turnering", "serie", "avdeling", "tournament"],
} as const;

type Column = keyof typeof aliases;
type ColumnMap = Partial<Record<Column, number>>;

// Matches are scheduled in Norwegian wall-clock time; the app stores UTC.
const MATCH_TIME_ZONE = CLUB_TIME_ZONE;
const DAY_MS = 86_400_000;

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("nb-NO").replace(/[_.]+/g, " ").replace(/\s+/g, " ");
}

function mapColumns(row: readonly unknown[]): ColumnMap {
  const columns: ColumnMap = {};
  row.forEach((cell, index) => {
    const heading = normalized(cell);
    for (const [column, names] of Object.entries(aliases) as [Column, readonly string[]][]) {
      if (columns[column] === undefined && names.some((name) => normalized(name) === heading)) columns[column] = index;
    }
  });
  return columns;
}

function isHeaderRow(columns: ColumnMap) {
  return columns.date !== undefined && columns.homeTeam !== undefined && columns.awayTeam !== undefined;
}

function textAt(row: readonly unknown[], index: number | undefined) {
  if (index === undefined) return "";
  const value = row[index];
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// `Intl` is the only timezone database in the browser, so the offset is read
// back out of a formatted date rather than computed. One correction pass is
// enough: it only matters for the hour that falls inside a DST shift.
function zoneOffsetMs(instant: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCH_TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const at = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second")) - instant;
}

export function matchStartToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = wallClock - zoneOffsetMs(wallClock);
  return new Date(wallClock - zoneOffsetMs(firstGuess)).toISOString();
}

function parseDateParts(value: string) {
  const dotted = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(value);
  if (dotted) return { year: Number(dotted[3]), month: Number(dotted[2]), day: Number(dotted[1]) };
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  return null;
}

// A spreadsheet reader may hand back a real Date for the date cell and a
// fraction of a day for the time cell, so both shapes are accepted alongside
// the plain "06.09.2026" / "10:00" text the tournament export actually writes.
function parseTimeParts(row: readonly unknown[], index: number | undefined) {
  if (index === undefined) return { hour: 0, minute: 0 };
  const raw = row[index];
  if (typeof raw === "number" && raw >= 0 && raw < 1) {
    const minutes = Math.round(raw * 24 * 60);
    return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
  }
  const value = textAt(row, index);
  const clock = /^(\d{1,2})[:.](\d{2})/.exec(value) ?? /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(value);
  if (!clock) return { hour: 0, minute: 0 };
  return { hour: Number(clock[1]), minute: Number(clock[2]) };
}

export interface ParsedFixture {
  matchNumber: string; startsAt: string; homeTeam: string; awayTeam: string;
  result: string; venue: string; organizer: string; tournament: string;
}

export interface FixtureParseResult {
  fixtures: ParsedFixture[];
  /** Every team appearing in the file, so the coach can pick the club's own. */
  teams: Array<{ name: string; matchCount: number }>;
  skippedRows: number;
  headerRow: number;
}

export function parseFixtureRows(rows: readonly (readonly unknown[])[]): FixtureParseResult {
  const headerIndex = rows.slice(0, 15).findIndex((row) => isHeaderRow(mapColumns(row)));
  if (headerIndex < 0) throw new Error("Fant ingen kampkolonner. Regnearket må ha «Dato», «Hjemmelag» og «Bortelag».");
  const columns = mapColumns(rows[headerIndex]);
  const fixtures: ParsedFixture[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const homeTeam = textAt(row, columns.homeTeam);
    const awayTeam = textAt(row, columns.awayTeam);
    const dateParts = parseDateParts(textAt(row, columns.date));
    if (!homeTeam || !awayTeam || !dateParts) { skippedRows += 1; continue; }
    const { hour, minute } = parseTimeParts(row, columns.time);
    const startsAt = matchStartToUtc(dateParts.year, dateParts.month, dateParts.day, hour, minute);
    const matchNumber = textAt(row, columns.matchNumber) || `${startsAt}-${homeTeam}-${awayTeam}`;
    if (seen.has(matchNumber)) { skippedRows += 1; continue; }
    seen.add(matchNumber);
    const result = textAt(row, columns.result);
    fixtures.push({
      matchNumber, startsAt, homeTeam, awayTeam,
      // The export writes "-" in the score column for a match not yet played.
      result: result === "-" ? "" : result,
      venue: textAt(row, columns.venue), organizer: textAt(row, columns.organizer), tournament: textAt(row, columns.tournament),
    });
  }
  if (!fixtures.length) throw new Error("Regnearket inneholdt ingen kamprader.");

  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    counts.set(fixture.homeTeam, (counts.get(fixture.homeTeam) ?? 0) + 1);
    counts.set(fixture.awayTeam, (counts.get(fixture.awayTeam) ?? 0) + 1);
  }
  const teams = [...counts.entries()].map(([name, matchCount]) => ({ name, matchCount })).sort((a, b) => a.name.localeCompare(b.name, "nb"));
  return { fixtures, teams, skippedRows, headerRow: headerIndex + 1 };
}

/**
 * Keeps only the matches one of the picked teams plays, and records which of
 * them it was — a derby between two picked teams stays a single match carrying
 * both, so it is never listed twice.
 */
export function fixturesForTeams(fixtures: readonly ParsedFixture[], selected: readonly string[]): TeamFixtureInput[] {
  const picked = new Set(selected.map((name) => name.trim().toLocaleLowerCase("nb-NO")));
  const belongs = (name: string) => picked.has(name.trim().toLocaleLowerCase("nb-NO"));
  return fixtures
    .filter((fixture) => belongs(fixture.homeTeam) || belongs(fixture.awayTeam))
    .map((fixture) => ({ ...fixture, ourTeams: [fixture.homeTeam, fixture.awayTeam].filter(belongs) }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// Compatibility helper for consumers of team colour dots.
export function teamColor(name: string) { return teamPalette(name).accent.toLowerCase(); }

/** `YYYY-MM-DD` in the viewer's zone; `timeZone` is only passed by tests. */
export function dayKey(value: string | Date, timeZone?: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date);
}

export function monthKey(value: string | Date, timeZone?: string) {
  return dayKey(value, timeZone).slice(0, 7);
}

export function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export interface CalendarDay { key: string; dayOfMonth: number; inMonth: boolean }

/**
 * Six Monday-first weeks covering the month. Always six so the grid does not
 * change height as you page through, and built on UTC arithmetic so the cells
 * are plain calendar dates rather than instants.
 */
export function buildCalendarMonth(key: string): CalendarDay[][] {
  const [year, month] = key.split("-").map(Number);
  const first = Date.UTC(year, month - 1, 1);
  const mondayOffset = (new Date(first).getUTCDay() + 6) % 7;
  const weeks: CalendarDay[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(first + (week * 7 + weekday - mondayOffset) * DAY_MS);
      days.push({ key: date.toISOString().slice(0, 10), dayOfMonth: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1 });
    }
    weeks.push(days);
  }
  return weeks;
}

export function groupFixturesByDay<T extends { startsAt: string }>(fixtures: readonly T[], timeZone?: string) {
  const byDay = new Map<string, T[]>();
  for (const fixture of [...fixtures].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(fixture.startsAt, timeZone);
    if (!key) continue;
    const existing = byDay.get(key);
    if (existing) existing.push(fixture);
    else byDay.set(key, [fixture]);
  }
  return byDay;
}

/**
 * The club's own hall. "Hjemmekamp" in the terminlisten only means we are
 * listed first, which says nothing about where anyone has to drive — half of
 * those are played in a borrowed hall, so the word tells a coach nothing. The
 * calendar marks the one thing that does change the day: whether the match is
 * on our own floor. Both floors count, and the export spells them "Sofiemyr-
 * hallen A" / "Sofiemyrhallen B", so the hall name alone is matched. Change
 * this line, and nothing else, if the club moves.
 */
const HOME_VENUE = /sofiemyr\s*hallen/i;

export function isHomeVenue(venue: string) {
  return HOME_VENUE.test(venue);
}

/** What the card has to say at a glance: who we play, and whether we are home. */
export function fixtureOpponent(fixture: Pick<TeamFixture, "homeTeam" | "awayTeam" | "ourTeams">) {
  const isHome = fixture.ourTeams.some((team) => team === fixture.homeTeam);
  const isDerby = fixture.ourTeams.length > 1;
  return { isHome, isDerby, opponent: isDerby ? fixture.awayTeam : isHome ? fixture.awayTeam : fixture.homeTeam };
}

/**
 * One squad's whole match day. At this age group a team plays two or three
 * matches back to back in the same hall, so the day — not the fixture — is the
 * thing a coach plans around: one trip, one meet-up, one warm-up.
 */
export interface MatchDayTeam {
  key: string;
  team: string;
  fixtures: TeamFixture[];
  /** The first throw-off: what the meet-up and the warm-up are counted back from. */
  startsAt: string;
  /** The shared hall, or null when the day's matches are not all in one place. */
  venue: string | null;
}

export interface MatchDay {
  day: string;
  count: number;
  teams: MatchDayTeam[];
}

/**
 * Groups fixtures by day and then by which of our squads plays them.
 *
 * A derby gets its own group naming both squads rather than being listed under
 * each of them: it is one match and one joint trip, so two identical blocks
 * would say the same thing twice. A fixture naming none of our teams (only
 * reachable by editing the row by hand) still gets a group, under the empty
 * team name, so nothing silently disappears from the calendar.
 */
export function groupMatchDays(fixtures: readonly TeamFixture[], timeZone?: string): MatchDay[] {
  const days = new Map<string, Map<string, TeamFixture[]>>();
  for (const fixture of [...fixtures].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const day = dayKey(fixture.startsAt, timeZone);
    if (!day) continue;
    const teams = days.get(day) ?? new Map<string, TeamFixture[]>();
    days.set(day, teams);
    const team = joinNames(fixture.ourTeams);
    const existing = teams.get(team);
    if (existing) existing.push(fixture);
    else teams.set(team, [fixture]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, teams]) => ({
    day,
    count: [...teams.values()].reduce((total, group) => total + group.length, 0),
    teams: [...teams].map(([team, group]) => ({
      key: `${day}:${team}`,
      team,
      fixtures: group,
      startsAt: group[0].startsAt,
      venue: group.every((fixture) => fixture.venue === group[0].venue) ? group[0].venue || null : null,
    })).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.team.localeCompare(b.team, "nb")),
  }));
}

/**
 * The day's first throw-off for whichever squad plays this fixture. The
 * meet-up and the warm-up are counted back from it, so the second match of an
 * afternoon must not answer with its own kick-off.
 */
export function matchDayStart(fixtures: readonly TeamFixture[], fixture: TeamFixture, timeZone?: string) {
  const day = dayKey(fixture.startsAt, timeZone);
  const ours = new Set(fixture.ourTeams);
  const sameDay = fixtures.filter((candidate) => dayKey(candidate.startsAt, timeZone) === day
    && (candidate.id === fixture.id || candidate.ourTeams.some((team) => ours.has(team))));
  return sameDay.reduce((earliest, candidate) => candidate.startsAt < earliest ? candidate.startsAt : earliest, fixture.startsAt);
}

/** "A", "A og B", "A, B og C" — the way a Norwegian reads a list out loud. */
export function joinNames(names: readonly string[]) {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

export function fixtureTeamNames(fixtures: readonly TeamFixture[]) {
  return [...new Set(fixtures.flatMap((fixture) => fixture.ourTeams))].sort((a, b) => a.localeCompare(b, "nb"));
}

export function upcomingFixtures(fixtures: readonly TeamFixture[], now = new Date()) {
  return fixtures.filter((fixture) => Date.parse(fixture.startsAt) >= now.getTime() - 3 * 60 * 60 * 1000).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
