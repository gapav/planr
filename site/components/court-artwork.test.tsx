import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtArtwork } from "./court-artwork";

describe("CourtArtwork", () => {
  it("preserves the angled reference frame without non-uniform stretching", () => {
    const { container } = render(<CourtArtwork />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 664 450");
    const paths = container.querySelectorAll("g[stroke] path");
    expect(paths).toHaveLength(3);
    expect(paths[0]).toHaveAttribute("d", "M-12 103 C98 137 242 211 307 291 C340 331 351 392 338 462");
    expect(paths[1]).toHaveAttribute("stroke-dasharray", "15 21");
    expect(container.querySelector("g")).toHaveAttribute("transform", "translate(664 0) scale(-1 1)");
    expect(container.querySelector('path[fill="var(--grep-apricot)"]')).toHaveAttribute("d", "M-12 103 C98 137 242 211 307 291 C340 331 351 392 338 462 L-12 462Z");
  });
});
