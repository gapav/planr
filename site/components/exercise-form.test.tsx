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

const linkField = () => screen.queryByLabelText("Lenke til bilde eller video");
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
