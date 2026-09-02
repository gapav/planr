export type TeamRole = "admin" | "coach";
export type SessionStatus = "draft" | "published";
export type SessionTab = "drafts" | "upcoming" | "past";
export type SessionItemKind = "exercise" | "custom";
export type ExerciseMediaKind = "image" | "youtube" | "vimeo" | "video";
export type SaveState = "saved" | "saving" | "offline" | "error";

export interface Profile { id: string; email: string; fullName: string; initials: string; color: string; isGlobalAdmin?: boolean; teamRole?: TeamRole; }
export interface Team { id: string; name: string; shortName: string; role: TeamRole; members: Profile[]; }
export interface Exercise {
  id: string; name: string; description: string; mediaUrl: string; mediaKind: ExerciseMediaKind;
  thumbnailUrl: string | null; createdBy: string; createdByName: string; archivedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface SessionItem {
  id: string; blockId: string; kind: SessionItemKind; exerciseId: string | null; title: string;
  description: string; mediaUrl: string | null; thumbnailUrl: string | null; durationMinutes: number;
  coachingNotes: string; position: number; updatedBy: string;
}
export interface SessionBlock { id: string; sessionId: string; title: string; position: number; items: SessionItem[]; updatedBy: string; }
export interface PlannedSession {
  id: string; teamId: string; title: string; startsAt: string | null; venue: string;
  plannedDurationMinutes: number; objective: string; notes: string; status: SessionStatus;
  blocks: SessionBlock[]; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}
export interface Collaborator extends Profile { activeBlockId: string | null; }
export interface TeamInvitation { id: string; teamId: string; email: string; role: TeamRole; expiresAt: string; acceptedAt: string | null; }
