import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPlayers, demoSessions } from "@/lib/demo-data";
import { WorkoutSession } from "./live-session";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
const undoWorkoutStart = vi.fn();

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const liveSession = { ...demoSessions[0], status: "in_progress" as const, groupingKind: "teams" as const };
const attendance = demoPlayers.slice(0, 4).map((player) => ({ sessionId: liveSession.id, playerId: player.id, isPresent: true, checkedInAt: null }));
const groupings = [{ sessionId: liveSession.id, kind: "teams" as const, generatedAt: "2026-09-02T12:00:00.000Z", groups: [
  { id: "group-1", label: "Team 1", playerIds: [demoPlayers[0].id, demoPlayers[1].id] },
  { id: "group-2", label: "Team 2", playerIds: [demoPlayers[2].id, demoPlayers[3].id] },
] }];

describe("live session runner", () => {
  beforeEach(() => {
    undoWorkoutStart.mockReset().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ sessions: [liveSession], players: demoPlayers, attendance, groupings, undoWorkoutStart, finishWorkout: vi.fn() });
  });

  it("shows one complete block and moves directly between blocks", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.getByRole("heading", { name: "Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shoulder activation circle" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Three-lane transition" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next block" }));

    expect(screen.getByRole("heading", { name: "Main block" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Three-lane transition" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shoulder activation circle" })).not.toBeInTheDocument();
  });

  it("opens the full timeline and jumps to a selected block", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Session overview" }));
    const overview = screen.getByRole("dialog", { name: "Session overview" });
    expect(within(overview).getByText("Three-lane transition")).toBeInTheDocument();
    expect(within(overview).getByText("6 vs 6 conditioned game")).toBeInTheDocument();

    fireEvent.click(within(overview).getByRole("button", { name: "Go to Game" }));

    expect(screen.queryByRole("dialog", { name: "Session overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Game" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6 vs 6 conditioned game" })).toBeInTheDocument();
  });

  it("keeps the saved teams one tap away", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Show teams" }));

    const teams = screen.getByRole("dialog", { name: "Today’s teams" });
    expect(within(teams).getByText("Team 1")).toBeInTheDocument();
    expect(within(teams).getByText(demoPlayers[0].fullName)).toBeInTheDocument();
  });

  it("offers to undo the workout start instead of going back from the first block", async () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.queryByRole("button", { name: "Previous block" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo start" })[0]);

    const confirmation = screen.getByRole("dialog", { name: "Undo workout start?" });
    expect(within(confirmation).getByText(/Attendance and groups stay saved/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Undo start" }));

    await waitFor(() => expect(undoWorkoutStart).toHaveBeenCalledWith(liveSession.id));
    expect(screen.queryByRole("dialog", { name: "Undo workout start?" })).not.toBeInTheDocument();
  });
});
