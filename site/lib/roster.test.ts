import { describe, expect, it } from "vitest";
import { parseRosterRows } from "./roster";

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
