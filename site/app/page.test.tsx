import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("@/components/overview", () => ({ Overview: () => <h1>Klar for neste økt?</h1> }));

describe("home page", () => {
  it("opens Oversikt instead of redirecting to the calendar", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Klar for neste økt?" })).toBeInTheDocument();
  });
});
