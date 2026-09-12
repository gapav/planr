import { describe, expect, it } from "vitest";
import { claimableInvitations, internalPath, invitationUrl, isIdentityChange, isLocalhost, keepSelectedTeamId, magicLinkRedirectUrl, MIN_PASSWORD_LENGTH, passwordProblem, passwordResetRedirectUrl, shouldLoadWorkspace, WORKSPACE_RELOAD_INTERVAL_MS } from "./auth";
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
    expect(invitationUrl("https://grep.team", "abc")).toBe("https://grep.team/invite/abc");
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(invitationUrl("https://grep.team/", "abc")).toBe("https://grep.team/invite/abc");
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

describe("magicLinkRedirectUrl", () => {
  it("returns through the confirmation page and preserves an internal destination", () => {
    expect(magicLinkRedirectUrl("https://grep.team", "/today")).toBe("https://grep.team/auth/confirm?next=%2Ftoday");
  });

  it("does not carry an external redirect into the email", () => {
    expect(magicLinkRedirectUrl("https://grep.team/", "https://evil.example/steal")).toBe("https://grep.team/auth/confirm?next=%2Fsessions");
  });
});

describe("isLocalhost", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("recognizes %s as local", (hostname) => {
    expect(isLocalhost(hostname)).toBe(true);
  });

  it("does not enable local-only login on the production host", () => {
    expect(isLocalhost("grep.team")).toBe(false);
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

  it("restores the remembered team after a reload started from the placeholder", () => {
    expect(keepSelectedTeamId("demo-team", ["j2016", "g2014"], "g2014")).toBe("g2014");
  });

  it("ignores a remembered team the coach is no longer on", () => {
    expect(keepSelectedTeamId("demo-team", ["j2016", "g2014"], "left-this-one")).toBe("j2016");
  });

  it("prefers the live selection over the remembered one", () => {
    expect(keepSelectedTeamId("j2016", ["j2016", "g2014"], "g2014")).toBe("j2016");
  });
});

describe("passwordResetRedirectUrl", () => {
  it("sends a recovery link through the page that can verify a token hash", () => {
    expect(passwordResetRedirectUrl("https://grep.team")).toBe("https://grep.team/auth/confirm?type=recovery");
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(passwordResetRedirectUrl("https://grep.team/")).toBe("https://grep.team/auth/confirm?type=recovery");
  });
});

describe("shouldLoadWorkspace", () => {
  const last = { userId: "coach-1", at: 1_000_000 };

  it("loads when nothing has been loaded yet", () => {
    expect(shouldLoadWorkspace(null, "coach-1", 1_000_000)).toBe(true);
  });

  it("collapses the pair of loads one page load fires", () => {
    expect(shouldLoadWorkspace(last, "coach-1", last.at + 40)).toBe(false);
  });

  it("does not refetch the workspace every time the tab is refocused", () => {
    expect(shouldLoadWorkspace(last, "coach-1", last.at + 30_000)).toBe(false);
  });

  it("reloads once the data has had time to go stale", () => {
    expect(shouldLoadWorkspace(last, "coach-1", last.at + WORKSPACE_RELOAD_INTERVAL_MS)).toBe(true);
  });

  it("always reloads for a different coach", () => {
    expect(shouldLoadWorkspace(last, "coach-2", last.at + 40)).toBe(true);
  });
});
