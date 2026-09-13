import { describe, expect, it } from "vitest";
import { COACH_AVATAR_PEER, COACH_AVATAR_SELF } from "./team-palette";
import { minutesLabel, readableInk, sessionDateParts } from "./utils";

describe("sessionDateParts", () => {
  it("splits a stored UTC timestamp into calendar-chip pieces", () => {
    expect(sessionDateParts("2026-09-03T13:45:00.000Z", "UTC")).toEqual({ weekday: "tor.", day: "3.", month: "sep", time: "13:45" });
  });
  it("renders the pieces in the given zone, not UTC", () => {
    expect(sessionDateParts("2026-09-03T22:30:00.000Z", "Europe/Oslo")).toMatchObject({ weekday: "fre.", day: "4.", month: "sep" });
  });
  it("returns null when there is no usable date", () => {
    expect(sessionDateParts(null)).toBeNull();
    expect(sessionDateParts("not a date")).toBeNull();
  });
});

describe("minutesLabel", () => {
  it("formats minutes, whole hours and mixed durations", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(120)).toBe("2 t");
    expect(minutesLabel(75)).toBe("1 t 15 min");
  });
});

describe("readableInk", () => {
  it("puts white on the brand purple and ink on the pale lilac", () => {
    expect(readableInk(COACH_AVATAR_SELF)).toBe("#ffffff");
    expect(readableInk(COACH_AVATAR_PEER)).toBe("#2e1b3d");
  });
  it("handles the extremes", () => {
    expect(readableInk("#000000")).toBe("#ffffff");
    expect(readableInk("#ffffff")).toBe("#2e1b3d");
  });
  it("falls back to white for anything that is not a six-digit hex", () => {
    expect(readableInk("var(--avatar-self)")).toBe("#ffffff");
    expect(readableInk("")).toBe("#ffffff");
  });
});
