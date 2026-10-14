import { describe, expect, it } from "vitest";
import { parseRosterRows, planRosterImport } from "./roster";

describe("Hoopit roster parsing", () => {
  it("finds Norwegian columns after preamble rows", () => {
    const result = parseRosterRows([
      ["Eksportert fra Hoopit"],
      ["Fornavn", "Etternavn", "E-post", "Draktnummer", "Medlemsnummer"],
      ["Ada", "Lunde", "ADA@example.no", 9, 1234],
      ["Mina", "Berg", "", 12, 4567],
    ]);
    expect(result.headerRow).toBe(2);
    expect(result.players).toEqual([
      { fullName: "Ada L.", jerseyNumber: "9" },
      { fullName: "Mina B.", jerseyNumber: "12" },
    ]);
  });

  it("deduplicates full-name exports", () => {
    const result = parseRosterRows([["Navn"], ["Ada Lunde"], ["Ada  Lunde"], [""]]);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].fullName).toBe("Ada L.");
    expect(result.skippedRows).toBe(2);
  });

  it("keeps only the first name and final surname initial", () => {
    const result = parseRosterRows([["Navn", "Nummer"], ["Ingrid Marie von Dahl", 4]]);
    expect(result.players[0]).toEqual({ fullName: "Ingrid D.", jerseyNumber: "4" });
  });

  it("explains an unrecognized export", () => {
    expect(() => parseRosterRows([["Klubb", "Lag"], ["Fjordvik", "Senior"]])).toThrow("Fant ingen navnekolonne");
  });
});

describe("planning a roster import", () => {
  const now = "2026-10-14T12:00:00.000Z";
  let next = 0;
  const options = { teamId: "team-1", now, makeId: () => `new-${++next}` };
  const player = (id: string, fullName: string, jerseyNumber: string | null) => ({ id, teamId: "team-1", fullName, jerseyNumber, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" });

  it("never matches two rows to the same existing player", () => {
    next = 0;
    const plan = planRosterImport([player("p1", "Emma H.", null), player("p2", "Emma H.", null)], [{ fullName: "Emma Hansen", jerseyNumber: null }, { fullName: "Emma Holm", jerseyNumber: null }], options);
    expect(plan.players.map((entry) => entry.id)).toEqual(["p1", "p2"]);
    expect(plan).toMatchObject({ added: 0, updated: 2 });
  });

  it("adds a namesake once the only existing player of that name is taken", () => {
    next = 0;
    const plan = planRosterImport([player("p1", "Emma H.", null)], [{ fullName: "Emma Hansen", jerseyNumber: null }, { fullName: "Emma Holm", jerseyNumber: null }], options);
    expect(plan.players.map((entry) => entry.id)).toEqual(["p1", "new-1"]);
    expect(plan).toMatchObject({ added: 1, updated: 1 });
  });

  // The jersey is the better evidence, so the fallback must not run first and
  // give the matching player's row to a namesake further up the sheet.
  it("settles jersey matches before the namesake fallback", () => {
    next = 0;
    const plan = planRosterImport([player("p1", "Emma H.", "7")], [{ fullName: "Emma Holm", jerseyNumber: "12" }, { fullName: "Emma Hansen", jerseyNumber: "7" }], options);
    expect(plan.players.map((entry) => [entry.id, entry.jerseyNumber])).toEqual([["new-1", "12"], ["p1", "7"]]);
  });

  it("follows a single player whose jersey changed, and minimizes every name", () => {
    next = 0;
    const plan = planRosterImport([player("p1", "Ada L.", "9")], [{ fullName: "Ada Marie Lunde", jerseyNumber: "10" }], options);
    expect(plan.players).toEqual([{ ...player("p1", "Ada L.", "10"), updatedAt: now }]);
  });
});
