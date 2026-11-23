import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessions, demoTeams } from "@/lib/demo-data";
import { LiveSession, WorkoutSession } from "./live-session";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn() }));
const undoWorkoutStart = vi.fn();
const reopenSession = vi.fn();
const copySession = vi.fn();

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const liveSession = { ...demoSessions[0], status: "in_progress" as const };

describe("live session runner", () => {
  beforeEach(() => {
    undoWorkoutStart.mockReset().mockResolvedValue(undefined);
    reopenSession.mockReset().mockResolvedValue(undefined);
    copySession.mockReset().mockResolvedValue("session-copy");
    mocks.push.mockReset();
    mocks.useGrep.mockReturnValue({ sessions: [liveSession], teams: demoTeams, undoWorkoutStart, finishWorkout: vi.fn(), reopenSession, copySession });
  });

  it("shows one complete block and moves directly between blocks", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.getByRole("heading", { name: "Oppvarming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sirkel for skulderaktivering" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tre rekker i kontring" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Neste bolk" }));

    expect(screen.getByRole("heading", { name: "Stasjoner" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tre rekker i kontring" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sirkel for skulderaktivering" })).not.toBeInTheDocument();
  });

  it("says that a stations block runs its activities at once, on one shared rotation", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Neste bolk" }));

    expect(screen.getByText("4 × 10 min")).toBeInTheDocument();
    expect(screen.getByText(/Stasjonene går samtidig\. 4 grupper, rotasjon hvert 10\. minutt\./)).toBeInTheDocument();
    // The minutes are the block's, so no station repeats them on its own card.
    expect(screen.queryByText("10 min", { selector: "span.shrink-0" })).not.toBeInTheDocument();
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

  // Decision 12: Grep holds no player data, so there are no groups to show.
  it("has no groups panel", () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.queryByRole("button", { name: /^Vis (lag|par)$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Dagens (lag|par)/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ingen lagrede grupper/)).not.toBeInTheDocument();
  });

  it("offers to undo the workout start instead of going back from the first block", async () => {
    render(<WorkoutSession sessionId={liveSession.id} />);

    expect(screen.queryByRole("button", { name: "Forrige bolk" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Angre start" })[0]);

    const confirmation = screen.getByRole("dialog", { name: "Vil du angre starten av økten?" });
    expect(within(confirmation).getByText(/tilbake til «Klar til start»/)).toBeInTheDocument();
    expect(within(confirmation).queryByText(/oppmøte|grupper/i)).not.toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Angre start" }));

    await waitFor(() => expect(undoWorkoutStart).toHaveBeenCalledWith(liveSession.id));
    expect(screen.queryByRole("dialog", { name: "Vil du angre starten av økten?" })).not.toBeInTheDocument();
  });
});

// A finished workout is a record, but it is also the plan a coach reuses next
// week and the one they may have closed too early.
describe("a finished workout", () => {
  const finished = { ...liveSession, status: "completed" as const, startedAt: "2026-09-04T16:30:00.000Z", completedAt: "2026-09-04T18:05:00.000Z" };

  beforeEach(() => {
    reopenSession.mockReset().mockResolvedValue(undefined);
    copySession.mockReset().mockResolvedValue("session-copy");
    mocks.push.mockReset();
    mocks.useGrep.mockReturnValue({ sessions: [finished], teams: demoTeams, undoWorkoutStart, finishWorkout: vi.fn(), reopenSession, copySession });
  });

  it("neither finishes nor undoes the start again", () => {
    render(<WorkoutSession sessionId={finished.id} />);

    expect(screen.queryByRole("button", { name: "Avslutt økten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Angre start" })).not.toBeInTheDocument();
  });

  it("reopens the plan after confirming, and says where it lands", async () => {
    render(<WorkoutSession sessionId={finished.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Gjenåpne økt" }));
    const confirmation = screen.getByRole("dialog", { name: "Vil du gjenåpne økten?" });
    expect(within(confirmation).queryByText(/oppmøte|grupper/i)).not.toBeInTheDocument();
    expect(within(confirmation).getByText(/blir liggende under «Gjennomførte»/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Gjenåpne økt" }));

    await waitFor(() => expect(reopenSession).toHaveBeenCalledWith(finished.id));
    expect(screen.queryByRole("dialog", { name: "Vil du gjenåpne økten?" })).not.toBeInTheDocument();
  });

  it("copies the plan into a dated draft and opens it", async () => {
    render(<WorkoutSession sessionId={finished.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Kopier økt" }));
    const dialog = screen.getByRole("dialog", { name: "Kopier økt" });
    // Prefilled with the source's own name and a date, so copying is one tap.
    expect(within(dialog).getByLabelText("Tittel")).toHaveValue(finished.title);
    expect(within(dialog).getByLabelText("Dato")).not.toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Kopier økt" }));

    await waitFor(() => expect(copySession).toHaveBeenCalledWith(finished.id, { title: finished.title, startsAt: expect.any(String) }));
    expect(mocks.push).toHaveBeenCalledWith("/sessions/session-copy/edit");
  });
});

// Decision 9: the live link and a refresh land before the workspace has loaded.
describe("live session before the workspace has loaded", () => {
  const store = (workspaceLoaded: boolean, extra: Record<string, unknown> = {}) => ({ sessions: [], teams: demoTeams, workspaceLoaded, undoWorkoutStart, finishWorkout: vi.fn(), reopenSession, copySession, ...extra });

  it.each([["setup", LiveSession], ["workout", WorkoutSession]])("%s: says the session is loading, not that it was not found", (_name, Screen) => {
    mocks.useGrep.mockReturnValue(store(false));
    render(<Screen sessionId="missing" />);
    expect(screen.getByRole("status")).toHaveTextContent("Henter økten …");
    expect(screen.queryByText("Økten ble ikke funnet")).not.toBeInTheDocument();
  });

  it.each([["setup", LiveSession], ["workout", WorkoutSession]])("%s: still says a session that does not exist was not found once it has", (_name, Screen) => {
    mocks.useGrep.mockReturnValue(store(true));
    render(<Screen sessionId="missing" />);
    expect(screen.getByText("Økten ble ikke funnet")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// Decision 12: starting a workout is one button. No attendance, no draw.
describe("starting a published session", () => {
  const published = { ...demoSessions[0], status: "published" as const };
  const startWorkout = vi.fn();
  const store = (sessions: unknown[]) => ({ sessions, teams: demoTeams, workspaceLoaded: true, startWorkout, undoWorkoutStart, finishWorkout: vi.fn(), reopenSession, copySession });

  beforeEach(() => { startWorkout.mockReset().mockResolvedValue(undefined); });

  it("is ready to start, with no setup steps and no shortcut past them", () => {
    mocks.useGrep.mockReturnValue(store([published]));
    render(<LiveSession sessionId={published.id} />);

    expect(screen.getByText("Klar til start")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Start økten/ })).toHaveLength(1);
    for (const step of [/Registrer oppmøte/, /Velg trekning/, /Dagens (lag|par)/, /Hopp over/, /Generer grupper/]) {
      expect(screen.queryByText(step)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/oppmøte|spillerlist/i)).not.toBeInTheDocument();
  });

  it("starts the session with one tap", async () => {
    mocks.useGrep.mockReturnValue(store([published]));
    render(<LiveSession sessionId={published.id} />);

    fireEvent.click(screen.getByRole("button", { name: /Start økten/ }));

    await waitFor(() => expect(startWorkout).toHaveBeenCalledWith(published.id));
    expect(startWorkout).toHaveBeenCalledTimes(1);
  });

  it("says why when the server refuses", async () => {
    startWorkout.mockRejectedValue(new Error("Bare en publisert økt kan startes"));
    mocks.useGrep.mockReturnValue(store([published]));
    render(<LiveSession sessionId={published.id} />);

    fireEvent.click(screen.getByRole("button", { name: /Start økten/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bare en publisert økt kan startes");
  });

  it("will not start a draft", () => {
    const draft = { ...published, status: "draft" as const };
    mocks.useGrep.mockReturnValue(store([draft]));
    render(<LiveSession sessionId={draft.id} />);

    expect(screen.getByRole("button", { name: /Start økten/ })).toBeDisabled();
    expect(screen.getByText("Publiser øktplanen før økten startes.")).toBeInTheDocument();
  });
});
