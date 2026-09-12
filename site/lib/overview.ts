import { deriveSessionTab } from "./session";
import type { PlannedSession } from "./types";

/** Shared calendar rules, with an in-progress workout always taking priority. */
export function overviewSessions(sessions: PlannedSession[], teamId: string | undefined, now = new Date()) {
  const teamSessions = teamId ? sessions.filter((session) => session.teamId === teamId) : [];
  const upcoming = teamSessions.filter((session) => deriveSessionTab(session, now) === "upcoming")
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const drafts = teamSessions.filter((session) => session.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { next: upcoming[0] ?? null, draft: drafts[0] ?? null };
}
