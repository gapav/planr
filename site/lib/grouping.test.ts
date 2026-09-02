import { describe, expect, it } from "vitest";
import type { TeamPlayer } from "./types";
import { makePairs, makeTeams } from "./grouping";

const players = Array.from({ length: 7 }, (_, index): TeamPlayer => ({
  id: `player-${index + 1}`, teamId: "team-1", fullName: `Player ${index + 1}`,
  jerseyNumber: null, createdAt: "2026-01-01", updatedAt: "2026-01-01",
}));

describe("session grouping", () => {
  it("distributes teams with at most one player difference", () => {
    const groups = makeTeams(players, 3, () => 0.99);
    expect(groups.map((group) => group.playerIds.length)).toEqual([3, 2, 2]);
    expect(new Set(groups.flatMap((group) => group.playerIds)).size).toBe(7);
  });

  it("uses a trio for an odd attendance count", () => {
    const groups = makePairs(players.slice(0, 5), () => 0.99);
    expect(groups.map((group) => group.playerIds.length)).toEqual([2, 3]);
    expect(groups[1].label).toBe("Trio 2");
  });
});
