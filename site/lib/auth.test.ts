import { describe, expect, it } from "vitest";
import { internalPath, invitationUrl, isIdentityChange, MIN_PASSWORD_LENGTH, passwordProblem } from "./auth";

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
