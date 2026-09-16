import { describe, expect, it } from "vitest";
import { isInvitationAlreadyUsed, isTransportFailure, norwegianServerMessage } from "./server-messages";

describe("norwegianServerMessage", () => {
  it("explains the manual colour migration when the schema is older than the app", () => {
    expect(norwegianServerMessage("Could not find the 'our_team_colors' column of 'team_fixtures' in the schema cache")).toContain("202609130001");
  });
  it("translates an English database message", () => {
    expect(norwegianServerMessage("Invitation has expired")).toBe("Invitasjonen har utløpt");
  });

  it("passes a Norwegian database message through untouched", () => {
    expect(norwegianServerMessage("Invitasjonen har utløpt")).toBe("Invitasjonen har utløpt");
  });

  it("falls back for anything it does not recognise", () => {
    expect(norwegianServerMessage("JWT expired", "Invitasjonen kunne ikke godtas.")).toBe("Invitasjonen kunne ikke godtas.");
  });

  // 202609020018 raises these from `create_team` and `admin_list_teams`. They
  // are never worded in English, so they reach the coach only because they
  // carry a Norwegian character — keep them that way.
  it("passes the admin-role messages through instead of swallowing them", () => {
    expect(norwegianServerMessage("Du må være systemadministrator for å opprette lag", "Laget kunne ikke opprettes.")).toBe("Du må være systemadministrator for å opprette lag");
    expect(norwegianServerMessage("Du må være systemadministrator", "Lagene kunne ikke lastes.")).toBe("Du må være systemadministrator");
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

describe("isTransportFailure", () => {
  it("recognises the rejected fetch postgrest-js reports as status 0", () => {
    expect(isTransportFailure({ status: 0, error: { message: "TypeError: Failed to fetch" } })).toBe(true);
  });

  it("recognises a lost answer by its message alone", () => {
    expect(isTransportFailure({ error: { message: "TypeError: Load failed" } })).toBe(true);
    expect(isTransportFailure({ error: { message: "AbortError: The user aborted a request." } })).toBe(true);
    expect(isTransportFailure({ error: { message: "FetchError: request to … failed" } })).toBe(true);
  });

  // A refusal reached the database and nothing was written, so it keeps the
  // wording that says the action failed.
  it("does not mistake a database refusal for a lost connection", () => {
    expect(isTransportFailure({ status: 403, error: { message: "new row violates row-level security policy for table \"sessions\"" } })).toBe(false);
    expect(isTransportFailure({ status: 400, error: { message: "Denne økten pågår og er låst" } })).toBe(false);
    expect(isTransportFailure({ status: 204, error: null })).toBe(false);
  });
});
