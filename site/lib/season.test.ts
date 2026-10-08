import { describe, expect, it } from "vitest";
import { demoFixtures, demoSessions } from "./demo-data";
import { TEAM_PALETTE } from "./team-palette";
import type { TeamFixture } from "./types";
import { focusColumns, seasonMatchTeams, seasonMonthKeys, seasonMonthSpans, seasonStartYear, seasonWeeks, shiftDay, weekMatchTeams } from "./season";

describe("season overview", () => {
  it("runs from August through July and uses the coach's calendar month", () => {
    expect(seasonMonthKeys(2026)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07"]);
    expect(seasonStartYear(new Date("2027-01-01T00:30:00Z"), "Europe/Oslo")).toBe(2026);
    expect(seasonStartYear(new Date("2026-08-01T00:30:00Z"), "America/Los_Angeles")).toBe(2025);
  });

  it("shows dated drafts and published sessions alongside the team's matches", () => {
    const draft = { ...demoSessions[0], id: "october-draft", teamId: "team-senior", startsAt: "2026-10-10T12:00:00Z", status: "draft" as const };
    const published = { ...demoSessions[0], id: "october-published", teamId: "team-senior", startsAt: "2026-10-01T12:00:00Z", status: "published" as const };
    const otherTeam = { ...draft, id: "other-team", teamId: "team-u16" };
    const weeks = seasonWeeks(2026, "team-senior", [draft, otherTeam, published], demoFixtures, "UTC");
    const weekOf = (day: string) => weeks.find((week) => week.start <= day && day <= week.end)!;

    expect(weekOf("2026-10-01").sessions.map((session) => session.id)).toEqual(["october-published"]);
    expect(weekOf("2026-10-10").sessions.map((session) => session.id)).toEqual(["october-draft"]);
    expect(weeks.flatMap((week) => week.fixtures).filter((fixture) => fixture.startsAt.startsWith("2026-10"))).toHaveLength(2);
    expect(weekOf("2027-07-26").sessions).toHaveLength(0);
  });

  it("lays out whole weeks with month spans and keeps events in their calendar dates", () => {
    const edge = { ...demoSessions[0], id: "august-first", teamId: "team-senior", startsAt: "2026-08-01T09:00:00Z" };
    const january = { ...edge, id: "january-draft", startsAt: "2027-01-01T09:00:00Z", status: "draft" as const };
    const weeks = seasonWeeks(2026, "team-senior", [edge, january], demoFixtures, "UTC");
    const spans = seasonMonthSpans(weeks);

    expect(weeks[0]).toMatchObject({ start: "2026-07-27", end: "2026-08-02", month: "2026-08", sessions: [edge] });
    expect(weeks.at(-1)?.end).toBe("2027-08-01");
    expect(spans[0]).toMatchObject({ key: "2026-08", from: 0 });
    expect(spans.at(-1)?.key).toBe("2027-07");
    expect(weeks.find((week) => week.sessions.some((session) => session.id === "january-draft"))?.number).toBe(53);
    expect(weeks.reduce((count, week) => count + week.fixtures.length, 0)).toBe(demoFixtures.length);
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("places a focus on the week columns it covers, clipped to the season", () => {
    const weeks = seasonWeeks(2026, "team-senior", [], [], "UTC");
    // The season's first column is the week of 27 July.
    expect(focusColumns(weeks, { startsOn: "2026-09-07", weeks: 3 })).toEqual({ from: 6, to: 8 });
    expect(focusColumns(weeks, { startsOn: "2026-07-13", weeks: 4 })).toEqual({ from: 0, to: 1 });
    expect(focusColumns(weeks, { startsOn: "2026-06-01", weeks: 4 })).toBeNull();
    expect(focusColumns(weeks, { startsOn: "2027-07-19", weeks: 6 })).toEqual({ from: weeks.length - 2, to: weeks.length - 1 });
  });

  it("gives each club team that plays in a week one dot in its saved colour", () => {
    const fixture = (id: string, startsAt: string, homeTeam: string, awayTeam: string, ourTeams: string[], updatedAt = "2026-08-20T08:00:00Z"): TeamFixture => ({
      id, teamId: "team-senior", matchNumber: id, startsAt, homeTeam, awayTeam, ourTeams, result: "", venue: "", organizer: "", tournament: "", createdAt: updatedAt, updatedAt,
    });
    const fixtures = [
      fixture("a", "2026-10-06T16:00:00Z", "Ski Rød", "Fjordvik", ["Ski Rød"]),
      fixture("b", "2026-10-07T16:00:00Z", "Ås", "Ski Rød", ["Ski Rød"]),
      fixture("c", "2026-10-08T16:00:00Z", "Ski Hvit", "Ski Rød", ["Ski Hvit", "Ski Rød"]),
      { ...fixture("d", "2026-10-20T16:00:00Z", "Ski Hvit", "Bøler", ["Ski Hvit"], "2026-09-01T08:00:00Z"), ourTeamColors: { "Ski Hvit": "sage" } },
    ];
    const weeks = seasonWeeks(2026, "team-senior", [], fixtures, "UTC");
    const teams = seasonMatchTeams(weeks);

    expect(teams.map((team) => team.name)).toEqual(["Ski Hvit", "Ski Rød"]);
    // The latest import's choice holds for every week, not only the one it came with.
    expect(teams[0].accent).toBe(TEAM_PALETTE.find((color) => color.id === "sage")!.accent);
    const week41 = weeks.find((week) => week.number === 41)!;
    expect(weekMatchTeams(week41, teams).map((team) => team.name)).toEqual(["Ski Hvit", "Ski Rød"]);
    expect(weekMatchTeams(weeks.find((week) => week.number === 43)!, teams).map((team) => team.name)).toEqual(["Ski Hvit"]);
    expect(weekMatchTeams(weeks.find((week) => week.number === 45)!, teams)).toEqual([]);
  });
});
