import { describe, expect, it } from "vitest";
import { claimableInvitations, internalPath, invitationUrl, isIdentityChange, keepSelectedTeamId, MIN_PASSWORD_LENGTH, passwordProblem } from "./auth";
import type { TeamInvitation } from "./types";

describe("passwordProblem", () => {
  it("accepts a long enough matching password", () => {
    expect(passwordProblem("correct horse battery", "correct horse battery")).toBeNull();
  });

  it("rejects a password under the minimum length", () => {
    expect(passwordProblem("short", "short")).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects whitespace padded to the minimum length", () => {
    expect(passwordProblem(" ".repeat(MIN_PASSWORD_LENGTH), " ".repeat(MIN_PASSWORD_LENGTH))).toBe("Bruk minst ett tegn som ikke er et mellomrom.");
  });

  it("rejects a mismatched confirmation", () => {
    expect(passwordProblem("correct horse battery", "correct horse batteru")).toBe("Passordene er ikke like.");
  });
});

describe("invitationUrl", () => {
  it("builds the invite link from the current origin", () => {
    expect(invitationUrl("https://plannr.no", "abc")).toBe("https://plannr.no/invite/abc");
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(invitationUrl("https://plannr.no/", "abc")).toBe("https://plannr.no/invite/abc");
  });
});

describe("internalPath", () => {
  it("keeps a same-origin path so an invite survives the password change", () => {
    expect(internalPath("/invite/abc")).toBe("/invite/abc");
  });

  it("falls back when there is no destination", () => {
    expect(internalPath(null)).toBe("/sessions");
    expect(internalPath("")).toBe("/sessions");
  });

  it("rejects an absolute url", () => {
    expect(internalPath("https://evil.example/steal")).toBe("/sessions");
  });

  it("rejects a protocol-relative url that would leave the site", () => {
    expect(internalPath("//evil.example/steal")).toBe("/sessions");
  });
});

describe("isIdentityChange", () => {
  it("reloads when someone signs in or out", () => {
    expect(isIdentityChange("SIGNED_IN")).toBe(true);
    expect(isIdentityChange("SIGNED_OUT")).toBe(true);
    expect(isIdentityChange("INITIAL_SESSION")).toBe(true);
  });

  it("ignores the event a password change emits, which would race the flag write", () => {
    expect(isIdentityChange("USER_UPDATED")).toBe(false);
  });

  it("ignores routine token refreshes", () => {
    expect(isIdentityChange("TOKEN_REFRESHED")).toBe(false);
  });
});

describe("claimableInvitations", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  const invitation = (patch: Partial<TeamInvitation> = {}): TeamInvitation => ({
    id: "inv-1", teamId: "team-1", email: "kari@klubb.no", role: "coach", token: "tok-1",
    expiresAt: "2026-09-10T12:00:00Z", acceptedAt: null, ...patch,
  });

  it("claims the invitation addressed to this coach", () => {
    expect(claimableInvitations("kari@klubb.no", [], [invitation()], now)).toHaveLength(1);
  });

  it("ignores case and padding on both addresses", () => {
    expect(claimableInvitations("  Kari@Klubb.no ", [], [invitation({ email: "KARI@klubb.no" })], now)).toHaveLength(1);
  });

  it("leaves another coach's invitation alone", () => {
    expect(claimableInvitations("ola@klubb.no", [], [invitation()], now)).toEqual([]);
  });

  it("skips a team the coach is already on, so an admin does not re-accept their own invite", () => {
    expect(claimableInvitations("kari@klubb.no", ["team-1"], [invitation()], now)).toEqual([]);
  });

  it("skips an expired invitation rather than letting the rpc reject it", () => {
    expect(claimableInvitations("kari@klubb.no", [], [invitation({ expiresAt: "2026-09-01T12:00:00Z" })], now)).toEqual([]);
  });

  it("skips an already accepted invitation", () => {
    expect(claimableInvitations("kari@klubb.no", [], [invitation({ acceptedAt: "2026-09-02T12:00:00Z" })], now)).toEqual([]);
  });

  it("skips a row whose token the policy withheld", () => {
    expect(claimableInvitations("kari@klubb.no", [], [invitation({ token: null })], now)).toEqual([]);
  });

  it("has nothing to claim without a signed-in address", () => {
    expect(claimableInvitations(null, [], [invitation()], now)).toEqual([]);
    expect(claimableInvitations("", [], [invitation()], now)).toEqual([]);
  });
});

describe("keepSelectedTeamId", () => {
  it("keeps the team the coach selected when the workspace reloads", () => {
    expect(keepSelectedTeamId("g2014", ["j2016", "g2014"])).toBe("g2014");
  });

  it("falls back to the first team when the selection is no longer a team they are on", () => {
    expect(keepSelectedTeamId("demo-team", ["j2016", "g2014"])).toBe("j2016");
  });

  it("keeps the current value when the reload returned no teams", () => {
    expect(keepSelectedTeamId("g2014", [])).toBe("g2014");
  });
});
