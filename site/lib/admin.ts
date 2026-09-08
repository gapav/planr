import type { AdminTeam, AdminTeamMember, TeamInvitation, TeamRole } from "./types";
import { initials } from "./utils";

/**
 * The label a team is known by in the UI.
 *
 * Team names are written "Club — Squad", and every screen but the admin console
 * shows only the squad half. Shared with `loadPrivateData` so the sidebar
 * switcher and the console agree on what a team is called.
 */
export function shortTeamName(name: string) { return name.split("—").at(-1)?.trim() || name; }

/** One entry of the `admin_list_teams()` payload. */
export interface AdminTeamRow {
  id: string; name: string; logo_url: string | null;
  members: Array<{ id: string; email: string; full_name: string; role: TeamRole }>;
  invitations: Array<{ id: string; email: string; role: TeamRole; token: string; expires_at: string }>;
}

export function mapAdminTeam(row: AdminTeamRow): AdminTeam {
  return {
    id: row.id,
    name: row.name,
    shortName: shortTeamName(row.name),
    logoUrl: row.logo_url,
    members: (row.members ?? []).map((member): AdminTeamMember => ({
      id: member.id, email: member.email, fullName: member.full_name,
      initials: initials(member.full_name), color: "#477b70", teamRole: member.role,
    })),
    invitations: (row.invitations ?? []).map((invitation): TeamInvitation => ({
      id: invitation.id, teamId: row.id, email: invitation.email, role: invitation.role,
      token: invitation.token, expiresAt: invitation.expires_at, acceptedAt: null,
    })),
  };
}

export function sortAdminTeams(teams: readonly AdminTeam[]): AdminTeam[] {
  return [...teams].sort((left, right) => left.shortName.localeCompare(right.shortName, "nb"));
}

export function teamAdminCount(team: AdminTeam) { return team.members.filter((member) => member.teamRole === "admin").length; }

export function isTeamMemberOf(team: AdminTeam, profileId: string | null | undefined) {
  return Boolean(profileId) && team.members.some((member) => member.id === profileId);
}

/**
 * Whether removing this member — or demoting them to coach — will be accepted.
 *
 * Mirrors the `protect_last_team_admin` trigger, which raises on the last team
 * admin unless the caller administers the platform. Checking it here is what
 * lets the console disable the control instead of surfacing a Postgres error
 * after the click.
 */
export function canDemoteMember(team: AdminTeam, profileId: string, actorIsGlobalAdmin: boolean) {
  if (actorIsGlobalAdmin) return true;
  const member = team.members.find((entry) => entry.id === profileId);
  if (!member || member.teamRole !== "admin") return true;
  return teamAdminCount(team) > 1;
}

/** A team with nobody on it cannot plan anything, so the console calls it out. */
export function teamNeedsAdmin(team: AdminTeam) {
  return teamAdminCount(team) === 0 && !team.invitations.some((invitation) => invitation.role === "admin");
}
