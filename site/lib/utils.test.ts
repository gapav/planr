import { describe, expect, it } from "vitest";
import { minutesLabel, sessionDateParts } from "./utils";

describe("sessionDateParts", () => {
  it("splits a stored UTC timestamp into calendar-chip pieces", () => {
    expect(sessionDateParts("2026-09-03T13:45:00.000Z", "UTC")).toEqual({ weekday: "Thu", day: "3", month: "Sep", time: "01:45 PM" });
  });
  it("renders the pieces in the given zone, not UTC", () => {
    expect(sessionDateParts("2026-09-03T22:30:00.000Z", "Europe/Oslo")).toMatchObject({ weekday: "Fri", day: "4", month: "Sep" });
  });
  it("returns null when there is no usable date", () => {
    expect(sessionDateParts(null)).toBeNull();
    expect(sessionDateParts("not a date")).toBeNull();
  });
});

describe("minutesLabel", () => {
  it("formats minutes, whole hours and mixed durations", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(120)).toBe("2h");
    expect(minutesLabel(75)).toBe("1h 15m");
  });
});
