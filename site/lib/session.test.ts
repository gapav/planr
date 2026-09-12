import { describe, expect, it } from "vitest";
import { demoSessions } from "./demo-data";
import type { PlannedSession, Profile } from "./types";
import { assignedCoach, autoSessionTitle, blockDuration, buildSessionCopy, calendarMonthGroups, canReopenSession, coachAssignmentOptions, combineSessionStart, DEFAULT_SESSION_TIME, deriveSessionTab, groupSessionsByMonth, isAutoSessionTitle, isNearTerm, isSessionStartable, isoWeekNumber, nextPosition, pickTodaySession, relativeDayLabel, reopenedSessionTab, SESSION_HOUR_OPTIONS, sessionCopyDefaults, sessionDuration, sessionMinuteOptions, splitSessionStart, splitSessionTime, UNTITLED_SESSION_TITLE, validatePublish } from "./session";

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

describe("calendarMonthGroups", () => {
  const at = (id: string, startsAt: string | null) => ({ ...demoSessions[0], id, startsAt });
  const now = new Date("2026-09-08T10:00:00.000Z");
  it("lists this month and four ahead even when nothing is planned", () => {
    const groups = calendarMonthGroups([], now, "UTC");
    expect(groups.map((group) => group.key)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(groups.every((group) => group.sessions.length === 0)).toBe(true);
  });
  it("labels a padded month the way a populated one is labelled", () => {
    expect(calendarMonthGroups([], now, "UTC")[0].label).toBe("september 2026");
    expect(calendarMonthGroups([at("a", "2026-09-12T10:00:00.000Z")], now, "UTC")[0].label).toBe("september 2026");
  });
  it("adds a month further out than the padded window", () => {
    const groups = calendarMonthGroups([at("a", "2027-04-02T10:00:00.000Z")], now, "UTC");
    expect(groups.map((group) => group.key).at(-1)).toBe("2027-04");
    expect(groups.at(-1)?.sessions.map((session) => session.id)).toEqual(["a"]);
  });
  it("keeps a month already under way ahead of this one", () => {
    const groups = calendarMonthGroups([at("a", "2026-08-30T10:00:00.000Z")], now, "UTC");
    expect(groups[0]).toMatchObject({ key: "2026-08", label: "august 2026" });
    expect(groups[1].key).toBe("2026-09");
  });
  it("gathers a month split by an out-of-order session into one section", () => {
    const groups = calendarMonthGroups([at("a", "2026-09-03T10:00:00.000Z"), at("b", "2026-10-01T10:00:00.000Z"), at("c", "2026-09-26T10:00:00.000Z")], now, "UTC");
    expect(groups[0].sessions.map((session) => session.id)).toEqual(["a", "c"]);
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["b"]);
  });
  it("leaves undated sessions in a trailing section of their own", () => {
    const groups = calendarMonthGroups([at("a", null)], now, "UTC");
    expect(groups).toHaveLength(6);
    expect(groups.at(-1)).toMatchObject({ key: "no-date", label: "Uten dato" });
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

describe("pickTodaySession", () => {
  const now = new Date("2026-09-02T09:00:00.000Z");
  const at = (id: string, startsAt: string | null, status: PlannedSession["status"] = "published") => ({ ...demoSessions[1], id, startsAt, status });

  it("resolves today's plan and leaves the other days alone", () => {
    const sessions = [at("yesterday", "2026-09-01T18:00:00.000Z"), at("today", "2026-09-02T18:00:00.000Z"), at("tomorrow", "2026-09-03T18:00:00.000Z")];
    expect(pickTodaySession(sessions, now, "UTC")?.id).toBe("today");
  });
  it("takes the earliest of two sessions on the same day", () => {
    const sessions = [at("evening", "2026-09-02T18:00:00.000Z"), at("morning", "2026-09-02T08:00:00.000Z")];
    expect(pickTodaySession(sessions, now, "UTC")?.id).toBe("morning");
  });
  it("puts a workout already running ahead of a plan that starts sooner", () => {
    const sessions = [at("later-today", "2026-09-02T18:00:00.000Z"), at("running", "2026-08-31T18:00:00.000Z", "in_progress")];
    expect(pickTodaySession(sessions, now, "UTC")?.id).toBe("running");
  });
  it("ignores a draft dated today, which cannot be started", () => {
    expect(pickTodaySession([at("draft", "2026-09-02T18:00:00.000Z", "draft")], now, "UTC")).toBeNull();
  });
  it("returns null on a day with nothing to run", () => {
    expect(pickTodaySession([at("tomorrow", "2026-09-03T18:00:00.000Z"), at("undated", null)], now, "UTC")).toBeNull();
    expect(pickTodaySession([], now, "UTC")).toBeNull();
  });
  it("resolves the day in the viewer zone", () => {
    // 23:30 UTC on the 2nd is already the 3rd in Oslo, so it is no longer today.
    const sessions = [at("late", "2026-09-02T23:30:00.000Z")];
    expect(pickTodaySession(sessions, now, "UTC")?.id).toBe("late");
    expect(pickTodaySession(sessions, now, "Europe/Oslo")).toBeNull();
  });
});

describe("nextPosition", () => {
  it("starts an empty parent at zero", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("appends after a contiguous run", () => {
    expect(nextPosition([{ position: 0 }, { position: 1 }, { position: 2 }])).toBe(3);
  });

  // The bug this exists for: deleting a middle row leaves a gap, and appending
  // at the surviving count reuses position 2, which the unique constraint on
  // (block_id, position) rejects.
  it("clears the highest position when a middle row was deleted", () => {
    expect(nextPosition([{ position: 0 }, { position: 2 }])).toBe(3);
  });

  it("does not assume the rows arrive sorted", () => {
    expect(nextPosition([{ position: 5 }, { position: 1 }])).toBe(6);
  });
});

describe("coach assignment", () => {
  const members: Profile[] = [
    { id: "coach-1", email: "a@example.com", fullName: "Ada Lie", initials: "AL", color: "#f0642e" },
    { id: "coach-2", email: "b@example.com", fullName: "Bo Ness", initials: "BN", color: "#477b70" },
  ];
  it("reads no responsible coach when the whole team runs the activity", () => {
    expect(assignedCoach({ assignedCoachId: null }, members)).toBeNull();
    expect(coachAssignmentOptions({ assignedCoachId: null }, members)).toEqual(members);
  });
  it("resolves the assigned coach from the current team", () => {
    expect(assignedCoach({ assignedCoachId: "coach-2" }, members)?.fullName).toBe("Bo Ness");
    expect(coachAssignmentOptions({ assignedCoachId: "coach-2" }, members)).toEqual(members);
  });
  it("keeps a coach who has left the team on the activity they were given", () => {
    expect(assignedCoach({ assignedCoachId: "coach-9" }, members)).toBeNull();
    const options = coachAssignmentOptions({ assignedCoachId: "coach-9" }, members);
    expect(options).toHaveLength(3);
    expect(options[2]).toMatchObject({ id: "coach-9", fullName: "Trener utenfor laget" });
  });
});

describe("session start fields", () => {
  it("splits the day into 24 hours and four minutes", () => {
    expect(SESSION_HOUR_OPTIONS).toHaveLength(24);
    expect(SESSION_HOUR_OPTIONS.slice(0, 2)).toEqual(["00", "01"]);
    expect(SESSION_HOUR_OPTIONS.at(-1)).toBe("23");
    expect(sessionMinuteOptions()).toEqual(["00", "15", "30", "45"]);
  });
  it("keeps an off-grid minute saved elsewhere in its place", () => {
    expect(sessionMinuteOptions("20")).toEqual(["00", "15", "20", "30", "45"]);
  });
  it("reads a time as its two fields, defaulting anything malformed", () => {
    expect(splitSessionTime("18:30")).toEqual({ hour: "18", minute: "30" });
    expect(splitSessionTime("")).toEqual({ hour: "16", minute: "00" });
    expect(splitSessionTime(DEFAULT_SESSION_TIME)).toEqual({ hour: "16", minute: "00" });
  });
  it("defaults an undated plan to 16:00", () => {
    expect(splitSessionStart(null)).toEqual({ date: "", time: DEFAULT_SESSION_TIME });
    expect(splitSessionStart("not a date")).toEqual({ date: "", time: DEFAULT_SESSION_TIME });
  });
  it("round-trips a local date and time through the stored instant", () => {
    const startsAt = combineSessionStart("2026-09-18", "18:30");
    expect(startsAt).not.toBeNull();
    expect(splitSessionStart(startsAt)).toEqual({ date: "2026-09-18", time: "18:30" });
  });
  it("falls back to 16:00 when only a date is picked, and stays null without one", () => {
    expect(splitSessionStart(combineSessionStart("2026-09-18", "")).time).toBe(DEFAULT_SESSION_TIME);
    expect(combineSessionStart("", "18:30")).toBeNull();
  });
});

describe("automatic session titles", () => {
  it("counts ISO weeks, including the ones spanning new year", () => {
    expect(isoWeekNumber(new Date("2026-09-18T12:00:00.000Z"), "UTC")).toBe(38);
    expect(isoWeekNumber(new Date("2026-01-01T12:00:00.000Z"), "UTC")).toBe(1);
    expect(isoWeekNumber(new Date("2027-01-01T12:00:00.000Z"), "UTC")).toBe(53);
    expect(isoWeekNumber(new Date("2026-12-31T12:00:00.000Z"), "UTC")).toBe(53);
  });
  it("names a plan by its week and weekday", () => {
    expect(autoSessionTitle("2026-09-18T16:00:00.000Z", "UTC")).toBe("Uke 38 - fredag");
    expect(autoSessionTitle("2026-09-14T16:00:00.000Z", "UTC")).toBe("Uke 38 - mandag");
  });
  it("treats a blank, placeholder or generated title as unnamed", () => {
    expect(isAutoSessionTitle("")).toBe(true);
    expect(isAutoSessionTitle(UNTITLED_SESSION_TITLE)).toBe(true);
    expect(isAutoSessionTitle("Uke 38 - fredag")).toBe(true);
  });
  it("leaves a title the coach wrote alone", () => {
    expect(isAutoSessionTitle("Uke 38 - fredag: avslutningsspill")).toBe(false);
    expect(isAutoSessionTitle("Keepertrening")).toBe(false);
  });
});

describe("reopening a finished session", () => {
  const finished: PlannedSession = { ...demoSessions[0], status: "completed", startedAt: "2026-09-04T16:30:00.000Z", completedAt: "2026-09-04T18:00:00.000Z" };

  it("only offers a finished plan something to reopen", () => {
    expect(canReopenSession(finished)).toBe(true);
    expect(canReopenSession(demoSessions[0])).toBe(false);
    expect(canReopenSession({ status: "in_progress" })).toBe(false);
  });

  // What the confirm dialog has to warn about: the tabs are derived from the
  // date, so reopening does not by itself move an old workout out of Past.
  it("leaves a plan whose evening has passed where it is", () => {
    expect(reopenedSessionTab(finished, new Date("2026-09-20T09:00:00.000Z"))).toBe("past");
  });
  it("reads one whose end time has not passed as Upcoming", () => {
    expect(reopenedSessionTab(finished, new Date("2026-09-04T19:00:00.000Z"))).toBe("past");
    expect(reopenedSessionTab(finished, new Date("2026-09-04T12:00:00.000Z"))).toBe("upcoming");
  });
});

describe("copying a session", () => {
  // Built from local parts so the proposed date is the same weekday whatever
  // zone the test runs in.
  const dated = (year: number, month: number, day: number, hour = 16, minute = 30): PlannedSession =>
    ({ ...demoSessions[0], startsAt: new Date(year, month - 1, day, hour, minute).toISOString() });

  it("proposes the same weekday and time a week on", () => {
    const defaults = sessionCopyDefaults(dated(2026, 9, 18), new Date(2026, 8, 18));
    expect(defaults).toEqual({ title: demoSessions[0].title, date: "2026-09-25", time: "16:30" });
  });
  it("skips whole weeks until the proposal is no longer behind us", () => {
    expect(sessionCopyDefaults(dated(2026, 8, 28), new Date(2026, 8, 18)).date).toBe("2026-09-18");
    expect(sessionCopyDefaults(dated(2026, 8, 28), new Date(2026, 8, 19)).date).toBe("2026-09-25");
  });
  it("keeps an undated plan undated, with its time still offered", () => {
    expect(sessionCopyDefaults({ ...demoSessions[0], startsAt: null }, new Date(2026, 8, 18))).toEqual({ title: demoSessions[0].title, date: "", time: DEFAULT_SESSION_TIME });
  });
  it("renames a copy the coach never named, and leaves a chosen title alone", () => {
    expect(sessionCopyDefaults({ ...dated(2026, 9, 18), title: "Uke 38 - fredag" }, new Date(2026, 8, 18)).title).toBe("Uke 39 - fredag");
    expect(sessionCopyDefaults({ ...dated(2026, 9, 18), title: UNTITLED_SESSION_TITLE }, new Date(2026, 8, 18)).title).toBe("Uke 39 - fredag");
    expect(sessionCopyDefaults({ ...dated(2026, 9, 18), title: "Keepertrening" }, new Date(2026, 8, 18)).title).toBe("Keepertrening");
  });

  describe("the copy itself", () => {
    let counter = 0;
    const copy = (overrides: Partial<Parameters<typeof buildSessionCopy>[1]> = {}) => {
      counter = 0;
      return buildSessionCopy({ ...demoSessions[0], status: "completed", startedAt: "2026-09-04T16:30:00.000Z", completedAt: "2026-09-04T18:00:00.000Z", groupingKind: "teams" }, {
        id: "session-copy", title: "Uke 39 - fredag", startsAt: "2026-09-25T14:30:00.000Z", userId: "user-nora",
        makeId: () => `copied-${(counter += 1)}`, now: new Date("2026-09-19T08:00:00.000Z"), ...overrides,
      });
    };

    it("lands as a fresh draft on the chosen date, owned by whoever copied it", () => {
      const made = copy();
      expect(made).toMatchObject({ id: "session-copy", title: "Uke 39 - fredag", startsAt: "2026-09-25T14:30:00.000Z", status: "draft", startedAt: null, completedAt: null, groupingKind: null, createdBy: "user-nora", updatedBy: "user-nora" });
      expect(made.createdAt).toBe("2026-09-19T08:00:00.000Z");
    });
    it("carries the whole plan over with fresh ids", () => {
      const made = copy();
      const source = demoSessions[0];
      expect(made.blocks.map((block) => block.title)).toEqual(source.blocks.map((block) => block.title));
      expect(made.blocks.map((block) => block.items.map((item) => [item.title, item.durationMinutes, item.coachingNotes]))).toEqual(source.blocks.map((block) => block.items.map((item) => [item.title, item.durationMinutes, item.coachingNotes])));
      const ids = [...made.blocks.map((block) => block.id), ...made.blocks.flatMap((block) => block.items.map((item) => item.id))];
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.some((id) => source.blocks.some((block) => block.id === id || block.items.some((item) => item.id === id)))).toBe(false);
      expect(made.blocks.every((block) => block.sessionId === "session-copy" && block.items.every((item) => item.blockId === block.id))).toBe(true);
    });
    it("keeps the plan's own numbers and notes", () => {
      expect(copy()).toMatchObject({ venue: demoSessions[0].venue, plannedDurationMinutes: demoSessions[0].plannedDurationMinutes, objective: demoSessions[0].objective, notes: demoSessions[0].notes });
    });
    it("falls back to the source title when the field was left blank", () => {
      expect(copy({ title: "   " }).title).toBe(demoSessions[0].title);
    });
    it("keeps an activity's coach, but not one who has left the team", () => {
      const assigned = demoSessions[0].blocks.flatMap((block) => block.items).filter((item) => item.assignedCoachId);
      expect(assigned.length).toBeGreaterThan(0);
      const kept = copy({ memberIds: ["user-gard", "user-nora", "user-sam"] }).blocks.flatMap((block) => block.items).filter((item) => item.assignedCoachId);
      expect(kept).toHaveLength(assigned.length);
      const dropped = copy({ memberIds: ["user-gard"] }).blocks.flatMap((block) => block.items).filter((item) => item.assignedCoachId);
      expect(dropped.map((item) => item.assignedCoachId)).toEqual(["user-gard"]);
    });
  });
});
