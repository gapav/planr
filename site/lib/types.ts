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
export interface Team { id: string; name: string; shortName: string; logoUrl: string | null; role: TeamRole; members: Profile[]; }
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
export interface AdminTeamMember extends Profile { teamRole: TeamRole; }
/** A team as the platform owner sees it: every member and pending invitation, membership or not. */
export interface AdminTeam { id: string; name: string; shortName: string; logoUrl: string | null; members: AdminTeamMember[]; invitations: TeamInvitation[]; }
/**
 * One match from the club's tournament export. `ourTeams` holds the club's own
 * teams taking part — a division report lists every team in the group, and the
 * coach picks which of them belong on this calendar (a club splits an age group
 * into "Rød", "Blå", …, and a match can be a derby between two of them).
 */
export interface TeamFixture {
  id: string; teamId: string; matchNumber: string; startsAt: string; homeTeam: string; awayTeam: string;
  ourTeams: string[]; result: string; venue: string; organizer: string; tournament: string;
  createdAt: string; updatedAt: string;
}
export type TeamFixtureInput = Omit<TeamFixture, "id" | "teamId" | "createdAt" | "updatedAt">;

/**
 * A warm-up activity. Like a session item it carries its own copy of the
 * exercise's display data, taken when it was added, so later library edits
 * never rewrite a routine the team has already drilled.
 */
export interface WarmupItem {
  id: string; routineId: string; kind: SessionItemKind; exerciseId: string | null; title: string;
  description: string; mediaUrl: string | null; thumbnailUrl: string | null; durationMinutes: number;
  coachingNotes: string; position: number;
}
/**
 * The standing pre-match routine. It belongs to the team rather than to one
 * match: the same activities run before every fixture, so the calendar shows
 * this against each match instead of storing a copy per match.
 */
export interface WarmupRoutine {
  id: string; teamId: string; name: string; isDefault: boolean; meetMinutesBefore: number; notes: string;
  items: WarmupItem[]; createdAt: string; updatedAt: string;
}
export type WarmupRoutinePatch = Partial<Pick<WarmupRoutine, "name" | "meetMinutesBefore" | "notes">>;
export type WarmupItemPatch = Partial<Pick<WarmupItem, "title" | "description" | "durationMinutes" | "coachingNotes">>;
