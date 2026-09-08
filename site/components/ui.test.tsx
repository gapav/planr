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

  // The exercise picker and the warm-up dialog both render a preview dialog as a
  // sibling of their own, so two modals are open at once and one click ("legg
  // til", the backdrop, Escape) closes both in the same commit. Saving and
  // restoring `body.overflow` per modal made the second cleanup restore the
  // "hidden" the first one had already handed back, and the page stayed frozen
  // until a reload.
  it("hands scrolling back when two stacked modals close in the same commit", () => {
    function Stack({ open }: { open: boolean }) {
      return <>
        <Modal open={open} title="Legg til fra øvelsesbanken" onClose={vi.fn()}><p>Liste</p></Modal>
        <Modal open={open} title="Pasningsøvelse" onClose={vi.fn()}><p>Detaljer</p></Modal>
      </>;
    }
    const { rerender } = render(<Stack open />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Stack open={false} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the page frozen while a modal under a closing one is still open", () => {
    const { rerender } = render(<>
      <Modal open title="Legg til fra øvelsesbanken" onClose={vi.fn()}><p>Liste</p></Modal>
      <Modal open title="Pasningsøvelse" onClose={vi.fn()}><p>Detaljer</p></Modal>
    </>);

    rerender(<>
      <Modal open title="Legg til fra øvelsesbanken" onClose={vi.fn()}><p>Liste</p></Modal>
      <Modal open={false} title="Pasningsøvelse" onClose={vi.fn()}><p>Detaljer</p></Modal>
    </>);
    expect(document.body.style.overflow).toBe("hidden");
  });
});
