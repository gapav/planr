import { describe, expect, it } from "vitest";
import type { DigestSession } from "./session-digest";
import { dailySessionDigestEmail, digestSubject } from "./session-email";

const recipient = { profileId: "coach-1", fullName: "Kari Nordmann" };
const siteUrl = "https://grep.team";

function session(overrides: Partial<DigestSession> = {}): DigestSession {
  return {
    id: "session-1", teamId: "team-1", teamName: "Fjordvik G14", title: "Teknikkøkt",
    startsAt: "2026-09-12T16:00:00.000Z", venue: "Fjordvik hall", plannedDurationMinutes: 90,
    objective: "Pasningskvalitet", notes: "", status: "published", monthFocus: "",
    blocks: [{
      title: "Hoveddel", notes: "", kind: "sequence",
      items: [
        { title: "Firkant 4v2", durationMinutes: 20, coachingNotes: "Høyt tempo", assignedCoachId: "coach-2" },
        { title: "Avslutninger", durationMinutes: 15, coachingNotes: "", assignedCoachId: "coach-1" },
      ],
    }],
    ...overrides,
  };
}

describe("digestSubject", () => {
  it("names the team and nothing more", () => {
    expect(digestSubject([session()])).toBe("Dagens økt for Fjordvik G14");
  });

  it("lists every team when more than one trains", () => {
    expect(digestSubject([session(), session({ id: "session-2", teamName: "Fjordvik J13" })]))
      .toBe("Dagens økter for Fjordvik G14 og Fjordvik J13");
    expect(digestSubject([session(), session({ id: "session-2", teamName: "B" }), session({ id: "session-3", teamName: "C" })]))
      .toBe("Dagens økter for Fjordvik G14, B og C");
  });

  it("names a team once even when it has two sessions", () => {
    expect(digestSubject([session(), session({ id: "session-2" })])).toBe("Dagens økter for Fjordvik G14");
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

  it("carries the month's focus beside the session's own objective", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session({ monthFocus: "Forsvar 6-0 med aktiv midtblokk." })], siteUrl });
    expect(mail?.html).toContain("Månedens fokus · september");
    expect(mail?.html).toContain("Forsvar 6-0 med aktiv midtblokk.");
    expect(mail?.text).toContain("Månedens fokus (september): Forsvar 6-0 med aktiv midtblokk.");
  });

  it("drops the band entirely when the team has not written one", () => {
    const mail = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl });
    expect(mail?.html).not.toContain("Månedens fokus");
    expect(mail?.text).not.toContain("Månedens fokus");
  });

  it("names a stations block's activities as stations, sharing one rotation", () => {
    const stations = session({
      blocks: [{
        title: "Stasjoner", notes: "", kind: "stations",
        items: [
          { title: "Skudd fra kant", durationMinutes: 10, coachingNotes: "", assignedCoachId: "coach-1" },
          { title: "Finter", durationMinutes: 10, coachingNotes: "", assignedCoachId: null },
          { title: "Keeper", durationMinutes: 10, coachingNotes: "", assignedCoachId: null },
        ],
      }],
    });
    const { html, text } = dailySessionDigestEmail({ recipient, sessions: [stations], siteUrl })!;
    expect(html).toContain("3 stasjoner × 10 min");
    expect(text).toContain("3 stasjoner × 10 min — laget roterer.");
    // The rotation is stated once for the block, not once per station.
    expect(text).toContain("  - 1. Skudd fra kant — du har ansvar");
    expect(text).not.toContain("Skudd fra kant (10 min)");
  });

  it("times every block, because the letter is read away from the app", () => {
    // 16:00Z is 18:00 in Oslo, and the block runs 20 + 15 minutes.
    const { html, text } = dailySessionDigestEmail({ recipient, sessions: [session()], siteUrl })!;
    expect(html).toContain("18:00–18:35 · 35 min");
    expect(text).toContain("Hoveddel (18:00–18:35, 35 min)");
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

  // The plural branch runs for any count, so it may not say "begge".
  it("counts the sessions instead of assuming there are two of them", () => {
    const three = [session(), session({ id: "session-2" }), session({ id: "session-3" })];
    const mail = dailySessionDigestEmail({ recipient, sessions: three, siteUrl })!;
    expect(mail.html).toContain("3 økter");
    expect(mail.html).not.toContain("Begge");
  });

  it("says which teams train rather than counting sessions", () => {
    const two = [session(), session({ id: "session-2", teamName: "Fjordvik J13" })];
    const mail = dailySessionDigestEmail({ recipient, sessions: two, siteUrl })!;
    expect(mail.html).toContain("i dag har Fjordvik G14 og Fjordvik J13 trening");
    expect(mail.html).not.toContain("på lagene dine");
  });
});
