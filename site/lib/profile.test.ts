import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, displayNameError, normalizeDisplayName } from "./profile";

describe("normalizeDisplayName", () => {
  it("trims the ends and collapses inner whitespace", () => {
    expect(normalizeDisplayName("  Kari   Nordmann \n")).toBe("Kari Nordmann");
  });

  it("leaves an already tidy name alone", () => {
    expect(normalizeDisplayName("Ola Nordmann")).toBe("Ola Nordmann");
  });
});

describe("displayNameError", () => {
  it("accepts an ordinary name", () => {
    expect(displayNameError("Ola Nordmann")).toBeNull();
  });

  it("refuses a blank or one-character name", () => {
    expect(displayNameError("   ")).toBe("Visningsnavnet må ha minst to tegn.");
    expect(displayNameError("O")).toBe("Visningsnavnet må ha minst to tegn.");
  });

  it("refuses a name longer than the column allows", () => {
    expect(displayNameError("a".repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull();
    expect(displayNameError("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).not.toBeNull();
  });

  it("measures the normalized name, not the raw input", () => {
    expect(displayNameError("  Ola  ")).toBeNull();
  });
});
