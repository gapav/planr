import { describe, expect, it } from "vitest";
import {
  buildCalendarMonth, dayKey, fixtureOpponent, fixtureTeamNames, fixturesForTeams, groupFixturesByDay,
  matchStartToUtc, monthKey, monthLabel, parseFixtureRows, shiftMonth, teamColor, upcomingFixtures,
} from "./fixtures";
import type { TeamFixture } from "./types";

const header = ["Dato", "Tid", "Kampnr", "Hjemmelag", "Bortelag", "H-B", "Bane", "Tilskuere", "Arrangør", "Turnering"];
const rows = [
  header,
  ["06.09.2026", "10:00", "41041006001         ", "Langhus Gul", "Nesodden Gul", "-", "Langhushallen", "", "Langhus IL Håndball", "Kortbaneserie Jenter 10 - Avdeling 16"],
  ["06.09.2026", "11:20", "41041006002", "Nesodden Gul", "Langhus Blå", "24-19", "Langhushallen", "", "Langhus IL Håndball", "Kortbaneserie Jenter 10 - Avdeling 16"],
  ["01.11.2026", "12:40", "41041006003", "Langhus Gul", "Langhus Blå", "-", "Frognhallen", "", "Drøbak-Frogn Idrettslag", "Kortbaneserie Jenter 10 - Avdeling 16"],
];

describe("parseFixtureRows", () => {
  it("reads the tournament export and lists every team in the file", () => {
    const result = parseFixtureRows(rows);
    expect(result.headerRow).toBe(1);
    expect(result.fixtures).toHaveLength(3);
    expect(result.fixtures[0]).toMatchObject({
      matchNumber: "41041006001", homeTeam: "Langhus Gul", awayTeam: "Nesodden Gul",
      venue: "Langhushallen", organizer: "Langhus IL Håndball", tournament: "Kortbaneserie Jenter 10 - Avdeling 16",
    });
    expect(result.teams.map((team) => team.name)).toEqual(["Langhus Blå", "Langhus Gul", "Nesodden Gul"]);
    expect(result.teams.find((team) => team.name === "Langhus Gul")?.matchCount).toBe(2);
  });

  it("stores Norwegian kick-off times as UTC across the daylight-saving shift", () => {
    const [summer, , autumn] = parseFixtureRows(rows).fixtures;
    expect(summer.startsAt).toBe("2026-09-06T08:00:00.000Z");
    expect(autumn.startsAt).toBe("2026-11-01T11:40:00.000Z");
  });

  it("treats the placeholder score as no result yet", () => {
    const [unplayed, played] = parseFixtureRows(rows).fixtures;
    expect(unplayed.result).toBe("");
    expect(played.result).toBe("24-19");
  });

  it("accepts spreadsheet dates and fractional times from the reader", () => {
    const [fixture] = parseFixtureRows([header, [new Date(Date.UTC(2026, 8, 6)), 0.5, "9", "Ski Rød", "Kolbotn Rød", "-", "Skihallen", "", "Ski IL", "Serie"]]).fixtures;
    expect(fixture.startsAt).toBe("2026-09-06T10:00:00.000Z");
  });

  it("finds the header below title rows and skips rows without a match", () => {
    const result = parseFixtureRows([["Terminliste"], [], header, ...rows.slice(1), ["", "", "", "", "", "", "", "", "", ""]]);
    expect(result.headerRow).toBe(3);
    expect(result.fixtures).toHaveLength(3);
    expect(result.skippedRows).toBe(1);
  });

  it("keeps one row per match number", () => {
    const result = parseFixtureRows([header, rows[1], rows[1]]);
    expect(result.fixtures).toHaveLength(1);
    expect(result.skippedRows).toBe(1);
  });

  it("explains what is missing rather than importing nothing", () => {
    expect(() => parseFixtureRows([["Navn", "Draktnummer"], ["Ada Lie", "7"]])).toThrow(/Dato/);
    expect(() => parseFixtureRows([header])).toThrow(/ingen kamprader/);
  });
});

