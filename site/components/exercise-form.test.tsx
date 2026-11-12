import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseForm } from "./exercise-form";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));

function open() {
  const store = { addExercise: vi.fn().mockResolvedValue(undefined), updateExercise: vi.fn(), uploadExerciseMedia: vi.fn(), discardExerciseMedia: vi.fn() };
  mocks.useGrep.mockReturnValue(store);
  render(<ExerciseForm open onClose={() => undefined} />);
  fireEvent.change(screen.getByLabelText("Navn på øvelsen"), { target: { value: "Tre rekker" } });
  fireEvent.change(screen.getByLabelText(/Beskrivelse/), { target: { value: "Spillerne jobber i tre rekker." } });
  return store;
}

const linkField = () => screen.queryByLabelText("Lenke til bilde, video eller innlegg");
const uploadField = () => screen.queryByLabelText("Last opp et bilde eller en MP4-video");
const tab = (name: RegExp) => screen.getByRole("button", { name });

describe("ExerciseForm media source", () => {
  it("offers the link and the upload as one choice, starting on the recommended link", () => {
    open();
    expect(tab(/Lim inn lenke/)).toHaveAttribute("aria-pressed", "true");
    expect(tab(/Last opp fil/)).toHaveAttribute("aria-pressed", "false");
    expect(linkField()).toBeInTheDocument();
    expect(uploadField()).not.toBeInTheDocument();
  });

  it("swaps one input for the other, and only warns about rights where a file is uploaded", () => {
    open();
    expect(screen.queryByText(/Last bare opp bilder og video/)).not.toBeInTheDocument();
    fireEvent.click(tab(/Last opp fil/));
    expect(linkField()).not.toBeInTheDocument();
    expect(uploadField()).toBeInTheDocument();
    expect(screen.getByText(/Last bare opp bilder og video/)).toBeInTheDocument();
  });

  it("saves the link the coach can see, not one left behind on the hidden tab", async () => {
    const store = open();
    fireEvent.change(linkField()!, { target: { value: "https://vimeo.com/123" } });
    fireEvent.click(tab(/Last opp fil/));
    fireEvent.click(screen.getByRole("button", { name: "Legg til i øvelsesbanken" }));
    await vi.waitFor(() => expect(store.addExercise).toHaveBeenCalled());
    expect(store.addExercise.mock.calls[0][0]).toMatchObject({ mediaUrl: null });
    expect(store.uploadExerciseMedia).not.toHaveBeenCalled();
  });

  it("swaps the inputs without React reusing the url field as the file field", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    open();
    fireEvent.click(tab(/Last opp fil/));
    fireEvent.click(tab(/Lim inn lenke/));
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps a typed link while the coach looks at the upload tab", () => {
    open();
    fireEvent.change(linkField()!, { target: { value: "https://vimeo.com/123" } });
    fireEvent.click(tab(/Last opp fil/));
    fireEvent.click(tab(/Lim inn lenke/));
    expect(linkField()).toHaveValue("https://vimeo.com/123");
  });
});

describe("ExerciseForm undertema", () => {
  const subtopic = (name: string) => screen.getByRole("button", { name });
  const offered = () => [...screen.getByRole("group", { name: "Undertema" }).querySelectorAll("button")].map((button) => button.textContent);
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Legg til i øvelsesbanken" }));

  it("offers only the chosen topic's subtopics", () => {
    open();
    expect(screen.getByLabelText("Kategori")).toHaveValue("Forsvar");
    expect(offered()).toEqual(["Teknikk", "Forsvarsspill 1 mot 1", "Forsvarsspill i små grupper"]);
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Leker" } });
    expect(offered()).toEqual(["Oppvarmingsleker", "Ballspill"]);
  });

  it("saves several subtopics from the topic", async () => {
    const store = open();
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Angrep" } });
    fireEvent.click(subtopic("Finter"));
    fireEvent.click(subtopic("Teknikk"));
    expect(subtopic("Finter")).toHaveAttribute("aria-pressed", "true");
    save();
    await vi.waitFor(() => expect(store.addExercise).toHaveBeenCalled());
    expect(store.addExercise.mock.calls[0][0]).toMatchObject({ category: "Angrep", subtopics: ["angrep.ballbehandling", "angrep.finter"] });
  });

  it("drops the subtopics that no longer belong when the topic changes", async () => {
    const store = open();
    fireEvent.click(subtopic("Teknikk"));
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Målvakt" } });
    // Målvakt has a Teknikk of its own, and it is not the one chosen.
    expect(subtopic("Teknikk")).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Forsvar" } });
    expect(subtopic("Teknikk")).toHaveAttribute("aria-pressed", "false");
    save();
    await vi.waitFor(() => expect(store.addExercise).toHaveBeenCalled());
    expect(store.addExercise.mock.calls[0][0]).toMatchObject({ category: "Forsvar", subtopics: [] });
  });

  it("allows saving with no subtopic", async () => {
    const store = open();
    save();
    await vi.waitFor(() => expect(store.addExercise).toHaveBeenCalled());
    expect(store.addExercise.mock.calls[0][0]).toMatchObject({ subtopics: [] });
  });

  it("opens an existing exercise on its own subtopics", async () => {
    const updateExercise = vi.fn().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ addExercise: vi.fn(), updateExercise, uploadExerciseMedia: vi.fn(), discardExerciseMedia: vi.fn() });
    const exercise = { id: "e1", name: "Finteløype", description: "Finter mot passiv forsvarer.", category: "Angrep", ageGroups: [], subtopics: ["angrep.finter"], mediaUrl: null, mediaKind: null, thumbnailUrl: null, createdBy: "u", createdByName: "U", archivedAt: null, createdAt: "", updatedAt: "" } as const;
    render(<ExerciseForm open exercise={{ ...exercise, ageGroups: [], subtopics: [...exercise.subtopics] }} onClose={() => undefined} />);
    expect(subtopic("Finter")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(subtopic("Kast og mottak"));
    fireEvent.click(screen.getByRole("button", { name: "Lagre endringer" }));
    await vi.waitFor(() => expect(updateExercise).toHaveBeenCalled());
    expect(updateExercise.mock.calls[0][1]).toMatchObject({ subtopics: ["angrep.kast-og-mottak", "angrep.finter"] });
  });
});
