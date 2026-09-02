import type { PlannedSession, SessionBlock, SessionTab } from "./types";
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
