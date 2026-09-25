import { deriveSessionTab } from "./session";
import type { AdminAccount, AdminTeam, AdminTeamMember, PlannedSession, SessionTab, TeamInvitation, TeamRole } from "./types";
import { COACH_AVATAR_PEER } from "./team-palette";
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
      initials: initials(member.full_name), color: COACH_AVATAR_PEER, teamRole: member.role,
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

/** One entry of the global-admin-only `admin_list_accounts()` payload. */
export interface AdminAccountRow {
  id: string; email: string; full_name: string; is_global_admin: boolean;
  created_at: string; last_sign_in_at: string | null; files_owned: number;
  memberships: Array<{ team_id: string; team_name: string; role: TeamRole }>;
}

export function mapAdminAccount(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    initials: initials(row.full_name),
    isGlobalAdmin: row.is_global_admin,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    filesOwned: Number(row.files_owned ?? 0),
    memberships: (row.memberships ?? []).map((membership) => ({
      teamId: membership.team_id,
      teamName: membership.team_name,
      teamRole: membership.role,
    })),
  };
}

export function sortAdminAccounts(accounts: readonly AdminAccount[]): AdminAccount[] {
  return [...accounts].sort((left, right) => left.fullName.localeCompare(right.fullName, "nb") || left.email.localeCompare(right.email, "nb"));
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

/**
 * Splits the loaded plans into the coach's own teams and everyone else's.
 *
 * Since 202609250001 a global admin reads every team's sessions, so the one
 * `sessions` query returns plans from teams they are not on. Those must not
 * reach the coach screens — Today would pick another team's workout, and the
 * builder would offer edits RLS refuses — so they are handed to the console
 * instead. `null` means the memberships could not be read; everything then
 * stays with the coach, as it did before the split existed.
 */
export function partitionSessionsByMembership<T extends { teamId: string }>(sessions: readonly T[], memberTeamIds: ReadonlySet<string> | null): { own: T[]; others: T[] } {
  if (!memberTeamIds) return { own: [...sessions], others: [] };
  const own: T[] = []; const others: T[] = [];
  for (const session of sessions) (memberTeamIds.has(session.teamId) ? own : others).push(session);
  return { own, others };
}

const nb = (value: string) => value.toLocaleLowerCase("nb-NO");

/** Which teams the console lists: all of them, or only the ones nobody administers yet. */
export type AdminTeamFilter = "all" | "needs-admin";

/**
 * The team table's search. A platform owner looks a team up by the squad, the
 * club, or a coach they were asked about, so the members and pending
 * invitations are searched too.
 */
export function filterAdminTeams(teams: readonly AdminTeam[], query: string, filter: AdminTeamFilter = "all"): AdminTeam[] {
  const needle = nb(query.trim());
  return teams.filter((team) => {
    if (filter === "needs-admin" && !teamNeedsAdmin(team)) return false;
    if (!needle) return true;
    return [team.name, team.shortName, ...team.members.flatMap((member) => [member.fullName, member.email]), ...team.invitations.map((invitation) => invitation.email)]
      .some((value) => nb(value).includes(needle));
  });
}

export type SessionTabCounts = Record<SessionTab, number>;

/** How many plans each team has in each calendar tab, for the team table. */
export function sessionCountsByTeam(sessions: readonly PlannedSession[], now = new Date()): Map<string, SessionTabCounts> {
  const counts = new Map<string, SessionTabCounts>();
  for (const session of sessions) {
    const entry = counts.get(session.teamId) ?? { upcoming: 0, drafts: 0, past: 0 };
    entry[deriveSessionTab(session, now)] += 1;
    counts.set(session.teamId, entry);
  }
  return counts;
}

/**
 * One team's plans in one tab, in the order the coach's own calendar uses:
 * upcoming soonest first, past most recent first, drafts by last touched.
 */
export function teamSessionsInTab(sessions: readonly PlannedSession[], teamId: string, tab: SessionTab, now = new Date()): PlannedSession[] {
  const start = (session: PlannedSession) => session.startsAt ?? "";
  return sessions
    .filter((session) => session.teamId === teamId && deriveSessionTab(session, now) === tab)
    .sort((a, b) => tab === "upcoming" ? start(a).localeCompare(start(b)) : tab === "past" ? start(b).localeCompare(start(a)) : b.updatedAt.localeCompare(a.updatedAt));
}

/** Account directory filters: the two states an owner acts on when tidying up. */
export type AdminAccountFilter = "all" | "no-team" | "never-signed-in";

export function filterAdminAccounts(accounts: readonly AdminAccount[], query: string, filter: AdminAccountFilter = "all"): AdminAccount[] {
  const needle = nb(query.trim());
  return accounts.filter((account) => {
    if (filter === "no-team" && account.memberships.length > 0) return false;
    if (filter === "never-signed-in" && account.lastSignInAt) return false;
    if (!needle) return true;
    return [account.fullName, account.email, ...account.memberships.map((membership) => membership.teamName)].some((value) => nb(value).includes(needle));
  });
}

/** The figures across the top of the console. */
export function adminOverview(teams: readonly AdminTeam[], accounts: readonly AdminAccount[]) {
  return {
    teams: teams.length,
    accounts: accounts.length,
    pendingInvitations: teams.reduce((sum, team) => sum + team.invitations.length, 0),
    teamsNeedingAdmin: teams.filter(teamNeedsAdmin).length,
  };
}
