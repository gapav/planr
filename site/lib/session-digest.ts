/**
 * Which coaches get "dagens økt" in their inbox, and what is in it.
 *
 * Everything here is pure so the scheduled route stays a thin wiring layer:
 * the route reads rows with the secret key, claims what it is about to send,
 * and hands both to these functions. The rules that decide who gets mailed are
 * the interesting part, and they are testable without a database or a mailbox.
 *
 * Three of them are easy to get wrong:
 *
 *   - **The day is the club's day, not the server's.** Sessions are stored in
 *     UTC and the job runs in UTC, so "today" has to be derived in the club's
 *     own zone. An 18:00 session in Oslo is 16:00Z, and in late December a
 *     21:00 session would land on the *next* UTC day.
 *   - **Only a session the coach could actually run.** Drafts never mail. They
 *     have no agreed time, and `start_session` refuses them — a mail promising
 *     a session the app will not start is worse than no mail.
 *   - **One mail per coach, not per session.** A coach on two teams with two
 *     sessions the same day gets a single letter listing both.
 */

import { CLUB_TIME_ZONE } from "./time";
import type { SessionStatus } from "./types";

/** The statuses a digest may announce: planned, or already under way. */
const MAILABLE_STATUSES: readonly SessionStatus[] = ["published", "in_progress"];

/** The kind recorded in `session_email_log`; the table's check constraint knows it. */
export const DIGEST_KIND = "daily_digest";

export interface DigestItem {
  title: string;
  durationMinutes: number;
  coachingNotes: string;
  assignedCoachId: string | null;
}

export interface DigestBlock {
  title: string;
  notes: string;
  items: DigestItem[];
}

export interface DigestSession {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  startsAt: string;
  venue: string;
  plannedDurationMinutes: number;
  objective: string;
  notes: string;
  status: SessionStatus;
  blocks: DigestBlock[];
}

/** A coach on a team, as the job sees them. `email` comes from `profiles`. */
export interface DigestCoach {
  profileId: string;
  teamId: string;
  email: string;
  fullName: string;
  digestEnabled: boolean;
}

/** One session for one coach — the unit the log's primary key is built on. */
export interface DigestSend {
  sessionId: string;
  profileId: string;
  email: string;
}

/** What one coach is about to be sent, after the database granted the claims. */
export interface DigestMailing {
  recipient: { profileId: string; email: string; fullName: string };
  sessions: DigestSession[];
}

/** The half-open UTC interval covering one calendar day in the club's zone. */
export interface ClubDay {
  /** `YYYY-MM-DD` in the club's zone — the day the digest is about. */
  key: string;
  /** Inclusive lower bound, as an ISO instant. */
  from: string;
  /** Exclusive upper bound, as an ISO instant. */
  to: string;
}

/**
 * How far the zone is ahead of UTC at a given instant, in milliseconds.
 *
 * `Intl` is the only DST table available without a dependency: format the
 * instant as wall-clock time in the zone, read it back as if it were UTC, and
 * the difference is the offset.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(field("year"), field("month") - 1, field("day"), field("hour"), field("minute"), field("second"));
  return asUtc - instant.getTime();
}

/** Midnight at the start of `dayKey` in the zone, as a UTC instant. */
function zonedMidnight(dayKey: string, timeZone: string): Date {
  const naive = Date.parse(`${dayKey}T00:00:00Z`);
  // The offset depends on the instant, and the instant on the offset. One
  // correction settles it everywhere except inside a DST gap, which in Europe
  // falls at 02:00, never at midnight.
  const first = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(first), timeZone));
}

function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The club day `now` falls in. The job runs in the morning, so this is simply
 * "today" — but derived in the club's zone, which is the whole point.
 */
export function clubDay(now: Date, timeZone: string = CLUB_TIME_ZONE): ClubDay {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return {
    key,
    from: zonedMidnight(key, timeZone).toISOString(),
    to: zonedMidnight(addDays(key, 1), timeZone).toISOString(),
  };
}

/**
 * The sessions of that day worth mailing about, earliest first.
 *
 * The route already asks the database for this window, so the filter here is
 * belt and braces — but the status rule is not: it is the one place that
 * decides a draft never reaches an inbox.
 */
