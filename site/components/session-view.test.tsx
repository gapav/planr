import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import type { PlannedSession } from "@/lib/types";
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

// Decision 9: the morning email's link lands before the workspace has loaded.
describe("session view before the workspace has loaded", () => {
  const store = (workspaceLoaded: boolean) => ({ sessions: [], adminSessions: [], teams: [], user: null, isDemoMode: true, workspaceLoaded, reloadSession: vi.fn() });

  it("says the session is loading, not that it was not found", () => {
    mocks.useGrep.mockReturnValue(store(false));
    render(<SessionView sessionId="missing" />);
    expect(screen.getByRole("status")).toHaveTextContent("Henter økten …");
    expect(screen.queryByText("Økten ble ikke funnet")).not.toBeInTheDocument();
  });

  it("still says a session that does not exist was not found once it has", () => {
    mocks.useGrep.mockReturnValue(store(true));
    render(<SessionView sessionId="missing" />);
    expect(screen.getByText("Økten ble ikke funnet")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// «Foreslå alternativ» (decision 14, issue #52).
describe("suggestions on a plan's card", () => {
  const [nora, sam] = [demoTeams[0].members[1], demoTeams[0].members[2]];
  const [kontring, , , , , patient] = demoExercises;
  const twoSuggestions = [
    { id: "s-nora", itemId: firstItem.id, exerciseId: patient.id, suggestedBy: nora.id, comment: "Mindre kø, flere ballberøringer", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", exercise: patient },
    { id: "s-sam", itemId: firstItem.id, exerciseId: kontring.id, suggestedBy: sam.id, comment: "Mer fart fra start", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z", exercise: kontring },
  ];
  function withSuggestions(status: PlannedSession["status"], suggestions = twoSuggestions): PlannedSession {
    return { ...draft, status, blocks: draft.blocks.map((block, index) => index === 0 ? { ...block, items: block.items.map((item, itemIndex) => itemIndex === 0 ? { ...item, suggestions } : { ...item, suggestions: [] }) } : { ...block, items: block.items.map((item) => ({ ...item, suggestions: [] })) }) };
  }
  const suggestAlternative = vi.fn();
  const acceptSuggestion = vi.fn();
  const dismissSuggestion = vi.fn();
  function renderView(session: PlannedSession, user = demoUser) {
    mocks.useGrep.mockReturnValue({ sessions: [session], adminSessions: [], teams: demoTeams, currentTeam: demoTeams[0], exercises: demoExercises, exercisesLoaded: true, collections: [], favoriteExerciseIds: [], user, isDemoMode: true, reloadSession: vi.fn(), suggestAlternative, acceptSuggestion, dismissSuggestion });
    return render(<SessionView sessionId={session.id} />);
  }
  beforeEach(() => {
    suggestAlternative.mockReset().mockResolvedValue(undefined);
    acceptSuggestion.mockReset().mockResolvedValue(undefined);
    dismissSuggestion.mockReset().mockResolvedValue(undefined);
  });

  it("offers «Foreslå alternativ» on each exercise of a draft or published plan", () => {
    for (const status of ["draft", "published"] as const) {
      renderView(withSuggestions(status, []));
      const exerciseItems = draft.blocks.flatMap((block) => block.items).filter((item) => item.kind === "exercise");
      expect(screen.getAllByRole("button", { name: /^Foreslå alternativ til / })).toHaveLength(exerciseItems.length);
      expect(screen.queryByRole("button", { name: "Foreslå alternativ til 6 mot 6 med betingelser" })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("offers nothing on a plan that has been started or finished", () => {
    for (const status of ["in_progress", "completed"] as const) {
      renderView(withSuggestions(status));
      expect(screen.queryByRole("button", { name: /^Foreslå alternativ/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Bytt/ })).not.toBeInTheDocument();
      expect(screen.getByText("2 forslag")).toBeInTheDocument();
      cleanup();
    }
  });

  it("shows how many suggestions there are, and each one's exercise, coach and comment", () => {
    renderView(withSuggestions("published"));
    expect(screen.getByText("2 forslag")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: `Forslag til ${firstItem.title}` });
    expect(within(list).getByRole("button", { name: patient.name })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: kontring.name })).toBeInTheDocument();
    expect(within(list).getByText("Foreslått av Nora Vik")).toBeInTheDocument();
    expect(within(list).getByText("Foreslått av Sam Østby")).toBeInTheDocument();
    expect(within(list).getByText("«Mindre kø, flere ballberøringer»")).toBeInTheDocument();
    expect(within(list).getByText("«Mer fart fra start»")).toBeInTheDocument();
  });

  it("opens the suggested exercise", () => {
    renderView(withSuggestions("published"));
    fireEvent.click(screen.getByRole("button", { name: patient.name }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: patient.name })).toBeInTheDocument();
  });

  it("swaps with «Bytt» and dismisses with «Avvis»", () => {
    renderView(withSuggestions("published"));
    fireEvent.click(screen.getByRole("button", { name: `Bytt til ${patient.name}` }));
    expect(acceptSuggestion).toHaveBeenCalledWith(draft.id, "s-nora");
    fireEvent.click(screen.getByRole("button", { name: "Avvis forslaget fra Sam Østby" }));
    expect(dismissSuggestion).toHaveBeenCalledWith(draft.id, "s-sam");
    expect(screen.queryByRole("button", { name: /Trekk tilbake/ })).not.toBeInTheDocument();
  });

  it("lets the suggester withdraw their own instead of dismissing it", () => {
    renderView(withSuggestions("draft"), { ...nora, color: nora.color });
    expect(screen.queryByRole("button", { name: "Avvis forslaget fra Nora Vik" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trekk tilbake forslaget ditt" }));
    expect(dismissSuggestion).toHaveBeenCalledWith(draft.id, "s-nora");
  });

  it("suggests one exercise from the library with a comment", async () => {
    renderView(withSuggestions("draft", []));
    fireEvent.click(screen.getByRole("button", { name: `Foreslå alternativ til ${firstItem.title}` }));
    const dialog = screen.getByRole("dialog", { name: "Foreslå alternativ" });
    // The exercise the activity already has is not offered.
    expect(within(dialog).queryByRole("button", { name: `Velg ${firstItem.title}` })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Foreslå" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: `Velg ${patient.name}` }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Kommentar \(valgfritt\)/ }), { target: { value: "Mindre kø" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Foreslå" }));
    await waitFor(() => expect(suggestAlternative).toHaveBeenCalledWith(draft.id, firstItem.id, expect.objectContaining({ id: patient.id }), "Mindre kø"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Foreslå alternativ" })).not.toBeInTheDocument());
  });

  it("shows a global admin the suggestions on another team's plan, with nothing to do about them", () => {
    const session = withSuggestions("published");
    mocks.useGrep.mockReturnValue({ sessions: [], adminSessions: [session], teams: [], adminTeams: demoTeams.map((team) => ({ ...team, invitations: [] })), exercises: demoExercises, user: demoUser, isDemoMode: true, reloadSession: vi.fn() });
    render(<SessionView sessionId={session.id} readOnly />);
    expect(screen.getByText("2 forslag")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Foreslå alternativ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bytt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Avvis/ })).not.toBeInTheDocument();
  });
});
