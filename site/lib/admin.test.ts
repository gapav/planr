import { describe, expect, it } from "vitest";
import { canDemoteMember, isTeamMemberOf, mapAdminAccount, mapAdminTeam, shortTeamName, sortAdminAccounts, sortAdminTeams, teamAdminCount, teamNeedsAdmin, type AdminAccountRow, type AdminTeamRow } from "./admin";

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
    expect(team.members).toEqual([{ id: "coach-1", email: "trener@klubb.no", fullName: "Kari Nordmann", initials: "KN", color: "#477b70", teamRole: "admin" }]);
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
