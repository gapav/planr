import { describe, expect, it } from "vitest";
import {
  clubDay,
  digestMailings,
  digestSessionsForDay,
  mapDigestCoach,
  mapDigestSession,
  plannedDigestSends,
  type DigestCoach,
  type DigestSession,
} from "./session-digest";

function session(overrides: Partial<DigestSession> = {}): DigestSession {
  return {
    id: "session-1", teamId: "team-1", teamName: "Fjordvik G14", title: "Teknikkøkt",
    startsAt: "2026-09-12T16:00:00.000Z", venue: "Fjordvik hall", plannedDurationMinutes: 90,
    objective: "", notes: "", status: "published", blocks: [],
    ...overrides,
  };
}

function coach(overrides: Partial<DigestCoach> = {}): DigestCoach {
  return { profileId: "coach-1", teamId: "team-1", email: "kari@example.com", fullName: "Kari Nordmann", digestEnabled: true, ...overrides };
}

describe("clubDay", () => {
  it("derives the day in Oslo, not in UTC", () => {
    // 04:30Z on a summer morning is 06:30 in Oslo — the hour the job runs.
    expect(clubDay(new Date("2026-09-12T04:30:00.000Z"))).toEqual({
      key: "2026-09-12",
      from: "2026-09-11T22:00:00.000Z",
      to: "2026-09-12T22:00:00.000Z",
    });
  });

  it("follows the offset into winter", () => {
    expect(clubDay(new Date("2026-12-15T05:00:00.000Z"))).toEqual({
      key: "2026-12-15",
      from: "2026-12-14T23:00:00.000Z",
      to: "2026-12-15T23:00:00.000Z",
    });
  });

  it("handles the day the clocks go forward, where the day is 23 hours long", () => {
    expect(clubDay(new Date("2027-03-28T05:00:00.000Z"))).toEqual({
      key: "2027-03-28",
      from: "2027-03-27T23:00:00.000Z",
      to: "2027-03-28T22:00:00.000Z",
    });
  });
});

describe("digestSessionsForDay", () => {
  const day = clubDay(new Date("2026-12-15T05:00:00.000Z"));

  it("keeps a late-evening session that UTC has already moved to tomorrow", () => {
    // 22:30Z on 15 December is 23:30 in Oslo, still the same training day.
    const late = session({ startsAt: "2026-12-15T22:30:00.000Z" });
    expect(digestSessionsForDay([late], day)).toHaveLength(1);
  });

  it("excludes a session that belongs to the next Oslo day", () => {
    const tomorrow = session({ startsAt: "2026-12-15T23:30:00.000Z" });
    expect(digestSessionsForDay([tomorrow], day)).toHaveLength(0);
  });

  it("never mails a draft, and never mails a finished session", () => {
    const rows = [
      session({ id: "draft", status: "draft", startsAt: "2026-12-15T16:00:00.000Z" }),
      session({ id: "done", status: "completed", startsAt: "2026-12-15T16:00:00.000Z" }),
      session({ id: "live", status: "in_progress", startsAt: "2026-12-15T16:00:00.000Z" }),
    ];
    expect(digestSessionsForDay(rows, day).map((row) => row.id)).toEqual(["live"]);
  });

  it("sorts the day earliest first", () => {
    const rows = [
      session({ id: "evening", startsAt: "2026-12-15T17:00:00.000Z" }),
      session({ id: "morning", startsAt: "2026-12-15T08:00:00.000Z" }),
    ];
    expect(digestSessionsForDay(rows, day).map((row) => row.id)).toEqual(["morning", "evening"]);
  });
});

describe("plannedDigestSends", () => {
  it("pairs every coach on the session's own team with it", () => {
    const sends = plannedDigestSends([session()], [coach(), coach({ profileId: "coach-2", email: "ola@example.com" })]);
    expect(sends.map((send) => send.profileId)).toEqual(["coach-1", "coach-2"]);
  });

  it("leaves out a coach who opted out, so a claim is never filed for a mail that will not be sent", () => {
    expect(plannedDigestSends([session()], [coach({ digestEnabled: false })])).toEqual([]);
  });

  it("leaves out another team's coaches", () => {
    expect(plannedDigestSends([session()], [coach({ teamId: "team-2" })])).toEqual([]);
  });

  it("leaves out a profile with no usable address", () => {
    expect(plannedDigestSends([session()], [coach({ email: "" })])).toEqual([]);
  });

  it("pairs a coach with each of the day's sessions separately", () => {
    const sends = plannedDigestSends([session(), session({ id: "session-2", startsAt: "2026-09-12T18:00:00.000Z" })], [coach()]);
    expect(sends.map((send) => send.sessionId)).toEqual(["session-1", "session-2"]);
  });
});

