import { describe, expect, it } from "vitest";
import { demoFixtures, demoMonthFocus, demoSessions, demoWarmupRoutines } from "./demo-data";
import { overviewFixture, overviewFocus, overviewSessions } from "./overview";

const now = new Date("2026-09-12T10:00:00Z");
const future = { ...demoSessions[1], id: "future", startsAt: "2026-09-17T14:00:00Z" };

describe("overview sessions", () => {
  it("only shows the selected team's sessions", () => {
    expect(overviewSessions([future], "other-team", now)).toEqual({ next: null, draft: null });
    expect(overviewSessions([future], undefined, now)).toEqual({ next: null, draft: null });
  });
  it("chooses the nearest published session without mutating the input", () => {
    const later = { ...future, id: "later", startsAt: "2026-10-17T14:00:00Z" };
    const input = [later, future];
    expect(overviewSessions(input, future.teamId, now).next?.id).toBe("future");
    expect(input[0].id).toBe("later");
  });
  it("prioritises an in-progress session even if it started yesterday", () => {
    const running = { ...future, id: "running", status: "in_progress" as const, startsAt: "2026-09-11T14:00:00Z" };
    expect(overviewSessions([future, running], future.teamId, now).next?.id).toBe("running");
  });
  it("excludes completed and elapsed sessions and offers the latest draft", () => {
    const draft = { ...future, id: "draft", status: "draft" as const, updatedAt: "2026-09-12T09:00:00Z" };
    const completed = { ...future, status: "completed" as const };
    const result = overviewSessions([...demoSessions, completed, draft], future.teamId, now);
    expect(result.next).toBeNull();
    expect(result.draft?.id).toBe("draft");
  });
});

const fixtures = demoFixtures;
const routines = demoWarmupRoutines;

describe("overview fixture", () => {
  it("names the opponent from the club's own side of the match", () => {
    const result = overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-20T10:00:00Z"));
    expect(result?.fixture.matchNumber).toBe("41041006003");
    expect(result?.isDerby).toBe(true);
    expect(result?.opponent).toBe("Fjordvik Rød");
  });
  it("keeps a match up for three hours after throw-off, then moves on", () => {
    // 41041006001 throws off 09:00 and holds the card until 12:00.
    expect(overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T11:00:00Z"))?.fixture.matchNumber).toBe("41041006001");
    expect(overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T12:30:00Z"))?.fixture.matchNumber).toBe("41041006007");
    expect(overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T14:00:00Z"))?.fixture.matchNumber).toBe("41041006002");
    expect(overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T16:00:00Z"))?.fixture.matchNumber).toBe("41041006003");
  });

  // Two matches back to back is the normal shape of a match day at this age
  // group, so the card is about the day: both opponents, and the meet-up
  // counted back from the first throw-off rather than from each match.
  it("describes a whole match day when the squad plays more than once", () => {
    const result = overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T06:00:00Z"));
    expect(result?.day?.team).toBe("Fjordvik Rød");
    expect(result?.day?.fixtures).toHaveLength(2);
    expect(result?.opponents).toBe("Nesodden Gul og Ski Rød");
    expect(result?.startsAt).toBe("2026-09-12T09:00:00.000Z");
    expect(result?.venue).toBe("Sofiemyrhallen A");
  });

  // Once the morning match is played the card is about what is left, so a
  // single remaining fixture reads as one match again.
  it("falls back to one match once the rest of the day is played", () => {
    const result = overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-12T12:30:00Z"));
    expect(result?.day).toBeNull();
    expect(result?.opponent).toBe("Ski Rød");
  });
  it("counts the meet-up back from the throw-off", () => {
    const result = overviewFixture(fixtures, "team-senior", routines, new Date("2026-09-20T10:00:00Z"));
    expect(result?.meetAt).toBe("2026-09-26T10:40:00.000Z");
  });
  it("drops the meet-up when the team has no warm-up routine", () => {
    expect(overviewFixture(fixtures, "team-senior", [], new Date("2026-09-20T10:00:00Z"))?.meetAt).toBeNull();
  });
  it("only shows the selected team's matches", () => {
    expect(overviewFixture(fixtures, "team-u16", routines, new Date("2026-09-20T10:00:00Z"))).toBeNull();
    expect(overviewFixture(fixtures, undefined, routines, new Date("2026-09-20T10:00:00Z"))).toBeNull();
  });
});

describe("overview focus", () => {
  const focus = demoMonthFocus[0];
  it("finds the focus for the month the coach is standing in", () => {
    expect(overviewFocus([focus], "team-senior", new Date("2026-09-20T10:00:00Z"), "Europe/Oslo")).toBe(focus);
  });
  it("does not carry a focus into the next month or across teams", () => {
    expect(overviewFocus([focus], "team-senior", new Date("2026-10-01T10:00:00Z"), "Europe/Oslo")).toBeNull();
    expect(overviewFocus([focus], "team-u16", new Date("2026-09-20T10:00:00Z"), "Europe/Oslo")).toBeNull();
    expect(overviewFocus([focus], undefined, new Date("2026-09-20T10:00:00Z"), "Europe/Oslo")).toBeNull();
  });
});
