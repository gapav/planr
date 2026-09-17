import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShortlistChips, ShortlistMenu } from "./collections";
import { demoCollections, demoTeams, demoUser } from "@/lib/demo-data";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));

function grepState(patch: Record<string, unknown> = {}) {
  return {
    user: demoUser,
    currentTeam: demoTeams[0],
    collections: demoCollections,
    favoriteExerciseIds: ["exercise-1"],
    toggleFavoriteExercise: vi.fn(() => Promise.resolve()),
    toggleCollectionExercise: vi.fn(() => Promise.resolve()),
    createCollection: vi.fn(() => Promise.resolve("collection-new")),
    renameCollection: vi.fn(() => Promise.resolve()),
    deleteCollection: vi.fn(() => Promise.resolve()),
    ...patch,
  };
}

const openMenu = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^(Lagre|${name} er lagret)`) }));

describe("ShortlistMenu", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  // One circle in the corner, not two: the trigger says whether the exercise is
  // kept anywhere, the menu says where.
  it("says whether the exercise is kept, without saying where", () => {
    mocks.useGrep.mockReturnValue(grepState());
    // `exercise-2` is in the demo samling, `exercise-1` is hearted, `exercise-3`
    // is in neither.
    render(<><ShortlistMenu exerciseId="exercise-2" exerciseName="Kant" /><ShortlistMenu exerciseId="exercise-1" exerciseName="Kontring" /><ShortlistMenu exerciseId="exercise-3" exerciseName="Sirkel" /></>);

    expect(screen.getByRole("button", { name: "Kant er lagret. Endre favoritter og samlinger" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kontring er lagret. Endre favoritter og samlinger" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lagre Sirkel i favoritter eller en samling" })).toBeInTheDocument();
  });

  // The heart moved inside the menu when the second circle came off the card,
  // so this is now the only way to favourite from the library.
  it("keeps the private heart as its first row", () => {
    const state = grepState();
    mocks.useGrep.mockReturnValue(state);
    render(<ShortlistMenu exerciseId="exercise-3" exerciseName="Sirkel" />);

    openMenu("Sirkel");
    const favourite = screen.getByRole("menuitemcheckbox", { name: "Favoritter — privat" });
    expect(favourite).toHaveAttribute("aria-checked", "false");

    fireEvent.click(favourite);
    expect(state.toggleFavoriteExercise).toHaveBeenCalledWith("exercise-3");
  });

  it("ticks and unticks a samling without closing", () => {
    const state = grepState();
    mocks.useGrep.mockReturnValue(state);
    render(<ShortlistMenu exerciseId="exercise-1" exerciseName="Kontring" />);

    openMenu("Kontring");
    const entry = screen.getByRole("menuitemcheckbox", { name: demoCollections[0].name });
    expect(entry).toHaveAttribute("aria-checked", "false");

    fireEvent.click(entry);
    expect(state.toggleCollectionExercise).toHaveBeenCalledWith(demoCollections[0].id, "exercise-1");
    // The rows are a set of independent answers, so it stays open for the next.
    expect(screen.getByRole("menuitemcheckbox", { name: demoCollections[0].name })).toBeInTheDocument();
  });

  // Hearts are the coach's own and need no team; samlinger do.
  it("offers the heart alone to a coach between teams", () => {
    mocks.useGrep.mockReturnValue(grepState({ currentTeam: null }));
    render(<ShortlistMenu exerciseId="exercise-3" exerciseName="Sirkel" />);

    openMenu("Sirkel");
    expect(screen.getByRole("menuitemcheckbox", { name: "Favoritter — privat" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ny samling" })).toBeNull();
  });

  // Made from here, the samling is made *for* this exercise.
  it("fills a brand-new samling with the exercise it was started from", async () => {
    const state = grepState();
    mocks.useGrep.mockReturnValue(state);
    render(<ShortlistMenu exerciseId="exercise-1" exerciseName="Kontring" />);

    openMenu("Kontring");
    fireEvent.click(screen.getByRole("menuitem", { name: "Ny samling" }));
    fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "November" } });
    fireEvent.click(screen.getByRole("button", { name: "Lag samling" }));

    await vi.waitFor(() => expect(state.createCollection).toHaveBeenCalledWith("November"));
    await vi.waitFor(() => expect(state.toggleCollectionExercise).toHaveBeenCalledWith("collection-new", "exercise-1"));
  });

  it("refuses a name the team already uses before anything is sent", async () => {
    const state = grepState();
    mocks.useGrep.mockReturnValue(state);
    render(<ShortlistMenu exerciseId="exercise-1" exerciseName="Kontring" />);

    openMenu("Kontring");
    fireEvent.click(screen.getByRole("menuitem", { name: "Ny samling" }));
    fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: demoCollections[0].name.toUpperCase() } });
    fireEvent.click(screen.getByRole("button", { name: "Lag samling" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Laget har allerede en samling med dette navnet.");
    expect(state.createCollection).not.toHaveBeenCalled();
  });

  // The library is readable signed out, and there is nothing to keep it in.
  it("stays away from a signed-out visitor", () => {
    mocks.useGrep.mockReturnValue(grepState({ user: null, currentTeam: null }));
    const { container } = render(<ShortlistMenu exerciseId="exercise-1" exerciseName="Kontring" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ShortlistChips", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("offers favourites and the team's samlinger, one at a time", () => {
    mocks.useGrep.mockReturnValue(grepState());
    const onChange = vi.fn();
    const { rerender } = render(<ShortlistChips value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /^Oktober 2026 fokus/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: "collection", id: demoCollections[0].id });

    rerender(<ShortlistChips value={{ kind: "collection", id: demoCollections[0].id }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Oktober 2026 fokus/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  // Two greyed rows of chips on their own read as a bug, so the row that caused
  // it says whose list is standing and how to put it down.
  it("says which list it is showing once one is chosen", () => {
    mocks.useGrep.mockReturnValue(grepState());
    const { rerender } = render(<ShortlistChips value={null} onChange={vi.fn()} />);

    expect(screen.queryByText(/fjern den for å filtrere/)).toBeNull();

    rerender(<ShortlistChips value={{ kind: "collection", id: demoCollections[0].id }} onChange={vi.fn()} />);
    expect(screen.getByText(/Viser «Oktober 2026 fokus»/)).toBeInTheDocument();
  });

  // The count says the click leads to an empty grid, so the chip stops offering.
  it("stops an empty shortlist chip acting", () => {
    mocks.useGrep.mockReturnValue(grepState({ favoriteExerciseIds: [] }));
    const onChange = vi.fn();
    render(<ShortlistChips value={null} onChange={onChange} />);
    const favourites = screen.getByRole("button", { name: "Favoritter — 0 øvelser" });

    expect(favourites).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(favourites);
    expect(onChange).not.toHaveBeenCalled();
  });

  // A picker nobody has curated for should look exactly as it did before.
  it("is absent for a coach with neither", () => {
    mocks.useGrep.mockReturnValue(grepState({ collections: [], favoriteExerciseIds: [] }));
    const { container } = render(<ShortlistChips value={null} onChange={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
