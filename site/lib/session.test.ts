import { describe, expect, it } from "vitest";
import { demoSessions } from "./demo-data";
import type { PlannedSession } from "./types";
import { blockDuration, deriveSessionTab, groupSessionsByMonth, isNearTerm, isSessionStartable, relativeDayLabel, sessionDuration, validatePublish } from "./session";

describe("session calculations", () => {
  it("sums activity, block and session durations", () => {
    expect(blockDuration(demoSessions[0].blocks[0])).toBe(20);
    expect(sessionDuration(demoSessions[0])).toBe(90);
  });
  it("keeps any draft in Drafts regardless of its date", () => {
    expect(deriveSessionTab(demoSessions[0], new Date("2027-01-01"))).toBe("drafts");
  });
  it("derives upcoming and past from the calculated end time", () => {
    const session = { ...demoSessions[1], startsAt: "2026-09-02T10:00:00.000Z", plannedDurationMinutes: 90 };
    expect(deriveSessionTab(session, new Date("2026-09-02T10:30:00.000Z"))).toBe("upcoming");
    expect(deriveSessionTab(session, new Date("2026-09-02T12:00:01.000Z"))).toBe("past");
  });
  it("keeps a started workout visible in Upcoming until it is finished", () => {
    const session = { ...demoSessions[1], status: "in_progress" as const };
    expect(deriveSessionTab(session, new Date("2027-01-01"))).toBe("upcoming");
  });
  it("moves a finished workout to Past whatever its planned time was", () => {
    const session = { ...demoSessions[1], status: "completed" as const, startsAt: "2027-01-01T10:00:00.000Z" };
    expect(deriveSessionTab(session, new Date("2026-09-02T12:00:00.000Z"))).toBe("past");
  });
  it("requires the core publishing details", () => {
    const empty = { ...demoSessions[0], title: "", startsAt: null, plannedDurationMinutes: 0, blocks: [] };
    expect(validatePublish(empty)).toEqual(["Legg til en økttittel", "Velg dato og klokkeslett", "Angi planlagt varighet", "Legg til minst én bolk"]);
    expect(validatePublish(demoSessions[0])).toEqual([]);
  });
});

describe("relativeDayLabel", () => {
  const now = new Date("2026-09-02T22:00:00.000Z");
  it("names the days around today", () => {
    expect(relativeDayLabel("2026-09-02T06:00:00.000Z", now, "UTC")).toBe("I dag");
    expect(relativeDayLabel("2026-09-03T06:00:00.000Z", now, "UTC")).toBe("I morgen");
    expect(relativeDayLabel("2026-09-01T06:00:00.000Z", now, "UTC")).toBe("I går");
  });
  it("counts calendar days, not elapsed hours", () => {
    // Two hours apart, but across midnight, so it is tomorrow.
    expect(relativeDayLabel("2026-09-03T00:00:00.000Z", now, "UTC")).toBe("I morgen");
    expect(relativeDayLabel("2026-09-05T06:00:00.000Z", now, "UTC")).toBe("Om 3 dager");
    expect(relativeDayLabel("2026-08-30T06:00:00.000Z", now, "UTC")).toBe("For 3 dager siden");
  });
  it("goes quiet outside the surrounding week and without a usable date", () => {
    expect(relativeDayLabel("2026-09-10T06:00:00.000Z", now, "UTC")).toBeNull();
    expect(relativeDayLabel("2026-08-20T06:00:00.000Z", now, "UTC")).toBeNull();
    expect(relativeDayLabel(null, now, "UTC")).toBeNull();
    expect(relativeDayLabel("not a date", now, "UTC")).toBeNull();
  });
  it("resolves the day in the viewer zone", () => {
    // 23:30 UTC on the 2nd is still the 2nd in UTC but already the 3rd in Oslo.
    const midday = new Date("2026-09-02T10:00:00.000Z");
    expect(relativeDayLabel("2026-09-02T23:30:00.000Z", midday, "UTC")).toBe("I dag");
    expect(relativeDayLabel("2026-09-02T23:30:00.000Z", midday, "Europe/Oslo")).toBe("I morgen");
  });
});

describe("groupSessionsByMonth", () => {
  const at = (id: string, startsAt: string | null) => ({ ...demoSessions[0], id, startsAt });
  it("keeps the given order and starts a section per month", () => {
    const groups = groupSessionsByMonth([at("a", "2026-09-03T10:00:00.000Z"), at("b", "2026-09-26T10:00:00.000Z"), at("c", "2026-10-01T10:00:00.000Z")], "UTC");
    expect(groups.map((group) => group.label)).toEqual(["september 2026", "oktober 2026"]);
    expect(groups[0].sessions.map((session) => session.id)).toEqual(["a", "b"]);
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["c"]);
  });
  it("separates the same month in different years", () => {
    const groups = groupSessionsByMonth([at("a", "2026-09-03T10:00:00.000Z"), at("b", "2027-09-03T10:00:00.000Z")], "UTC");
    expect(groups.map((group) => group.key)).toEqual(["2026-09", "2027-09"]);
  });
  it("collects undated sessions under their own heading", () => {
    const groups = groupSessionsByMonth([at("a", null), at("b", "not a date")], "UTC");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "no-date", label: "Uten dato" });
  });
});

describe("row emphasis", () => {
  const now = new Date("2026-09-02T09:00:00.000Z");
  const at = (startsAt: string | null, status: PlannedSession["status"] = "published") => ({ ...demoSessions[1], startsAt, status });

  it("offers Start on today's session and on one already running", () => {
    expect(isSessionStartable(at("2026-09-02T18:00:00.000Z"), now, "UTC")).toBe(true);
    expect(isSessionStartable(at("2026-08-25T18:00:00.000Z", "in_progress"), now, "UTC")).toBe(true);
  });
  it("withholds Start from every plan you cannot start yet", () => {
    expect(isSessionStartable(at("2026-09-03T18:00:00.000Z"), now, "UTC")).toBe(false);
    expect(isSessionStartable(at("2026-09-02T18:00:00.000Z", "draft"), now, "UTC")).toBe(false);
    expect(isSessionStartable(at(null), now, "UTC")).toBe(false);
  });
  it("keeps the coming week at full size and shrinks the rest", () => {
    expect(isNearTerm(at("2026-09-02T18:00:00.000Z"), now, "UTC")).toBe(true);
    expect(isNearTerm(at("2026-09-08T18:00:00.000Z"), now, "UTC")).toBe(true);
    expect(isNearTerm(at("2026-09-09T18:00:00.000Z"), now, "UTC")).toBe(false);
    expect(isNearTerm(at(null), now, "UTC")).toBe(false);
    // A session running since yesterday is the one thing you are doing.
    expect(isNearTerm(at("2026-09-01T18:00:00.000Z", "in_progress"), now, "UTC")).toBe(true);
  });
});
