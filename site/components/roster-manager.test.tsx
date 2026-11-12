import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPlayers } from "@/lib/demo-data";
import { RosterManager } from "./roster-manager";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./help-tip", () => ({ HelpTip: () => null }));

const store = (workspaceLoaded: boolean) => ({ importPlayers: vi.fn(), removePlayer: vi.fn(), workspaceLoaded });

// Decision 9: before the workspace has loaded, no players means "not here yet".
describe("RosterManager", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("says the players are loading, not that there are none, before the workspace has loaded", () => {
    mocks.useGrep.mockReturnValue(store(false));
    render(<RosterManager players={[]} canManage />);
    expect(screen.getByRole("status")).toHaveTextContent("Henter spillerne …");
    expect(screen.queryByText("Ingen spillere ennå")).not.toBeInTheDocument();
  });

  it("still says there are no players once an empty roster has loaded", () => {
    mocks.useGrep.mockReturnValue(store(true));
    render(<RosterManager players={[]} canManage />);
    expect(screen.getByText("Ingen spillere ennå")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists the players it has", () => {
    mocks.useGrep.mockReturnValue(store(true));
    render(<RosterManager players={demoPlayers.slice(0, 2)} canManage={false} />);
    expect(screen.getByText(demoPlayers[0].fullName)).toBeInTheDocument();
  });
});
