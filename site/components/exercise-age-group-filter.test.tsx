import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseAgeGroupFilter, ExerciseAgeGroupPicker } from "./exercise-age-group-filter";

describe("ExerciseAgeGroupFilter", () => {
  it("offers every band plus an unfiltered default", () => {
    render(<ExerciseAgeGroupFilter value="10-12" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Alle aldre" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "10-12 år" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "6-9 år" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "13-15 år" })).toBeInTheDocument();
  });

  it("reports the selected band and the way back to all of them", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupFilter value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "13-15 år" }));
    expect(onChange).toHaveBeenCalledWith("13-15");

    fireEvent.click(screen.getByRole("button", { name: "Alle aldre" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("ExerciseAgeGroupPicker", () => {
  it("adds a band without dropping the ones already chosen", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupPicker value={["13-15"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "6-9 år" }));

    expect(onChange).toHaveBeenCalledWith(["6-9", "13-15"]);
  });

  it("removes a band that is already chosen", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupPicker value={["6-9", "10-12"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "6-9 år" }));

    expect(onChange).toHaveBeenCalledWith(["10-12"]);
  });

  it("shows which bands are chosen", () => {
    render(<ExerciseAgeGroupPicker value={["10-12"]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "10-12 år" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "6-9 år" })).toHaveAttribute("aria-pressed", "false");
  });
});
