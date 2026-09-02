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