describe("fixturesForTeams", () => {
  const parsed = parseFixtureRows(rows).fixtures;

  it("keeps only the picked teams' matches and records which team plays", () => {
    const selected = fixturesForTeams(parsed, ["Langhus Gul"]);
    expect(selected).toHaveLength(2);
    expect(selected[0].ourTeams).toEqual(["Langhus Gul"]);
  });

  it("keeps a derby between two picked teams as one match carrying both", () => {
    const selected = fixturesForTeams(parsed, ["Langhus Gul", "Langhus Blå"]);
    expect(selected).toHaveLength(3);
    expect(selected.at(-1)?.ourTeams).toEqual(["Langhus Gul", "Langhus Blå"]);
  });

  it("ignores case and stray spacing in the picked names", () => {
    expect(fixturesForTeams(parsed, [" langhus gul "])).toHaveLength(2);
  });

  it("returns the matches in kick-off order", () => {
    const selected = fixturesForTeams(parsed, ["Langhus Gul", "Nesodden Gul", "Langhus Blå"]);
    expect(selected.map((fixture) => fixture.startsAt)).toEqual([...selected.map((fixture) => fixture.startsAt)].sort());
  });
});

describe("matchStartToUtc", () => {
  it("uses the offset in force on the day of the match", () => {
    expect(matchStartToUtc(2026, 7, 1, 18, 30)).toBe("2026-07-01T16:30:00.000Z");
    expect(matchStartToUtc(2026, 12, 1, 18, 30)).toBe("2026-12-01T17:30:00.000Z");
  });
});

describe("calendar helpers", () => {
  it("lays out six Monday-first weeks around the month", () => {
    const weeks = buildCalendarMonth("2026-09");
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].key).toBe("2026-08-31");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][1]).toMatchObject({ key: "2026-09-01", dayOfMonth: 1, inMonth: true });
    expect(weeks.flat()).toHaveLength(42);
  });

  it("starts a month that begins on a Monday without a leading week", () => {
    expect(buildCalendarMonth("2026-06")[0][0].key).toBe("2026-06-01");
  });

  it("steps between months across the year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-09")).toContain("2026");
  });

  it("keys instants by their calendar day in the viewer's zone", () => {
    expect(dayKey("2026-09-06T22:30:00.000Z", "Europe/Oslo")).toBe("2026-09-07");
    expect(monthKey("2026-09-30T22:30:00.000Z", "Europe/Oslo")).toBe("2026-10");
  });

  it("groups matches per day in kick-off order", () => {
    const grouped = groupFixturesByDay([{ startsAt: "2026-09-06T12:00:00.000Z" }, { startsAt: "2026-09-06T08:00:00.000Z" }, { startsAt: "2026-09-07T08:00:00.000Z" }], "Europe/Oslo");
    expect([...grouped.keys()]).toEqual(["2026-09-06", "2026-09-07"]);
    expect(grouped.get("2026-09-06")?.map((fixture) => fixture.startsAt)).toEqual(["2026-09-06T08:00:00.000Z", "2026-09-06T12:00:00.000Z"]);
  });
});

function fixture(overrides: Partial<TeamFixture>): TeamFixture {
  return {
    id: "fixture-1", teamId: "team-1", matchNumber: "1", startsAt: "2026-09-06T08:00:00.000Z",
    homeTeam: "Langhus Gul", awayTeam: "Nesodden Gul", ourTeams: ["Langhus Gul"], result: "",
    venue: "Langhushallen", organizer: "Langhus IL", tournament: "Serie",
    createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", ...overrides,
  };
}

describe("fixture presentation", () => {
  it("names the opponent from whichever side we are on", () => {
    expect(fixtureOpponent(fixture({}))).toMatchObject({ isHome: true, isDerby: false, opponent: "Nesodden Gul" });
    expect(fixtureOpponent(fixture({ ourTeams: ["Nesodden Gul"] }))).toMatchObject({ isHome: false, opponent: "Langhus Gul" });
    expect(fixtureOpponent(fixture({ ourTeams: ["Langhus Gul", "Nesodden Gul"] }))).toMatchObject({ isDerby: true });
  });

  it("gives each club colour its own hue and repeats it for the same name", () => {
    expect(teamColor("Langhus Rød")).not.toBe(teamColor("Langhus Blå"));
    expect(teamColor("Nesodden gul")).toBe(teamColor("Nesodden Gul"));
    expect(teamColor("Langhus 2")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("lists our teams once, sorted", () => {
    expect(fixtureTeamNames([fixture({}), fixture({ ourTeams: ["Langhus Blå", "Langhus Gul"] })])).toEqual(["Langhus Blå", "Langhus Gul"]);
  });

  it("keeps a match that kicked off an hour ago in the upcoming list", () => {
    const now = new Date("2026-09-06T09:00:00.000Z");
    expect(upcomingFixtures([fixture({}), fixture({ id: "old", startsAt: "2026-09-01T08:00:00.000Z" })], now).map((entry) => entry.id)).toEqual(["fixture-1"]);
  });
});
