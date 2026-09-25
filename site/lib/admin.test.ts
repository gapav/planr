import { describe, expect, it } from "vitest";
import { COACH_AVATAR_PEER } from "./team-palette";
import { adminOverview, canDemoteMember, filterAdminAccounts, filterAdminTeams, isTeamMemberOf, mapAdminAccount, mapAdminTeam, partitionSessionsByMembership, sessionCountsByTeam, teamSessionsInTab, shortTeamName, sortAdminAccounts, sortAdminTeams, teamAdminCount, teamNeedsAdmin, type AdminAccountRow, type AdminTeamRow } from "./admin";
import type { AdminAccount, PlannedSession } from "./types";

function row(overrides: Partial<AdminTeamRow> = {}): AdminTeamRow {
  return {
    id: "team-1", name: "Fjordvik HK — Jenter 16", logo_url: null,
    members: [{ id: "coach-1", email: "trener@klubb.no", full_name: "Kari Nordmann", role: "admin" }],
    invitations: [],
    ...overrides,
  };
}

describe("admin console teams", () => {
  it("maps an admin_list_teams row to the domain shape", () => {
    const team = mapAdminTeam(row({
      invitations: [{ id: "inv-1", email: "ny@klubb.no", role: "coach", token: "token-1", expires_at: "2026-10-01T10:00:00Z" }],
    }));
    expect(team.shortName).toBe("Jenter 16");
    expect(team.members).toEqual([{ id: "coach-1", email: "trener@klubb.no", fullName: "Kari Nordmann", initials: "KN", color: COACH_AVATAR_PEER, teamRole: "admin" }]);
    expect(team.invitations[0]).toMatchObject({ teamId: "team-1", email: "ny@klubb.no", token: "token-1", acceptedAt: null });
  });

  it("keeps a team name that has no club prefix", () => {
    expect(shortTeamName("Jenter 16")).toBe("Jenter 16");
    expect(shortTeamName("Fjordvik HK — ")).toBe("Fjordvik HK — ");
  });

  it("survives a payload with no members or invitations", () => {
    const team = mapAdminTeam({ id: "team-2", name: "Nytt lag", logo_url: null } as unknown as AdminTeamRow);
    expect(team.members).toEqual([]);
    expect(team.invitations).toEqual([]);
    expect(teamAdminCount(team)).toBe(0);
  });

  it("sorts teams by the name coaches see", () => {
    const teams = [mapAdminTeam(row({ id: "b", name: "Fjordvik HK — Ålesund 2" })), mapAdminTeam(row({ id: "a", name: "Fjordvik HK — Gutter 18" }))];
    expect(sortAdminTeams(teams).map((team) => team.id)).toEqual(["a", "b"]);
  });

  it("flags a team that has nobody to run it", () => {
    const empty = mapAdminTeam(row({ members: [] }));
    expect(teamNeedsAdmin(empty)).toBe(true);
    expect(teamNeedsAdmin(mapAdminTeam(row()))).toBe(false);
    const invited = mapAdminTeam(row({ members: [], invitations: [{ id: "inv-1", email: "ny@klubb.no", role: "admin", token: "t", expires_at: "2026-10-01T10:00:00Z" }] }));
    expect(teamNeedsAdmin(invited)).toBe(false);
  });

  it("protects the last team admin from a team admin but not from the platform owner", () => {
    const team = mapAdminTeam(row({
      members: [
        { id: "coach-1", email: "a@klubb.no", full_name: "Kari Nordmann", role: "admin" },
        { id: "coach-2", email: "b@klubb.no", full_name: "Ola Nordmann", role: "coach" },
      ],
    }));
    expect(canDemoteMember(team, "coach-1", false)).toBe(false);
    expect(canDemoteMember(team, "coach-1", true)).toBe(true);
    expect(canDemoteMember(team, "coach-2", false)).toBe(true);
  });

  it("allows removing an admin while another one remains", () => {
    const team = mapAdminTeam(row({
      members: [
        { id: "coach-1", email: "a@klubb.no", full_name: "Kari Nordmann", role: "admin" },
        { id: "coach-2", email: "b@klubb.no", full_name: "Ola Nordmann", role: "admin" },
      ],
    }));
    expect(canDemoteMember(team, "coach-1", false)).toBe(true);
  });

  it("knows whether the platform owner is on a team", () => {
    const team = mapAdminTeam(row());
    expect(isTeamMemberOf(team, "coach-1")).toBe(true);
    expect(isTeamMemberOf(team, "owner")).toBe(false);
    expect(isTeamMemberOf(team, null)).toBe(false);
  });
});

describe("admin account directory", () => {
  const accountRow: AdminAccountRow = {
    id: "coach-1", email: "trener@klubb.no", full_name: "Kari Nordmann", is_global_admin: false,
    created_at: "2026-09-01T10:00:00Z", last_sign_in_at: null, files_owned: 2,
    memberships: [{ team_id: "team-1", team_name: "Fjordvik HK — Jenter 16", role: "coach" }],
  };

  it("maps account audit data and team memberships", () => {
    expect(mapAdminAccount(accountRow)).toEqual({
      id: "coach-1", email: "trener@klubb.no", fullName: "Kari Nordmann", initials: "KN", isGlobalAdmin: false,
      createdAt: "2026-09-01T10:00:00Z", lastSignInAt: null, filesOwned: 2,
      memberships: [{ teamId: "team-1", teamName: "Fjordvik HK — Jenter 16", teamRole: "coach" }],
    });
  });

  it("sorts accounts by display name and then address", () => {
    const accounts = [
      mapAdminAccount({ ...accountRow, id: "b", email: "b@example.com", full_name: "Øyvind" }),
      mapAdminAccount({ ...accountRow, id: "a", email: "a@example.com", full_name: "Ada" }),
    ];
    expect(sortAdminAccounts(accounts).map((account) => account.id)).toEqual(["a", "b"]);
  });
});

