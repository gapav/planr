import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./ui";

describe("Modal", () => {
  it("offers the ways out a phone needs: the close button, the backdrop and Escape", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open title="Dagens lag" onClose={onClose}><p>Lag 1</p></Modal>);

    fireEvent.click(screen.getByRole("button", { name: "Lukk dialogboksen" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(3);

    // A tap that lands inside the dialog must not dismiss it.
    fireEvent.pointerDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<Modal open={false} title="Dagens lag" onClose={onClose}><p>Lag 1</p></Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // jsdom has no layout, so the rule is asserted on the classes: `sticky top-0`
  // will not let an element sit above the scrollport, so a negative top margin
  // on the header is pushed back down by its own size — over the content, which
  // does not move with it. The header bleeds to the top edge by the dialog
  // dropping its own top padding instead.
  it("lets the sticky header bleed to the top edge without covering the content", () => {
    render(<Modal open title="Dagens lag" onClose={vi.fn()}><p>Lag 1</p></Modal>);
    const header = screen.getByRole("heading", { name: "Dagens lag" }).parentElement?.parentElement as HTMLElement;

    expect(header.className).toContain("sticky");
    expect(header.className).toMatch(/(^|\s)-mx-5/);
    expect(header.className).not.toMatch(/-mt-/);
    expect(screen.getByRole("dialog").className).toMatch(/(^|\s)pt-0/);
  });

  it("freezes the page behind it and hands scrolling back on close", () => {
    const { rerender } = render(<Modal open title="Dagens lag" onClose={vi.fn()}><p>Lag 1</p></Modal>);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Modal open={false} title="Dagens lag" onClose={vi.fn()}><p>Lag 1</p></Modal>);
    expect(document.body.style.overflow).toBe("");
  });
});
