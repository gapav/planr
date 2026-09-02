import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseCategoryFilter } from "./exercise-category-filter";

describe("ExerciseCategoryFilter", () => {
  it("gives every category a visual cue and its own palette", () => {
    render(<ExerciseCategoryFilter value="Angrep" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Forsvar" })).toHaveClass("bg-[#eaf5fb]");
    expect(screen.getByRole("button", { name: "Forsvar" })).toHaveTextContent("🛡️");
    expect(screen.getByRole("button", { name: "Angrep" })).toHaveClass("bg-[#c44d24]", "text-white");
    expect(screen.getByRole("button", { name: "Målvakt" })).toHaveClass("bg-[#f5effb]");
    expect(screen.getByRole("button", { name: "Fysisk" })).toHaveClass("bg-[#edf7f0]");
    expect(screen.getByRole("button", { name: "Leker" })).toHaveClass("bg-[#fff7dc]");
  });

  it("reports the selected category", () => {
    const onChange = vi.fn();
    render(<ExerciseCategoryFilter value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Målvakt" }));

    expect(onChange).toHaveBeenCalledWith("Målvakt");
  });
});
