import { describe, expect, it } from "vitest";
import { invitationUrl, MIN_PASSWORD_LENGTH, passwordProblem } from "./auth";

describe("passwordProblem", () => {
  it("accepts a long enough matching password", () => {
    expect(passwordProblem("correct horse battery", "correct horse battery")).toBeNull();
  });

  it("rejects a password under the minimum length", () => {
    expect(passwordProblem("short", "short")).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects whitespace padded to the minimum length", () => {
    expect(passwordProblem(" ".repeat(MIN_PASSWORD_LENGTH), " ".repeat(MIN_PASSWORD_LENGTH))).toBe("Use at least one non-space character.");
  });

  it("rejects a mismatched confirmation", () => {
    expect(passwordProblem("correct horse battery", "correct horse batteru")).toBe("The two passwords do not match.");
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
