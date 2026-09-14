import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrepIntroduction } from "./introduction";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Grep screenshot introduction", () => {
  it("presents real screenshots and a separate interest path without a simulated app", () => {
    render(<GrepIntroduction />);
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(screen.getByRole("heading", { name: /En god idé/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Planen i lomma/ })).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Meld interesse" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Prøv Grep med laget ditt" })).toHaveAttribute("href", "#interesse");
    expect(screen.getByRole("img", { name: /Grep Oversikt/ }).getAttribute("src")).toContain("overview-current-demo.png");
    expect(screen.getByRole("link", { name: /Bli kjent/ })).toHaveAttribute("href", "#slik-fungerer-det");
  });
  it("keeps content visible and skips reveal observers with reduced motion", () => {
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", vi.fn(function () { return { observe }; }));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<GrepIntroduction />);
    expect(observe).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Planen i lomma/ })).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(6);
  });
  it("leaves the reveal to CSS where scroll timelines exist, and observes where they do not", () => {
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", vi.fn(function () { return { observe, unobserve: vi.fn(), disconnect: vi.fn() }; }));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("CSS", { supports: () => true });
    render(<GrepIntroduction />);
    expect(observe).not.toHaveBeenCalled();
    cleanup();
    vi.stubGlobal("CSS", { supports: () => false });
    render(<GrepIntroduction />);
    expect(observe).toHaveBeenCalled();
  });
  it("shows the real morning digest markup in a labelled preview frame", () => {
    render(<GrepIntroduction />);
    expect(screen.getByRole("heading", { name: /Planen ligger klar/ })).toBeVisible();
    const frame: HTMLIFrameElement = screen.getByTitle(/Dagens økt/);
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("srcdoc")).toContain("Tirsdag — kontring og press");
    expect(frame.getAttribute("srcdoc")).toContain("Du har ansvar");
    expect(screen.getByText(/Fiktivt lag og fiktiv økt/)).toBeVisible();
    const digest = screen.getByRole("img", { name: /Dagens økt på e-post/ });
    expect(within(digest).getByText("Dagens økt på e-post")).toBeVisible();
    expect(within(digest).getByText("På")).toBeVisible();
    expect(within(digest).getByText("Av")).toBeVisible();
  });
  it("identifies the edited exercise library as illustrative rather than actual inventory", () => {
    render(<GrepIntroduction />);
    const image = screen.getByRole("img", { name: /Eksempelvisning av Greps øvelsesbank/ });
    expect(image.getAttribute("src")).toContain("exercises-illustrative-v2.png");
    expect(image).toHaveAttribute("width", "1419");
    expect(image).toHaveAttribute("height", "1109");
    expect(screen.getByText(/Eksempelvisning med illustrative øvelser og antall/)).toBeVisible();
  });
});
