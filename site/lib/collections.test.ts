import { describe, expect, it } from "vitest";
import { collectionNameError, collectionsForTeam, normalizeCollectionName, sortCollections } from "./collections";

const existing = [
  { id: "c1", name: "Oktober 2026 fokus", teamId: "team-1" },
  { id: "c2", name: "Åpent forsvar", teamId: "team-1" },
  { id: "c3", name: "Bortekamp", teamId: "team-2" },
];

describe("normalizeCollectionName", () => {
  it("trims the ends and collapses inner whitespace", () => {
    expect(normalizeCollectionName("  Oktober   2026  fokus ")).toBe("Oktober 2026 fokus");
  });
});

describe("collectionNameError", () => {
  it("accepts an ordinary name", () => {
    expect(collectionNameError("Novemberfokus", existing)).toBeNull();
  });

  it("refuses a blank name", () => {
    expect(collectionNameError("   ", existing)).toBe("Gi samlingen et navn.");
  });

  it("refuses a name past the length the database accepts", () => {
    expect(collectionNameError("x".repeat(61), existing)).toBe("Navnet kan ha høyst 60 tegn.");
    expect(collectionNameError("x".repeat(60), existing)).toBeNull();
  });

  // The unique index folds case and trims, so the dialog has to as well or the
  // refusal arrives from Postgres as a raw unique violation.
  it("refuses a name another samling already has, however it is written", () => {
    expect(collectionNameError("  oktober 2026 FOKUS ", existing)).toBe("Laget har allerede en samling med dette navnet.");
  });

  it("lets a samling keep its own name while being renamed", () => {
    expect(collectionNameError("Oktober 2026 fokus", existing, "c1")).toBeNull();
    expect(collectionNameError("Åpent forsvar", existing, "c1")).toBe("Laget har allerede en samling med dette navnet.");
  });
});

describe("sortCollections", () => {
  it("orders by Norwegian alphabet, so å comes last", () => {
    expect(sortCollections(existing).map((entry) => entry.name)).toEqual(["Bortekamp", "Oktober 2026 fokus", "Åpent forsvar"]);
  });
});

describe("collectionsForTeam", () => {
  it("keeps one team's samlinger, in order", () => {
    expect(collectionsForTeam(existing, "team-1").map((entry) => entry.id)).toEqual(["c1", "c2"]);
  });

  it("has nothing to show before a team is chosen", () => {
    expect(collectionsForTeam(existing, null)).toEqual([]);
  });
});
