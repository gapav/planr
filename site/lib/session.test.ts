import { describe, expect, it } from "vitest";
import { demoSessions } from "./demo-data";
import { blockDuration, deriveSessionTab, sessionDuration, validatePublish } from "./session";

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
