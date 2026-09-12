import { describe, expect, it } from "vitest";
import { demoSessions } from "./demo-data";
import { overviewSessions } from "./overview";

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
