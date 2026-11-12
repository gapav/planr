import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoTeams } from "@/lib/demo-data";
import { ExercisePicker } from "./exercise-picker";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));

const addExerciseItem = vi.fn();
// Anchored on the " — count" a rail row carries, so «Angrep» is not also
// «Angrepsspill i små grupper» once the topic opens.
const railRow = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} —`) });

function renderPicker(onClose = vi.fn()) {
  render(<ExercisePicker open sessionId="session-1" blockId="block-1" blockTitle="Oppvarming" teamId="team-senior" onClose={onClose} />);
  return onClose;
}

describe("ExercisePicker", () => {
  beforeEach(() => {
    addExerciseItem.mockReset().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ exercises: demoExercises, user: null, teams: demoTeams, currentTeam: demoTeams[0], favoriteExerciseIds: [], collections: [], addExerciseItem });
  });
  afterEach(cleanup);

  it("names the bolk the exercises go into", () => {
    renderPicker();
    expect(screen.getByRole("dialog", { name: "Legg til øvelser" })).toHaveTextContent("Til bolken «Oppvarming»");
  });

  // The reason for the redesign: the picker had no way to reach an undertema.
  it("narrows a topic to one of its undertema", () => {
    renderPicker();
    fireEvent.click(railRow("Angrep"));
    expect(screen.getByText("Tålmodig angrep 6 mot 5")).toBeInTheDocument();

    fireEvent.click(railRow("Angrepsspill i små grupper"));
    expect(screen.getByText("Tre rekker i kontring")).toBeInTheDocument();
    expect(screen.queryByText("Tålmodig angrep 6 mot 5")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fjern filteret Angrep › Angrepsspill i små grupper" })).toBeInTheDocument();
  });

  it("keeps the dialog open after adding, and says what was added", async () => {
    const onClose = renderPicker();
    const exercise = demoExercises.find((entry) => entry.name === "Tre rekker i kontring")!;

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Legg Tre rekker i kontring til i bolken" })); });

    expect(addExerciseItem).toHaveBeenCalledWith("session-1", "block-1", exercise);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Legg Tre rekker i kontring til i bolken en gang til" })).toHaveTextContent("Lagt til");
    expect(screen.getByText("1 øvelse lagt til i «Oppvarming»")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ferdig" }));
    expect(onClose).toHaveBeenCalled();
  });

  // A team named by its age opens the picker on that band, as the library does,
  // and the first touch of the age rows hands the choice to the coach.
  it("opens on the band the team's name implies until the coach changes it", () => {
    const team = { ...demoTeams[0], id: "team-g11", name: "Fjordvik HK — Gutter 11", shortName: "Gutter 11" };
    mocks.useGrep.mockReturnValue({ ...mocks.useGrep(), teams: [team], currentTeam: team });
    render(<ExercisePicker open sessionId="session-1" blockId="block-1" blockTitle="Oppvarming" teamId="team-g11" onClose={vi.fn()} />);

    expect(railRow("10-12 år")).toHaveAttribute("aria-pressed", "true");
    expect(railRow("10-12 år")).toHaveAccessibleName(/laget ditt$/);
    const narrowed = screen.getAllByRole("listitem").length;

    fireEvent.click(railRow("Alle aldre"));
    expect(railRow("Alle aldre")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(narrowed);
  });

  // The age reads as on the library card: squares and one range, not a pill per band.
  it("shows each row's age as the library card's squares and range", () => {
    const base = demoExercises[0];
    const exercises = [
      { ...base, id: "ex-split", name: "Delt alder", ageGroups: ["6-9", "13-15"] as const },
      { ...base, id: "ex-all", name: "Alle aldre øvelse", ageGroups: [] as const },
    ].map((entry) => ({ ...entry, ageGroups: [...entry.ageGroups] }));
    mocks.useGrep.mockReturnValue({ ...mocks.useGrep(), exercises });
    renderPicker();

    const ages = (name: string) => screen.getByText(name).closest("li")!.querySelector("[data-card-ages]")!;
    const filled = (name: string) => Array.from(ages(name).querySelectorAll("[data-band]")).map((square) => [square.getAttribute("data-band"), square.getAttribute("data-filled")]);

    expect(ages("Delt alder")).toHaveTextContent("6–9, 13–15 år");
    expect(filled("Delt alder")).toEqual([["6-9", "true"], ["10-12", "false"], ["13-15", "true"]]);
    expect(filled("Alle aldre øvelse")).toEqual([["6-9", "true"], ["10-12", "true"], ["13-15", "true"]]);
    expect(screen.getByText("Delt alder").closest("li")).not.toHaveTextContent("6-9 år");
  });

  // A refused insert is rolled back by the provider; «Lagt til» over it would read as saved.
  it("does not mark an exercise added when saving it fails", async () => {
    addExerciseItem.mockRejectedValue(new Error("refused"));
    renderPicker();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Legg Tre rekker i kontring til i bolken" })); });

    expect(screen.getByRole("button", { name: "Legg Tre rekker i kontring til i bolken" })).toHaveTextContent("Legg til");
    expect(screen.getByText("Velg øvelsene bolken skal ha.")).toBeInTheDocument();
  });
});
