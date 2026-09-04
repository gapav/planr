import { describe, expect, it } from "vitest";
import type { TeamPlayer } from "./types";
import { makePairs, makeTeams, movePlayerToGroup } from "./grouping";

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

  it("moves a player to another group and leaves the rest untouched", () => {
    const groups = makeTeams(players, 3, () => 0.99);
    const from = groups.find((group) => group.playerIds.includes("player-1"))!;
    const target = groups.find((group) => group.id !== from.id)!;
    const moved = movePlayerToGroup(groups, "player-1", target.id);
    expect(moved.find((group) => group.id === from.id)!.playerIds).not.toContain("player-1");
    expect(moved.find((group) => group.id === target.id)!.playerIds).toContain("player-1");
    expect(moved.flatMap((group) => group.playerIds).sort()).toEqual(groups.flatMap((group) => group.playerIds).sort());
  });

  it("keeps the same array when the player is already in the target group or it is gone", () => {
    const groups = makeTeams(players, 3, () => 0.99);
    const home = groups.find((group) => group.playerIds.includes("player-1"))!;
    expect(movePlayerToGroup(groups, "player-1", home.id)).toBe(groups);
    expect(movePlayerToGroup(groups, "player-1", "team-9")).toBe(groups);
  });
});
