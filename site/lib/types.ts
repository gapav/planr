export type TeamRole = "admin" | "coach";
export type SessionStatus = "draft" | "published" | "in_progress" | "completed";
export type SessionTab = "drafts" | "upcoming" | "past";
export type SessionItemKind = "exercise" | "custom";
export type ExerciseMediaKind = "image" | "youtube" | "vimeo" | "video";
export const EXERCISE_CATEGORIES = ["Forsvar", "Angrep", "Skuddferdigheter", "Målvakt", "Fysisk", "Leker"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export type SaveState = "saved" | "saving" | "offline" | "error";
export type SessionGroupingKind = "teams" | "pairs";

export interface Profile { id: string; email: string; fullName: string; initials: string; color: string; isGlobalAdmin?: boolean; mustSetPassword?: boolean; teamRole?: TeamRole; }
export interface Team { id: string; name: string; shortName: string; role: TeamRole; members: Profile[]; }
export interface TeamPlayer {
  id: string; teamId: string; fullName: string; jerseyNumber: string | null; createdAt: string; updatedAt: string;
}
export type TeamPlayerInput = Pick<TeamPlayer, "fullName" | "jerseyNumber">;
export interface Exercise {
  id: string; name: string; description: string; category: ExerciseCategory; mediaUrl: string | null; mediaKind: ExerciseMediaKind | null;
  thumbnailUrl: string | null; createdBy: string; createdByName: string; archivedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface SessionItem {
  id: string; blockId: string; kind: SessionItemKind; exerciseId: string | null; title: string;
  description: string; mediaUrl: string | null; thumbnailUrl: string | null; durationMinutes: number;
  coachingNotes: string; position: number; updatedBy: string;
}
export interface SessionBlock { id: string; sessionId: string; title: string; notes: string; position: number; items: SessionItem[]; updatedBy: string; }
export interface PlannedSession {
  id: string; teamId: string; title: string; startsAt: string | null; venue: string;
  plannedDurationMinutes: number; objective: string; notes: string; status: SessionStatus;
  startedAt?: string | null; completedAt?: string | null; groupingKind?: SessionGroupingKind | null;
  blocks: SessionBlock[]; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}
export interface Collaborator extends Profile { activeBlockId: string | null; }
export interface TeamInvitation { id: string; teamId: string; email: string; role: TeamRole; token: string | null; expiresAt: string; acceptedAt: string | null; }
export interface SessionAttendance { sessionId: string; playerId: string; isPresent: boolean; checkedInAt: string | null; }
export interface PlayerGroup { id: string; label: string; playerIds: string[]; }
export interface SessionGrouping { sessionId: string; kind: SessionGroupingKind; groups: PlayerGroup[]; generatedAt: string; }
