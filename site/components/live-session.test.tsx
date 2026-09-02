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
  { id: "group-1", label: "Lag 1", playerIds: [demoPlayers[0].id, demoPlayers[1].id] },
  { id: "group-2", label: "Lag 2", playerIds: [demoPlayers[2].id, demoPlayers[3].id] },
] }];

describe("live session runner", () => {
  beforeEach(() => {
    undoWorkoutStart.mockReset().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ sessions: [liveSession], players: demoPlayers, attendance, groupings, undoWorkoutStart, finishWorkout: vi.fn() });
  });

  it("shows one complete block and moves directly between blocks", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.getByRole("heading", { name: "Oppvarming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sirkel for skulderaktivering" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tre rekker i kontring" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Neste bolk" }));

    expect(screen.getByRole("heading", { name: "Hoveddel" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tre rekker i kontring" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sirkel for skulderaktivering" })).not.toBeInTheDocument();
  });

  it("opens the full timeline and jumps to a selected block", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Øktoversikt" }));
    const overview = screen.getByRole("dialog", { name: "Øktoversikt" });
    expect(within(overview).getByText("Tre rekker i kontring")).toBeInTheDocument();
    expect(within(overview).getByText("6 mot 6 med betingelser")).toBeInTheDocument();

    fireEvent.click(within(overview).getByRole("button", { name: "Gå til Spill" }));

    expect(screen.queryByRole("dialog", { name: "Øktoversikt" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spill" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6 mot 6 med betingelser" })).toBeInTheDocument();
  });

  it("keeps the saved teams one tap away", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Vis lag" }));

    const teams = screen.getByRole("dialog", { name: "Dagens lag" });
    expect(within(teams).getByText("Lag 1")).toBeInTheDocument();
    expect(within(teams).getByText(demoPlayers[0].fullName)).toBeInTheDocument();
  });

  it("offers to undo the workout start instead of going back from the first block", async () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.queryByRole("button", { name: "Forrige bolk" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Angre start" })[0]);

    const confirmation = screen.getByRole("dialog", { name: "Vil du angre starten av økten?" });
    expect(within(confirmation).getByText(/Oppmøte og grupper beholdes/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Angre start" }));

    await waitFor(() => expect(undoWorkoutStart).toHaveBeenCalledWith(liveSession.id));
    expect(screen.queryByRole("dialog", { name: "Vil du angre starten av økten?" })).not.toBeInTheDocument();
  });
});
