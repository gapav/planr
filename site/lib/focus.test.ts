import { describe, expect, it } from "vitest";
import { focusAt, focusEndsOn, focusSpanLabel, focusWeekNumber, freeFocusSpan, mondayOf, nextFocus, noteLines, overlappingFocus, teamFocuses } from "./focus";
import type { FocusPeriod } from "./types";

const focus = (id: string, startsOn: string, weeks: number, teamId = "team-senior"): FocusPeriod => ({
  id, teamId, title: id, note: "", notes: "", startsOn, weeks, updatedAt: "2026-09-01T08:00:00Z", updatedBy: null,
});
// Three weeks from 7 September, then two from 5 October, and another team's.
const focuses = [focus("kontring", "2026-10-05", 2), focus("forsvar", "2026-09-07", 3), focus("annet-lag", "2026-09-28", 1, "team-u16")];

describe("focus periods", () => {
  it("runs Monday to Sunday over whole weeks", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2027-01-03")).toBe("2026-12-28");
    expect(focusEndsOn({ startsOn: "2026-09-07", weeks: 3 })).toBe("2026-09-27");
    expect(focusSpanLabel({ startsOn: "2026-09-07", weeks: 3 })).toBe("Uke 37–39 · 7. sep.–27. sep.");
    expect(focusSpanLabel({ startsOn: "2026-12-28", weeks: 1 })).toBe("Uke 53 · 28. des.–3. jan.");
  });

  it("finds the team's focus running on a day, and the next one when none is", () => {
    expect(focusAt(focuses, "team-senior", "2026-09-27")?.id).toBe("forsvar");
    expect(focusAt(focuses, "team-senior", "2026-09-28")).toBeNull();
    expect(focusAt(focuses, "team-u16", "2026-09-28")?.id).toBe("annet-lag");
    expect(nextFocus(focuses, "team-senior", "2026-09-28")?.id).toBe("kontring");
    expect(nextFocus(focuses, "team-senior", "2026-10-20")).toBeNull();
    expect(teamFocuses(focuses, "team-senior").map((entry) => entry.id)).toEqual(["forsvar", "kontring"]);
  });

  it("names the focus a new one would collide with, ignoring itself and other teams", () => {
    expect(overlappingFocus(focuses, { teamId: "team-senior", startsOn: "2026-09-21", weeks: 2 })?.id).toBe("forsvar");
    expect(overlappingFocus(focuses, { teamId: "team-senior", startsOn: "2026-09-28", weeks: 1 })).toBeNull();
    expect(overlappingFocus(focuses, { id: "forsvar", teamId: "team-senior", startsOn: "2026-09-14", weeks: 3 })).toBeNull();
    expect(overlappingFocus(focuses, { id: "forsvar", teamId: "team-senior", startsOn: "2026-09-14", weeks: 4 })?.id).toBe("kontring");
  });

  it("starts a new focus in the first free week and stops short of the next one", () => {
    expect(freeFocusSpan(focuses, "team-senior", "2026-08-26")).toEqual({ startsOn: "2026-08-24", weeks: 2 });
    expect(freeFocusSpan(focuses, "team-senior", "2026-09-16")).toEqual({ startsOn: "2026-09-28", weeks: 1 });
    expect(freeFocusSpan(focuses, "team-senior", "2026-11-04")).toEqual({ startsOn: "2026-11-02", weeks: 4 });
  });

  it("reads one working point per line, dropping blanks and typed bullets", () => {
    expect(noteLines("Midtblokk\n\n  - Kontring \n• Høy arm\n   ")).toEqual(["Midtblokk", "Kontring", "Høy arm"]);
    expect(noteLines("")).toEqual([]);
  });

  it("counts the weeks of a focus from its first Monday", () => {
    const forsvar = focus("forsvar", "2026-09-07", 3);
    expect(focusWeekNumber(forsvar, "2026-09-07")).toBe(1);
    expect(focusWeekNumber(forsvar, "2026-09-13")).toBe(1);
    expect(focusWeekNumber(forsvar, "2026-09-14")).toBe(2);
    expect(focusWeekNumber(forsvar, "2026-09-27")).toBe(3);
    expect(focusWeekNumber(forsvar, "2026-09-28")).toBeNull();
    expect(focusWeekNumber(forsvar, "2026-09-06")).toBeNull();
  });
});
