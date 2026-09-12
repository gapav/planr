import { monthKey, monthLabel, shiftMonth } from "./fixtures";
import type { PlannedSession, Profile, SessionBlock, SessionItem, SessionTab } from "./types";
export function blockDuration(block: SessionBlock) { return block.items.reduce((total, item) => total + item.durationMinutes, 0); }
export function sessionDuration(session: PlannedSession) { return session.blocks.reduce((total, block) => total + blockDuration(block), 0); }
export function deriveSessionTab(session: PlannedSession, now = new Date()): SessionTab {
  if (session.status === "draft") return "drafts";
  if (session.status === "in_progress") return "upcoming";
  if (session.status === "completed") return "past";
  if (!session.startsAt) return "drafts";
  const end = new Date(session.startsAt).getTime() + session.plannedDurationMinutes * 60_000;
  return end < now.getTime() ? "past" : "upcoming";
}

// A coach who is no longer on the team, standing in for the name we cannot
// look up any more. Nothing writes this profile; it exists so a picker can
// keep showing an assignment instead of silently reading as unassigned.
const DEPARTED_COACH_NAME = "Trener utenfor laget";

/** The coach running an activity, or null when the whole coaching team does. */
export function assignedCoach(item: Pick<SessionItem, "assignedCoachId">, members: readonly Profile[]): Profile | null {
  if (!item.assignedCoachId) return null;
  return members.find((member) => member.id === item.assignedCoachId) ?? null;
}

/**
 * Who the picker offers for one activity: the team's coaches, plus the coach
 * the item already names when they have since left the team. Without that last
 * entry the select would fall back to its empty option and read as "nobody is
 * responsible" — while the stored assignment quietly stayed put, and touching
 * any other field on the row saved it again.
 */
export function coachAssignmentOptions(item: Pick<SessionItem, "assignedCoachId">, members: readonly Profile[]): Profile[] {
  const assignedId = item.assignedCoachId;
  if (!assignedId || members.some((member) => member.id === assignedId)) return [...members];
  return [...members, { id: assignedId, email: "", fullName: DEPARTED_COACH_NAME, initials: "?", color: "#8b9692" }];
}

export function validatePublish(session: PlannedSession) {
  const issues: string[] = [];
  if (!session.title.trim()) issues.push("Legg til en økttittel");
  if (!session.startsAt) issues.push("Velg dato og klokkeslett");
  if (session.plannedDurationMinutes <= 0) issues.push("Angi planlagt varighet");
  if (!session.blocks.length) issues.push("Legg til minst én bolk");
  return issues;
}

const DAY_MS = 86_400_000;
// Calendar days, not elapsed hours: an evening session and the next morning are
// "i dag"/"i morgen" even though they are only twelve hours apart. `timeZone` is
// only passed by tests; the app always renders in the viewer's zone.
function calendarDay(date: Date, timeZone?: string) {
  const iso = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date);
  return Date.parse(`${iso}T00:00:00Z`);
}
export function calendarDaysUntil(startsAt: string | null, now = new Date(), timeZone?: string) {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((calendarDay(date, timeZone) - calendarDay(now, timeZone)) / DAY_MS);
}
export function relativeDayLabel(startsAt: string | null, now = new Date(), timeZone?: string) {
  const days = calendarDaysUntil(startsAt, now, timeZone);
  if (days === null) return null;
  if (days === 0) return "I dag";
  if (days === 1) return "I morgen";
  if (days === -1) return "I går";
  // Past the coming week the calendar chip on the row says it better than a
  // count of days does.
  if (days > 1 && days <= 6) return `Om ${days} dager`;
  if (days < -1 && days >= -6) return `For ${-days} dager siden`;
  return null;
}

// Starting is only ever the next thing you do. A plan four weeks out gets no
// primary action, so one orange button stands in a list instead of ten.
export function isSessionStartable(session: PlannedSession, now = new Date(), timeZone?: string) {
  if (session.status === "in_progress") return true;
  if (session.status !== "published") return false;
  return calendarDaysUntil(session.startsAt, now, timeZone) === 0;
}

// The installed app opens straight into the hall, so "today" has to resolve to
// the one plan a coach is about to run. Startability is the same test the
// calendar's Start button uses, so a draft dated today never qualifies: it has
// no agreed time and the database refuses to start it. A workout already under
// way wins outright, whatever day it was started on — finishing it is the only
// thing the coach can do next.
export function pickTodaySession(sessions: PlannedSession[], now = new Date(), timeZone?: string) {
  const startable = sessions.filter((session) => isSessionStartable(session, now, timeZone));
  return [...startable].sort((a, b) => {
    if ((a.status === "in_progress") !== (b.status === "in_progress")) return a.status === "in_progress" ? -1 : 1;
    return (a.startsAt ?? "").localeCompare(b.startsAt ?? "");
  })[0] ?? null;
}