describe("partitionSessionsByMembership", () => {
  const sessions = [{ id: "s1", teamId: "mine" }, { id: "s2", teamId: "theirs" }, { id: "s3", teamId: "mine" }];

  it("keeps the coach's own teams apart from the plans an admin only reads", () => {
    expect(partitionSessionsByMembership(sessions, new Set(["mine"]))).toEqual({
      own: [{ id: "s1", teamId: "mine" }, { id: "s3", teamId: "mine" }],
      others: [{ id: "s2", teamId: "theirs" }],
    });
  });

  it("hands every plan to the console when the admin is on no team", () => {
    expect(partitionSessionsByMembership(sessions, new Set()).others).toHaveLength(3);
  });

  it("leaves everything with the coach when the memberships could not be read", () => {
    expect(partitionSessionsByMembership(sessions, null)).toEqual({ own: sessions, others: [] });
  });
});

describe("admin console lists", () => {
  const needsAdmin = mapAdminTeam(row({ id: "team-2", name: "Fjordvik HK — Gutter 14", members: [{ id: "coach-2", email: "ola@klubb.no", full_name: "Ola Nordmann", role: "coach" }] }));
  const staffed = mapAdminTeam(row({ invitations: [{ id: "inv-1", email: "ny@klubb.no", role: "coach", token: "t", expires_at: "2026-10-01T10:00:00Z" }] }));

  it("finds a team by squad, coach or pending invitation", () => {
    expect(filterAdminTeams([staffed, needsAdmin], "gutter")).toEqual([needsAdmin]);
    expect(filterAdminTeams([staffed, needsAdmin], "ola@")).toEqual([needsAdmin]);
    expect(filterAdminTeams([staffed, needsAdmin], "ny@klubb")).toEqual([staffed]);
    expect(filterAdminTeams([staffed, needsAdmin], "  ")).toHaveLength(2);
  });

  it("narrows the table to teams nobody administers", () => {
    expect(filterAdminTeams([staffed, needsAdmin], "", "needs-admin")).toEqual([needsAdmin]);
  });

  it("sums the console figures", () => {
    expect(adminOverview([staffed, needsAdmin], [])).toEqual({ teams: 2, accounts: 0, pendingInvitations: 1, teamsNeedingAdmin: 1 });
  });

  const now = new Date("2026-09-25T12:00:00Z");
  const plan = (id: string, teamId: string, status: PlannedSession["status"], startsAt: string | null, updatedAt = "2026-09-01T00:00:00Z") => ({ id, teamId, status, startsAt, updatedAt, plannedDurationMinutes: 90 }) as PlannedSession;
  const plans = [
    plan("later", "a", "published", "2026-10-10T16:00:00Z"),
    plan("soon", "a", "published", "2026-09-28T16:00:00Z"),
    plan("old", "a", "completed", "2026-08-01T16:00:00Z"),
    plan("recent", "a", "published", "2026-09-20T16:00:00Z"),
    plan("draft-old", "a", "draft", null, "2026-09-01T00:00:00Z"),
    plan("draft-new", "a", "draft", null, "2026-09-24T00:00:00Z"),
    plan("elsewhere", "b", "published", "2026-09-28T16:00:00Z"),
  ];

  it("counts each team's plans per calendar tab", () => {
    const counts = sessionCountsByTeam(plans, now);
    expect(counts.get("a")).toEqual({ upcoming: 2, drafts: 2, past: 2 });
    expect(counts.get("b")).toEqual({ upcoming: 1, drafts: 0, past: 0 });
  });

  it("orders a team's plans the way the coach calendar does", () => {
    const ids = (tab: "upcoming" | "drafts" | "past") => teamSessionsInTab(plans, "a", tab, now).map((session) => session.id);
    expect(ids("upcoming")).toEqual(["soon", "later"]);
    expect(ids("past")).toEqual(["recent", "old"]);
    expect(ids("drafts")).toEqual(["draft-new", "draft-old"]);
  });

  const account = (overrides: Partial<AdminAccount>): AdminAccount => ({ id: "x", email: "x@klubb.no", fullName: "X", initials: "X", isGlobalAdmin: false, createdAt: "", lastSignInAt: "2026-09-01T00:00:00Z", filesOwned: 0, memberships: [], ...overrides });

  it("filters accounts without a team or that never signed in", () => {
    const idle = account({ id: "idle", lastSignInAt: null, memberships: [{ teamId: "a", teamName: "A", teamRole: "coach" }] });
    const loose = account({ id: "loose" });
    expect(filterAdminAccounts([idle, loose], "", "no-team")).toEqual([loose]);
    expect(filterAdminAccounts([idle, loose], "", "never-signed-in")).toEqual([idle]);
  });
});
