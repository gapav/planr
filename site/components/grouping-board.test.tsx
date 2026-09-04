import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerGroup, TeamPlayer } from "@/lib/types";
import { GroupingBoard } from "./grouping-board";

const players: TeamPlayer[] = ["Ada N.", "Bo K.", "Cato L."].map((fullName, index) => ({
  id: `player-${index + 1}`, teamId: "team-1", fullName,
  jerseyNumber: null, createdAt: "2026-01-01", updatedAt: "2026-01-01",
}));

const groups: PlayerGroup[] = [
  { id: "team-1", label: "Lag 1", playerIds: ["player-1", "player-2"] },
  { id: "team-2", label: "Lag 2", playerIds: ["player-3"] },
];

describe("GroupingBoard", () => {
  it("moves a player through the tap fallback, which is also the keyboard path", () => {
    const onMove = vi.fn();
    render(<GroupingBoard groups={groups} players={players} onMove={onMove} />);

    fireEvent.click(screen.getByRole("button", { name: /Ada N\. i Lag 1/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Lag 1/ })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: /Lag 2/ }));
    expect(onMove).toHaveBeenCalledWith([
      { id: "team-1", label: "Lag 1", playerIds: ["player-2"] },
      { id: "team-2", label: "Lag 2", playerIds: ["player-3", "player-1"] },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps an emptied group as a labelled drop target", () => {
    render(<GroupingBoard groups={[{ id: "team-1", label: "Lag 1", playerIds: [] }, ...groups.slice(1)]} players={players} onMove={vi.fn()} />);

    expect(screen.getByText("Ingen spillere her ennå")).toBeInTheDocument();
  });
});
