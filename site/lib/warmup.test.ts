import { describe, expect, it } from "vitest";
import { scheduleWarmupItems, sortWarmupItems, warmupDuration, warmupSchedule, warmupSummary } from "./warmup";
import type { WarmupItem, WarmupRoutine } from "./types";

function item(position: number, durationMinutes: number, title = `Aktivitet ${position}`): WarmupItem {
  return { id: `item-${position}`, routineId: "routine-1", kind: "custom", exerciseId: null, title,
    description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes, coachingNotes: "", position };
}
const routine: WarmupRoutine = {
  id: "routine-1", teamId: "team-1", name: "Kampoppvarming", isDefault: true, meetMinutesBefore: 60, notes: "",
  items: [item(1, 6), item(0, 5), item(2, 8)], createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z",
};
const kickOff = "2026-09-12T17:00:00.000Z";

describe("warm-up routine", () => {
  it("orders activities by position, whatever order they arrived in", () => {
    expect(sortWarmupItems(routine.items).map((entry) => entry.position)).toEqual([0, 1, 2]);
  });

  it("adds up how long the routine takes", () => {
    expect(warmupDuration(routine.items)).toBe(19);
    expect(warmupSummary(routine)).toEqual({ count: 3, durationMinutes: 19 });
    expect(warmupSummary(null)).toEqual({ count: 0, durationMinutes: 0 });
  });

  it("counts back from the kick-off to the meet-up and the first activity", () => {
    const schedule = warmupSchedule(kickOff, routine);
    expect(schedule).toMatchObject({
      meetAt: "2026-09-12T16:00:00.000Z", warmupAt: "2026-09-12T16:41:00.000Z",
      kickOffAt: kickOff, durationMinutes: 19, startsBeforeMeetUp: false,
    });
  });

  it("says so when the routine is longer than the meet-up allows", () => {
    expect(warmupSchedule(kickOff, { ...routine, meetMinutesBefore: 15 })?.startsBeforeMeetUp).toBe(true);
  });

  it("has nothing to count back from without a kick-off", () => {
    expect(warmupSchedule(null, routine)).toBeNull();
    expect(warmupSchedule("not a date", routine)).toBeNull();
  });

  it("gives every activity the clock time it starts at", () => {
    expect(scheduleWarmupItems(kickOff, routine).map((entry) => [entry.item.position, entry.startsAt])).toEqual([
      [0, "2026-09-12T16:41:00.000Z"],
      [1, "2026-09-12T16:46:00.000Z"],
      [2, "2026-09-12T16:52:00.000Z"],
    ]);
  });

  it("still lists the routine in order when the match has no kick-off", () => {
    expect(scheduleWarmupItems(null, routine).map((entry) => entry.startsAt)).toEqual([null, null, null]);
  });

  it("has an empty routine end exactly at the kick-off", () => {
    expect(warmupSchedule(kickOff, { ...routine, items: [] })).toMatchObject({ warmupAt: kickOff, durationMinutes: 0 });
  });
});
