import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseDetail, sessionItemDetailSubject } from "./exercise-detail";

const reel = "https://www.instagram.com/reel/DaxOEfeMBIP/?stkn=cDgwMmZ5c3duN3g4";

describe("ExerciseDetail", () => {
  it("offers a page it cannot show as a link to open, where the player would be", () => {
    render(<ExerciseDetail exercise={sessionItemDetailSubject({ title: "Tug-of-war", description: "", mediaUrl: reel, thumbnailUrl: null })} onClose={() => undefined} />);
    const link = screen.getByRole("link", { name: /Se videoen på Instagram/ });
    expect(link).toHaveAttribute("href", reel);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Lenke")).toBeInTheDocument();
    expect(screen.queryByText("Åpne mediet i ny fane")).not.toBeInTheDocument();
    // The empty placeholder frame is what the coach saw before, with nothing to press.
    expect(screen.queryByRole("img", { name: "Aktivitet" })).not.toBeInTheDocument();
  });

  it("still shows an image saved as its own thumbnail", () => {
    const url = "https://images.unsplash.com/photo-1?auto=format&w=1000";
    render(<ExerciseDetail exercise={sessionItemDetailSubject({ title: "Kontring", description: "Tre rekker.", mediaUrl: url, thumbnailUrl: url })} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Vis bildet for Kontring" })).toBeInTheDocument();
    expect(screen.getByText("Bilde")).toBeInTheDocument();
  });
});