// Rows further out than the coming week shrink to a single line: still listed
// in full, but no longer competing with the sessions being prepared for.
export function isNearTerm(session: PlannedSession, now = new Date(), timeZone?: string) {
  if (session.status === "in_progress") return true;
  const days = calendarDaysUntil(session.startsAt, now, timeZone);
  return days !== null && days >= 0 && days <= 6;
}

// Months are the section unit in the calendar tabs: a team runs a handful of
// sessions a month, so week headers would outnumber the rows they group. The
// incoming order is preserved, so Upcoming (ascending) and Past (descending)
// both get their months in the direction they already sort.
export function groupSessionsByMonth(sessions: PlannedSession[], timeZone?: string) {
  const groups: Array<{ key: string; label: string; sessions: PlannedSession[] }> = [];
  for (const session of sessions) {
    const date = session.startsAt ? new Date(session.startsAt) : null;
    const dated = date && !Number.isNaN(date.getTime()) ? date : null;
    const zone = timeZone ? { timeZone } : {};
    const key = dated ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", ...zone }).format(dated) : "no-date";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.sessions.push(session);
    else groups.push({ key, label: dated ? new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric", ...zone }).format(dated) : "Uten dato", sessions: [session] });
  }
  return groups;
}

// How far ahead the calendar lists months that hold nothing yet.
export const MIN_FUTURE_MONTHS = 4;

/**
 * The Upcoming tab's sections. Unlike `groupSessionsByMonth` this is a calendar,
 * not a list of what exists: a coach decides what the month is about before the
 * sessions carrying it are scheduled, so this month and the next
 * `MIN_FUTURE_MONTHS` are always sections even when empty. Months that do hold a
 * session are added on top, including one already begun — an in-progress workout
 * stays in Upcoming after its own month has passed.
 *
 * Undated sessions keep their own trailing section and are never padded around.
 */
export function calendarMonthGroups(sessions: PlannedSession[], now = new Date(), timeZone?: string) {
  const grouped = groupSessionsByMonth(sessions, timeZone);
  const undated = grouped.filter((group) => group.key === "no-date");
  // `groupSessionsByMonth` only merges runs, so a month split by an out-of-order
  // session arrives as two groups. Collect by key rather than overwriting.
  const byKey = new Map<string, PlannedSession[]>();
  for (const group of grouped) {
    if (group.key === "no-date") continue;
    byKey.set(group.key, [...(byKey.get(group.key) ?? []), ...group.sessions]);
  }
  const start = monthKey(now, timeZone);
  for (let ahead = 0; ahead <= MIN_FUTURE_MONTHS; ahead += 1) {
    const key = shiftMonth(start, ahead);
    if (!byKey.has(key)) byKey.set(key, []);
  }
  // `YYYY-MM` sorts chronologically as text.
  const dated = [...byKey.keys()].sort().map((key) => ({ key, label: monthLabel(key), sessions: byKey.get(key) ?? [] }));
  return [...dated, ...undated];
}

// `position` is a unique key per parent in Postgres, not an array index, and a
// delete leaves the surviving rows where they are. Appending at `length` would
// therefore reuse a position that still exists after any middle row was
// removed, and the insert dies on the unique constraint. Take the high-water
// mark instead and let the gaps stand; only the reorder RPCs renumber, and
// nothing but the sort order reads the number.
export function nextPosition(rows: Array<{ position: number }>) {
  return rows.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

// Scheduling a training session is a quarter-hour decision: the free minute
// field of `datetime-local` made the coach type "00" on every plan, so the
// builder pairs a date input with a select built from this grid instead.
export const SESSION_TIME_STEP_MINUTES = 15;
export const DEFAULT_SESSION_TIME = "16:00";
/** The title `createSession` gives a plan, and the one the builder replaces. */
export const UNTITLED_SESSION_TITLE = "Økt uten tittel";

function pad(value: number) { return String(value).padStart(2, "0"); }

/** The hours of the day — the only list in the time picker long enough to scroll. */
export const SESSION_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => pad(hour));

/**
 * The minutes offered beside the hour. Four buttons rather than a list: the
 * whole point of the quarter-hour grid is that the minute is a single click.
 * A session saved off the grid — by an older build, or by another client —
 * keeps its own minute as a fifth option, so opening the builder never
 * silently rounds it.
 */
export function sessionMinuteOptions(current?: string | null) {
  const options: string[] = [];
  for (let minutes = 0; minutes < 60; minutes += SESSION_TIME_STEP_MINUTES) options.push(pad(minutes));
  if (current && !options.includes(current)) options.push(current);
  return options.sort();
}

/** `HH:MM` as its two fields, falling back to the default for anything malformed. */
export function splitSessionTime(time: string) {
  const [hour, minute] = (/^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_SESSION_TIME).split(":");
  return { hour, minute };
}

/** `startsAt` as the two local-time fields the builder edits. */
export function splitSessionStart(startsAt: string | null) {
  const date = startsAt ? new Date(startsAt) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: "", time: DEFAULT_SESSION_TIME };
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

/** The inverse: local `YYYY-MM-DD` + `HH:MM` back to the stored UTC instant. */
export function combineSessionStart(date: string, time: string) {
  if (!date) return null;
  const at = new Date(`${date}T${time || DEFAULT_SESSION_TIME}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

// `timeZone` is only passed by tests; the app always reads the viewer's zone.
function zonedYearMonthDay(date: Date, timeZone?: string) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date).split("-").map(Number);
  return { year, month, day };
}

/** ISO-8601 week number — the week a Norwegian club's calendar is spoken in. */
export function isoWeekNumber(date: Date, timeZone?: string) {
  const { year, month, day } = zonedYearMonthDay(date, timeZone);
  // The week belongs to the year holding its Thursday, so shift there first.
  const thursday = new Date(Date.UTC(year, month - 1, day));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  return Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7);
}

/** `Uke 38 - fredag`: the name a coach would have typed anyway. */
export function autoSessionTitle(startsAt: string, timeZone?: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return UNTITLED_SESSION_TITLE;
  const weekday = new Intl.DateTimeFormat("nb-NO", { weekday: "long", ...(timeZone ? { timeZone } : {}) }).format(date);
  return `Uke ${isoWeekNumber(date, timeZone)} - ${weekday}`;
}

const AUTO_TITLE = /^Uke \d{1,2} - \p{L}+$/u;
/**
 * Whether the plan is still carrying a name nobody chose — blank, the placeholder
 * `createSession` writes, or an earlier `autoSessionTitle`. Moving the date
 * renames those and leaves anything the coach typed alone.
 */
export function isAutoSessionTitle(title: string) {
  const trimmed = title.trim();
  return !trimmed || trimmed === UNTITLED_SESSION_TITLE || AUTO_TITLE.test(trimmed);
}

/** A finished plan is the only one with anything to reopen. */
export function canReopenSession(session: Pick<PlannedSession, "status">) {
  return session.status === "completed";
}

/**
 * Which tab a reopened plan actually lands in. The tabs are derived from the
 * date rather than stored, so a workout held last month goes back to "ready to
 * start" and still sits under Gjennomførte until somebody gives it a new date
 * — the one thing the confirm dialog has to say out loud.
 */
export function reopenedSessionTab(session: PlannedSession, now = new Date()): SessionTab {
  return deriveSessionTab({ ...session, status: "published" }, now);
}

/** The source's own weekday and time, moved forward in whole weeks from today. */
function nextWeeklySlot(date: string, now: Date) {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return "";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  do { at.setDate(at.getDate() + 7); } while (at.getTime() < today);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * What the copy dialog opens on. A copy is nearly always the same session again
 * next week, so it offers the source's own weekday and time — moved forward in
 * whole weeks until it is no longer behind us, so copying a plan from three
 * weeks ago proposes the coming week rather than a date already gone. An
 * undated source stays undated: there is nothing to move.
 *
 * The title is the source's own, unless that is still a name nobody chose, in
 * which case the proposed date names it the way the builder would.
 */
export function sessionCopyDefaults(session: PlannedSession, now = new Date(), timeZone?: string) {
  const start = splitSessionStart(session.startsAt);
  const date = start.date ? nextWeeklySlot(start.date, now) : "";
  const startsAt = combineSessionStart(date, start.time);
  return { title: startsAt && isAutoSessionTitle(session.title) ? autoSessionTitle(startsAt, timeZone) : session.title, date, time: start.time };
}

/**
 * The copy that `copy_session` makes, built in the browser for demo mode. The
 * two have to agree: the plan and everything in it comes along, the date is the
 * one the coach just chose, the status is always a fresh draft, and attendance
 * and groups stay behind with the evening they belong to.
 *
 * `memberIds` drops an activity's coach once they have left the team, matching
 * the database, where `validate_session_item_coach` would refuse the insert and
 * take the whole copy down with it. Left out, every assignment is kept.
 */
export function buildSessionCopy(source: PlannedSession, options: { id: string; title: string; startsAt: string | null; userId: string; makeId(): string; memberIds?: readonly string[]; now?: Date }): PlannedSession {
  const now = (options.now ?? new Date()).toISOString();
  const keepsCoach = (coachId: string | null) => coachId !== null && (options.memberIds?.includes(coachId) ?? true);
  return {
    ...source,
    id: options.id,
    title: options.title.trim() || source.title,
    startsAt: options.startsAt,
    status: "draft",
    startedAt: null, completedAt: null, groupingKind: null,
    createdBy: options.userId, updatedBy: options.userId, createdAt: now, updatedAt: now,
    blocks: source.blocks.map((block) => {
      const blockId = options.makeId();
      return {
        ...block, id: blockId, sessionId: options.id, updatedBy: options.userId,
        items: block.items.map((item) => ({ ...item, id: options.makeId(), blockId, assignedCoachId: keepsCoach(item.assignedCoachId) ? item.assignedCoachId : null, updatedBy: options.userId })),
      };
    }),
  };
}