describe("digestMailings", () => {
  it("gives a coach one letter holding both of the day's sessions, earliest first", () => {
    const evening = session({ id: "session-2", teamId: "team-2", startsAt: "2026-09-12T18:00:00.000Z" });
    const mailings = digestMailings(
      [{ sessionId: "session-2", profileId: "coach-1", email: "kari@example.com" }, { sessionId: "session-1", profileId: "coach-1", email: "kari@example.com" }],
      [session(), evening],
      [coach()],
    );
    expect(mailings).toHaveLength(1);
    expect(mailings[0].sessions.map((row) => row.id)).toEqual(["session-1", "session-2"]);
    expect(mailings[0].recipient.email).toBe("kari@example.com");
  });

  it("only mails what the database granted — a claim it refused is a mail already sent", () => {
    const mailings = digestMailings([{ sessionId: "session-1", profileId: "coach-2", email: "ola@example.com" }], [session()], [coach(), coach({ profileId: "coach-2", email: "ola@example.com" })]);
    expect(mailings.map((mailing) => mailing.recipient.profileId)).toEqual(["coach-2"]);
  });

  it("drops a claim whose session disappeared rather than sending an empty letter", () => {
    expect(digestMailings([{ sessionId: "gone", profileId: "coach-1", email: "kari@example.com" }], [session()], [coach()])).toEqual([]);
  });
});

describe("mapDigestSession", () => {
  const row = {
    id: "session-1", team_id: "team-1", title: "Teknikkøkt", starts_at: "2026-09-12T16:00:00.000Z",
    venue: "Fjordvik hall", planned_duration_minutes: 90, objective: "Pasningskvalitet", notes: "",
    status: "published" as const, teams: { name: "Fjordvik G14" },
    session_blocks: [
      {
        title: "Hoveddel", notes: "", position: 1, session_items: [
          { title: "Lagret navn", description: "", duration_minutes: 20, coaching_notes: "", assigned_coach_id: null, position: 1, kind: "exercise", exercise_id: "ex-1", exercises: { name: "Firkant 4v2" } },
          { title: "Egen aktivitet", description: "", duration_minutes: 10, coaching_notes: "Høyt tempo", assigned_coach_id: "coach-2", position: 0, kind: "custom", exercise_id: null, exercises: null },
        ],
      },
      { title: "Oppvarming", notes: "Rolig start", position: 0, session_items: [] },
    ],
  };

  it("shows the library's current name for a linked exercise, like the app does", () => {
    const mapped = mapDigestSession(row);
    expect(mapped?.blocks[1].items[1].title).toBe("Firkant 4v2");
  });

  it("keeps the stored title for a custom activity", () => {
    expect(mapDigestSession(row)?.blocks[1].items[0].title).toBe("Egen aktivitet");
  });

  it("orders blocks and items by position, not by the order postgrest returned them", () => {
    const mapped = mapDigestSession(row);
    expect(mapped?.blocks.map((block) => block.title)).toEqual(["Oppvarming", "Hoveddel"]);
    expect(mapped?.blocks[1].items.map((item) => item.durationMinutes)).toEqual([10, 20]);
  });

  it("skips a session with no start time — there is no morning to mail it on", () => {
    expect(mapDigestSession({ ...row, starts_at: null })).toBeNull();
  });
});

describe("mapDigestCoach", () => {
  const profile = { id: "coach-1", email: "kari@example.com", full_name: "Kari Nordmann", session_digest_email: true, deleted_at: null };

  it("reads the opt-out", () => {
    expect(mapDigestCoach({ team_id: "team-1", profile_id: "coach-1", profiles: { ...profile, session_digest_email: false } })?.digestEnabled).toBe(false);
  });

  it("treats an absent flag as opted in, matching the column default", () => {
    expect(mapDigestCoach({ team_id: "team-1", profile_id: "coach-1", profiles: { ...profile, session_digest_email: null } })?.digestEnabled).toBe(true);
  });

  it("never mails the tombstone of a deleted account", () => {
    expect(mapDigestCoach({ team_id: "team-1", profile_id: "coach-1", profiles: { ...profile, deleted_at: "2026-09-01T00:00:00.000Z" } })).toBeNull();
  });
});
