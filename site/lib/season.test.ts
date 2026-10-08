import { describe, expect, it } from "vitest";
import { demoFixtures, demoMonthFocus, demoSessions } from "./demo-data";
import { seasonMonthKeys, seasonMonthSpans, seasonMonths, seasonStartYear, seasonWeeks, shiftDay } from "./season";

describe("season overview", () => {
  it("runs from August through July and uses the coach's calendar month", () => {
    expect(seasonMonthKeys(2026)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07"]);
    expect(seasonStartYear(new Date("2027-01-01T00:30:00Z"), "Europe/Oslo")).toBe(2026);
    expect(seasonStartYear(new Date("2026-08-01T00:30:00Z"), "America/Los_Angeles")).toBe(2025);
  });

  it("shows dated drafts and published sessions alongside the team's focus and matches", () => {
    const draft = { ...demoSessions[0], id: "october-draft", teamId: "team-senior", startsAt: "2026-10-10T12:00:00Z", status: "draft" as const };
    const published = { ...demoSessions[0], id: "october-published", teamId: "team-senior", startsAt: "2026-10-01T12:00:00Z", status: "published" as const };
    const otherTeam = { ...draft, id: "other-team", teamId: "team-u16" };
    const months = seasonMonths(2026, "team-senior", [draft, otherTeam, published], demoFixtures, demoMonthFocus, "UTC");

    expect(months.find((month) => month.key === "2026-09")?.focus?.note).toMatch(/Forsvar 6-0/);
    expect(months.find((month) => month.key === "2026-10")?.sessions.map((session) => session.id)).toEqual(["october-published", "october-draft"]);
    expect(months.find((month) => month.key === "2026-10")?.fixtures).toHaveLength(2);
    expect(months.find((month) => month.key === "2027-07")?.sessions).toHaveLength(0);
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
});