export function digestSessionsForDay(sessions: readonly DigestSession[], day: ClubDay): DigestSession[] {
  return sessions
    .filter((session) => MAILABLE_STATUSES.includes(session.status))
    .filter((session) => {
      const startsAt = Date.parse(session.startsAt);
      return Number.isFinite(startsAt) && startsAt >= Date.parse(day.from) && startsAt < Date.parse(day.to);
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Every (session, coach) pair the job would like to send, before the database
 * has said which of them are new. A coach who has opted out, or whose profile
 * carries no usable address, is dropped here rather than being claimed and then
 * skipped — a claim that never becomes a mail would suppress tomorrow's attempt
 * at the same session.
 */
export function plannedDigestSends(sessions: readonly DigestSession[], coaches: readonly DigestCoach[]): DigestSend[] {
  const sends: DigestSend[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    for (const coach of coaches) {
      if (coach.teamId !== session.teamId) continue;
      if (!coach.digestEnabled) continue;
      if (!coach.email.includes("@")) continue;
      const key = `${session.id}:${coach.profileId}`;
      // A coach cannot hold two memberships on one team, but the join that
      // produced these rows is not what guarantees it.
      if (seen.has(key)) continue;
      seen.add(key);
      sends.push({ sessionId: session.id, profileId: coach.profileId, email: coach.email });
    }
  }
  return sends;
}

/**
 * Turns the claims the database actually granted into one letter per coach.
 *
 * Claims for an unknown session or an unknown coach are ignored rather than
 * mailed blank: the log outlives nothing in particular, but a session deleted
 * between the read and the claim would otherwise produce an empty letter.
 */
export function digestMailings(
  claims: readonly DigestSend[],
  sessions: readonly DigestSession[],
  coaches: readonly DigestCoach[],
): DigestMailing[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const coachById = new Map(coaches.map((coach) => [coach.profileId, coach]));
  const byRecipient = new Map<string, DigestMailing>();
  for (const claim of claims) {
    const session = sessionsById.get(claim.sessionId);
    const coach = coachById.get(claim.profileId);
    if (!session || !coach) continue;
    const mailing = byRecipient.get(claim.profileId)
      ?? { recipient: { profileId: coach.profileId, email: coach.email, fullName: coach.fullName }, sessions: [] };
    if (!mailing.sessions.some((existing) => existing.id === session.id)) mailing.sessions.push(session);
    byRecipient.set(claim.profileId, mailing);
  }
  return [...byRecipient.values()].map((mailing) => ({
    ...mailing,
    sessions: [...mailing.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }));
}

/* -------------------------------------------------------------------------- */
/* Reading the database's shapes                                              */
/* -------------------------------------------------------------------------- */

/** What the route's nested select hands back for one session. */
export interface SessionDigestRow {
  id: string;
  team_id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  planned_duration_minutes: number | null;
  objective: string | null;
  notes: string | null;
  status: SessionStatus;
  teams: { name: string } | { name: string }[] | null;
  session_blocks: Array<{
    title: string;
    notes: string | null;
    position: number;
    session_items: Array<{
      title: string;
      description: string | null;
      duration_minutes: number | null;
      coaching_notes: string | null;
      assigned_coach_id: string | null;
      position: number;
      kind: string;
      exercise_id: string | null;
      exercises: { name: string } | { name: string }[] | null;
    }> | null;
  }> | null;
}

export interface CoachDigestRow {
  team_id: string;
  profile_id: string;
  profiles: {
    id: string;
    email: string;
    full_name: string;
    session_digest_email: boolean | null;
    deleted_at: string | null;
  } | null;
}

/** PostgREST returns an embedded to-one either as an object or as a one-element array. */
function embedded<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Row to domain. The exercise overlay is deliberate and mirrors
 * `resolveItemDisplay`: an item stores the exercise's title as it was when it
 * was added, but the library is what the app shows, so a renamed exercise must
 * read the same in the mail as it does on screen.
 */
export function mapDigestSession(row: SessionDigestRow): DigestSession | null {
  if (!row.starts_at) return null;
  const blocks = (row.session_blocks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => ({
      title: block.title,
      notes: block.notes ?? "",
      items: (block.session_items ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((item) => {
          const exercise = item.kind === "exercise" && item.exercise_id ? embedded(item.exercises) : null;
          return {
            title: exercise?.name ?? item.title,
            durationMinutes: item.duration_minutes ?? 0,
            coachingNotes: item.coaching_notes ?? "",
            assignedCoachId: item.assigned_coach_id,
          };
        }),
    }));
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: embedded(row.teams)?.name ?? "Laget",
    title: row.title,
    startsAt: row.starts_at,
    venue: row.venue ?? "",
    plannedDurationMinutes: row.planned_duration_minutes ?? 0,
    objective: row.objective ?? "",
    notes: row.notes ?? "",
    status: row.status,
    blocks,
  };
}

/** A membership row to a coach. A deleted profile is a tombstone, never a recipient. */
export function mapDigestCoach(row: CoachDigestRow): DigestCoach | null {
  if (!row.profiles || row.profiles.deleted_at) return null;
  return {
    profileId: row.profiles.id,
    teamId: row.team_id,
    email: row.profiles.email,
    fullName: row.profiles.full_name,
    // The column is `not null default true`; a null could only come from a
    // select that did not reach it. Reading that as opted-in matches the
    // default, and the toggle is the only thing that ever writes false.
    digestEnabled: row.profiles.session_digest_email !== false,
  };
}
