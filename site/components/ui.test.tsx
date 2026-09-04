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

  it("freezes the page behind it and hands scrolling back on close", () => {
    const { rerender } = render(<Modal open title="Dagens lag" onClose={vi.fn()}><p>Lag 1</p></Modal>);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Modal open={false} title="Dagens lag" onClose={vi.fn()}><p>Lag 1</p></Modal>);
    expect(document.body.style.overflow).toBe("");
  });
});
