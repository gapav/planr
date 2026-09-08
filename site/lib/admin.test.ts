import { describe, expect, it } from "vitest";
import { canDemoteMember, isTeamMemberOf, mapAdminTeam, shortTeamName, sortAdminTeams, teamAdminCount, teamNeedsAdmin, type AdminTeamRow } from "./admin";

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
