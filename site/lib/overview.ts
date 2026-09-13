import { dayKey, fixtureOpponent, groupMatchDays, joinNames, monthKey, upcomingFixtures } from "./fixtures";
import { deriveSessionTab } from "./session";
import type { MonthFocus, PlannedSession, TeamFixture, WarmupRoutine } from "./types";
import { warmupSchedule } from "./warmup";

/** Shared calendar rules, with an in-progress workout always taking priority. */
export function overviewSessions(sessions: PlannedSession[], teamId: string | undefined, now = new Date()) {
  const teamSessions = teamId ? sessions.filter((session) => session.teamId === teamId) : [];
  const upcoming = teamSessions.filter((session) => deriveSessionTab(session, now) === "upcoming")
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const drafts = teamSessions.filter((session) => session.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { next: upcoming[0] ?? null, draft: drafts[0] ?? null };
}

/**
 * The next match, with the two things the calendar knows and the card cannot
 * derive on its own: who the opponent is once the club's own teams are taken
 * out of the fixture, and when the squad meets. `upcomingFixtures` keeps a
 * match visible for three hours past the throw-off, the same grace an
 * `in_progress` session gets above, so both cards behave alike on a match day.
 */
export function overviewFixture(
  fixtures: TeamFixture[], teamId: string | undefined, warmupRoutines: WarmupRoutine[], now = new Date(),
) {
  if (!teamId) return null;
  const upcoming = upcomingFixtures(fixtures.filter((row) => row.teamId === teamId), now);
  const fixture = upcoming[0];
  if (!fixture) return null;
  const routine = warmupRoutines.find((candidate) => candidate.teamId === teamId && candidate.isDefault)
    ?? warmupRoutines.find((candidate) => candidate.teamId === teamId)
    ?? null;
  // At this age group a squad plays two or three matches back to back, so the
  // card is about the day, not the fixture: one trip, one meet-up. Grouped over
  // the upcoming fixtures, so once the morning match is played the card is
  // about what is left. `day` is null when only one match is ahead.
  const sameDay = upcoming.filter((row) => dayKey(row.startsAt) === dayKey(fixture.startsAt));
  const group = groupMatchDays(sameDay)[0]?.teams.find((entry) => entry.fixtures.some((row) => row.id === fixture.id)) ?? null;
  const day = group && group.fixtures.length > 1 ? group : null;
  const startsAt = day ? day.startsAt : fixture.startsAt;
  // No routine is the normal state for a team that has not written one, so the
  // card simply drops the line rather than guessing a meet-up time.
  const meetAt = routine ? warmupSchedule(startsAt, routine)?.meetAt ?? null : null;
  const opponents = day ? joinNames(day.fixtures.map((row) => fixtureOpponent(row).opponent)) : null;
  return { fixture, day, startsAt, venue: day ? day.venue : fixture.venue, opponents, meetAt, ...fixtureOpponent(fixture) };
}

/**
 * The focus for the month the coach is standing in, keyed the way the session
 * calendar keys it so the two can never disagree about which month it is.
 */
export function overviewFocus(monthFocus: MonthFocus[], teamId: string | undefined, now = new Date(), timeZone?: string) {
  if (!teamId) return null;
  const month = monthKey(now, timeZone);
  return monthFocus.find((entry) => entry.teamId === teamId && entry.month === month) ?? null;
}

/**
 * The greeting on the front page. Nineteen lines so the trenerrom does not open
 * with the exact same sentence every morning; they all ask the same thing, so
 * the button below reads the same whichever one turns up.
 */
export const overviewHeadlines = [
  "Klar for neste økt?",
  "Hva skal laget øve på framover?",
  "Skal vi planlegge en økt?",
  "Klar for en ny treningsøkt?",
  "Hva står på planen denne uka?",
  "Ny dag, ny økt?",
  "Skal vi sette opp treningen denne uka?",
  "Hva vil du jobbe med på neste økt?",
  "Klar for å legge en plan?",
  "Skal vi finne på noe bra denne uka?",
  "Hvordan blir neste trening?",
  "Klar for hallen?",
  "Hva skal gjengen gjøre denne uka?",
  "Skal vi bygge neste økt?",
  "Klar for å planlegge?",
  "Hva blir temaet denne uka?",
  "Klar for å komme i gang?",
  "Hva skal vi trene på?",
  "Skal vi gjøre klar neste trening?",
] as const;

/** Picks one greeting. Call it on the client only — the server has no opinion. */
export function overviewHeadline(random = Math.random()) {
  const index = Math.min(overviewHeadlines.length - 1, Math.max(0, Math.floor(random * overviewHeadlines.length)));
  return overviewHeadlines[index];
}

/**
 * The salutation above the headline, read off the coach's own clock. `now` is
 * null until the browser has one, and a server rendering the hour would be
 * rendering it in the wrong time zone anyway, so that case keeps the neutral
 * "Hei".
 */
export function overviewSalutation(now: Date | null) {
  if (!now) return "Hei";
  const hour = now.getHours();
  if (hour < 5) return "God natt";
  if (hour < 10) return "God morgen";
  if (hour < 18) return "Hei";
  if (hour < 23) return "God kveld";
  return "God natt";
}
