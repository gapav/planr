import { describe, expect, it } from "vitest";
import { isInvitationAlreadyUsed, norwegianServerMessage } from "./server-messages";

describe("norwegianServerMessage", () => {
  it("translates an English database message", () => {
    expect(norwegianServerMessage("Invitation has expired")).toBe("Invitasjonen har utløpt");
  });

  it("passes a Norwegian database message through untouched", () => {
    expect(norwegianServerMessage("Invitasjonen har utløpt")).toBe("Invitasjonen har utløpt");
  });

  it("falls back for anything it does not recognise", () => {
    expect(norwegianServerMessage("JWT expired", "Invitasjonen kunne ikke godtas.")).toBe("Invitasjonen kunne ikke godtas.");
  });
});

describe("isInvitationAlreadyUsed", () => {
  it("recognises both wordings of the single-use check", () => {
    expect(isInvitationAlreadyUsed("Invitation has already been used")).toBe(true);
    expect(isInvitationAlreadyUsed("Invitasjonen er allerede brukt")).toBe(true);
  });

  it("does not treat other invitation failures as an accepted invitation", () => {
    expect(isInvitationAlreadyUsed("Invitasjonen tilhører en annen e-postadresse")).toBe(false);
    expect(isInvitationAlreadyUsed("Invitasjonen har utløpt")).toBe(false);
    expect(isInvitationAlreadyUsed("something else entirely")).toBe(false);
  });
});
