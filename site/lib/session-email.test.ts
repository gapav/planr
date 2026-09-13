import { describe, expect, it } from "vitest";
import type { DigestSession } from "./session-digest";
import { dailySessionDigestEmail, digestSubject } from "./session-email";

const recipient = { profileId: "coach-1", fullName: "Kari Nordmann" };
const siteUrl = "https://grep.team";

function session(overrides: Partial<DigestSession> = {}): DigestSession {
  return {
    id: "session-1", teamId: "team-1", teamName: "Fjordvik G14", title: "Teknikkøkt",
    startsAt: "2026-09-12T16:00:00.000Z", venue: "Fjordvik hall", plannedDurationMinutes: 90,
    objective: "Pasningskvalitet", notes: "", status: "published",
    blocks: [{
      title: "Hoveddel", notes: "",
      items: [
        { title: "Firkant 4v2", durationMinutes: 20, coachingNotes: "Høyt tempo", assignedCoachId: "coach-2" },
        { title: "Avslutninger", durationMinutes: 15, coachingNotes: "", assignedCoachId: "coach-1" },
      ],
    }],
    ...overrides,
  };
}

describe("digestSubject", () => {
  it("puts the time and the title where a phone shows them", () => {
    // 16:00Z is 18:00 in Oslo.
    expect(digestSubject([session()])).toBe("I dag 18:00 · Teknikkøkt");
  });

  it("counts them when a coach has more than one", () => {
    expect(digestSubject([session(), session({ id: "session-2", startsAt: "2026-09-12T18:00:00.000Z" })]))
      .toBe("2 økter i dag · første 18:00");
  });
});

describe("dailySessionDigestEmail", () => {
  it("sends nothing rather than an empty letter", () => {
    expect(dailySessionDigestEmail({ recipient, sessions: [], siteUrl })).toBeNull();
  });

  it("carries the whole plan, so the coach does not have to sign in to read it", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl });
    expect(mail?.html).toContain("Hoveddel");
    expect(mail?.html).toContain("Firkant 4v2");
    expect(mail?.html).toContain("Høyt tempo");
    expect(mail?.html).toContain("Pasningskvalitet");
    expect(mail?.text).toContain("- Firkant 4v2 (20 min)");
  });

  it("marks only the activities this coach is responsible for", () => {
    const { html, text } = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl })!;
    expect(html.match(/du har ansvar/gi)).toHaveLength(1);
    expect(text).toContain("- Avslutninger (15 min) — du har ansvar");
    expect(text).not.toContain("- Firkant 4v2 (20 min) — du har ansvar");
  });

  it("links straight to the session, and to the list when there are several", () => {
    const one = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl })!;
    expect(one.html).toContain("https://grep.team/sessions/session-1");
    const two = dailySessionDigestEmail({ recipient, sessions: [session(), session({ id: "session-2", startsAt: "2026-09-12T18:00:00.000Z" })], siteUrl })!;
    expect(two.html).toContain(`href="https://grep.team/sessions"`);
  });

  it("does not double the slash when the site url has a trailing one", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl: "https://grep.team/" })!;
    expect(mail.text).toContain("https://grep.team/sessions/session-1");
  });

  it("states the minutes the plan holds against the minutes it was booked for", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl })!;
    // 20 + 15 built, 90 booked — the app's own "50 av 90 min" reading.
    expect(mail.html).toContain("35 av 90 min");
    expect(mail.text).toContain("35 av 90 min");
  });

  it("falls back to the booked duration for a plan with nothing in it yet", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session({ blocks: [] })], siteUrl })!;
    expect(mail.text).toContain("1 t 30 min");
  });

  it("says when a session is already under way", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session({ status: "in_progress" })], siteUrl })!;
    expect(mail.html).toContain("allerede startet");
    expect(mail.text).toContain("allerede startet");
  });

  it("escapes plan text, which coaches type themselves", () => {
    const mail = dailySessionDigestEmail({
      recipient,
      sessions: [session({ title: '<img src=x onerror="alert(1)">', objective: "<script>alert(1)</script>" })],
      siteUrl,
    })!;
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;img");
  });

  it("tells the coach how to stop receiving it", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl })!;
    expect(mail.html).toContain("Dagens økt på e-post");
    expect(mail.text).toContain("Dagens økt på e-post");
  });
});
