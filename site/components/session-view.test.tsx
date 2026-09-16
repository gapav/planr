import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessions, demoTeams } from "@/lib/demo-data";
import { SessionView } from "./session-view";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/hooks/use-session-realtime", () => ({ useSessionRealtime: () => ({ collaborators: [], connected: true }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const draft = demoSessions[0];
const firstItem = draft.blocks[0].items[0];

describe("session view", () => {
  beforeEach(() => {
    mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, user: null, isDemoMode: true, reloadSession: vi.fn() });
  });

  it("reads the plan out without a single editable field", () => {
    render(<SessionView sessionId={draft.id} />);

    expect(screen.getByRole("heading", { level: 1, name: draft.title })).toBeInTheDocument();
    expect(screen.getByText(draft.blocks[0].title)).toBeInTheDocument();
    expect(screen.getByText(firstItem.title)).toBeInTheDocument();
    expect(document.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });

  it("points at the builder for the coach who did come here to change something", () => {
    render(<SessionView sessionId={draft.id} />);

    expect(screen.getByRole("link", { name: "Rediger" })).toHaveAttribute("href", `/sessions/${draft.id}/edit`);
  });

  it("reads a block's note as its own paragraph, not as a run-on after the label", () => {
    render(<SessionView sessionId={draft.id} />);

    // Found by its exact text: the label is a sibling, so the note is no longer
    // glued to «Notat for bolken» inside one line of prose.
    expect(screen.getByText(draft.blocks[0].notes)).toBeInTheDocument();
    expect(screen.getAllByText("Notat for bolken")).toHaveLength(draft.blocks.filter((block) => block.notes).length);
  });

  it("prints the plan for whoever is running it without an account", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<SessionView sessionId={draft.id} />);

    fireEvent.click(screen.getByRole("button", { name: `Flere valg for ${draft.title}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Skriv ut" }));

    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("keeps the action bar off the paper — the plan below carries the title", () => {
    render(<SessionView sessionId={draft.id} />);

    // The stylesheet hides `[data-print="hide"]`; this is the markup half of
    // that pair, which jsdom cannot check by asking for computed styles.
    const bar = document.querySelector('[data-print="hide"]');
    expect(bar).toBeInTheDocument();
    expect(within(bar as HTMLElement).getByRole("link", { name: "Rediger" })).toBeInTheDocument();
  });

  it("opens an activity with the plan's own copy of the details", () => {
    render(<SessionView sessionId={draft.id} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `Vis ${firstItem.title}` }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: firstItem.title })).toBeInTheDocument();
    expect(within(dialog).getByText(firstItem.description)).toBeInTheDocument();
  });
});
