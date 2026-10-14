import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoFocusPeriods, demoSessions, demoTeams } from "@/lib/demo-data";
import { SessionBuilder } from "./session-builder";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), useSessionRealtime: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/hooks/use-session-realtime", () => ({ useSessionRealtime: mocks.useSessionRealtime }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const draft = demoSessions[0];
const firstItem = draft.blocks[0].items[0];
const stations = draft.blocks[1];
const updateItem = vi.fn();
const updateBlock = vi.fn();
const updateSession = vi.fn();

describe("session builder", () => {
  beforeEach(() => {
    updateItem.mockReset();
    updateBlock.mockReset();
    updateSession.mockReset();
    mocks.useSessionRealtime.mockReturnValue({ collaborators: [], connected: true });
    mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, exercises: demoExercises, user: null, saveState: "saved", isDemoMode: true, reloadSession: vi.fn(), updateItem, updateBlock, updateSession });
  });

  // The header is the only thing that tells a coach whether their typing is
  // reaching the database, so a refused save must not read as a saved one.
  describe("save indicator", () => {
    function renderWith(saveState: string, connected = true) {
      mocks.useSessionRealtime.mockReturnValue({ collaborators: [], connected });
      mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, exercises: demoExercises, user: null, saveState, isDemoMode: true, reloadSession: vi.fn(), updateItem, updateBlock, updateSession });
      render(<SessionBuilder sessionId={draft.id} />);
    }

    it("says a refused save was not saved", () => {
      renderWith("error");
      expect(screen.getByText("Siste endring ble ikke lagret")).toBeInTheDocument();
      expect(screen.queryByText("Alle endringer er lagret")).not.toBeInTheDocument();
    });

    // A reconnecting socket says nothing about whether the last write landed,
    // so the refusal still wins.
    it("keeps the refusal visible while the socket reconnects", () => {
      renderWith("error", false);
      expect(screen.getByText("Siste endring ble ikke lagret")).toBeInTheDocument();
    });

    it("reports the other three states as before", () => {
      renderWith("saving");
      expect(screen.getByText("Lagrer…")).toBeInTheDocument();
      cleanup();
      renderWith("offline");
      expect(screen.getByText("Kobler til på nytt …")).toBeInTheDocument();
      cleanup();
      renderWith("saved");
      expect(screen.getByText("Alle endringer er lagret")).toBeInTheDocument();
    });
  });

  it("opens the exercise view for an added item with the plan's own copy of the details", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `Vis ${firstItem.title}` }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: firstItem.title })).toBeInTheDocument();
    expect(within(dialog).getByText(firstItem.description)).toBeInTheDocument();
  });

  it("keeps the focus running on the session's day beside the session objective", () => {
    mocks.useGrep.mockReturnValue({ sessions: [draft], focusPeriods: demoFocusPeriods, teams: demoTeams, exercises: demoExercises, user: null, saveState: "saved", isDemoMode: true, reloadSession: vi.fn(), updateItem, updateBlock, updateSession });
    render(<SessionBuilder sessionId={draft.id} />);

    const focus = screen.getByText("Fokus · Forsvar 6-0").closest("details") as HTMLElement;
    expect(within(focus).getByText(/Forsvar 6-0 med aktiv midtblokk/)).toBeInTheDocument();
    expect(within(focus).getByText("Aktiv midtblokk")).toBeInTheDocument();
    expect(within(focus).getByRole("link", { name: "Se sesongoverblikk" })).toHaveAttribute("href", "/sessions?mode=season&focus=focus-forsvar");
  });

  it("lets a coach tick several of the session team's coaches onto one activity", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    fireEvent.click(screen.getByRole("button", { name: `Ansvarlig trener for ${firstItem.title}: Nora Vik` }));
    const menu = screen.getByRole("menu", { name: `Ansvarlige trenere for ${firstItem.title}` });

    expect(within(menu).getAllByRole("menuitemcheckbox").map((row) => [row.getAttribute("aria-label"), row.getAttribute("aria-checked")]))
      .toEqual([["Gard Pavel", "false"], ["Nora Vik", "true"], ["Sam Østby", "false"]]);

    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Sam Østby" }));
    expect(updateItem).toHaveBeenLastCalledWith(draft.id, firstItem.blockId, firstItem.id, { assignedCoachIds: ["user-nora", "user-sam"] });
    // Ticking a second coach is the point, so the menu waits for it.
    expect(menu).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Nora Vik" }));
    expect(updateItem).toHaveBeenLastCalledWith(draft.id, firstItem.blockId, firstItem.id, { assignedCoachIds: [] });
  });

  it("names every coach on a shared station, and takes them all off at once", () => {
    const shared = stations.items.find((item) => item.assignedCoachIds.length > 1)!;
    render(<SessionBuilder sessionId={draft.id} />);

    const trigger = screen.getByRole("button", { name: `Ansvarlig trener for ${shared.title}: Nora Vik og Sam Østby` });
    expect(trigger).toHaveTextContent("Nora Vik og Sam Østby");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Fjern alle" }));
    expect(updateItem).toHaveBeenCalledWith(draft.id, shared.blockId, shared.id, { assignedCoachIds: [] });
  });

  it("labels the coach picker as an action while nobody is responsible", () => {
    const unassigned = draft.blocks[0].items.find((item) => !item.assignedCoachIds.length)!;
    render(<SessionBuilder sessionId={draft.id} />);

    expect(screen.getByRole("button", { name: `Ansvarlig trener for ${unassigned.title}` })).toHaveTextContent("Sett ansvarlig trener");
    fireEvent.click(screen.getByRole("button", { name: `Ansvarlig trener for ${unassigned.title}` }));
    expect(screen.queryByRole("menuitem", { name: "Fjern alle" })).toBeNull();
  });

  it("closes the coach menu on Escape and hands focus back to the chip", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    const trigger = screen.getByRole("button", { name: `Ansvarlig trener for ${firstItem.title}: Nora Vik` });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: `Ansvarlige trenere for ${firstItem.title}` })).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: `Ansvarlige trenere for ${firstItem.title}` })).toBeNull();
  });

  it("gives a stations block one rotation instead of a duration per station", () => {
    render(<SessionBuilder sessionId={draft.id} />);

    // Every station lasts the block's rotation, so the rows have no minute
    // field of their own — one stepper in the header stands for all of them.
    for (const item of stations.items) {
      expect(screen.queryByRole("spinbutton", { name: `Varighet for ${item.title}` })).not.toBeInTheDocument();
    }
    expect(screen.getByText(`${stations.items.length} stasjoner × 10 min = 40 min`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lengre rotasjon" }));
    expect(updateBlock).toHaveBeenCalledWith(draft.id, stations.id, { rotationMinutes: 11 });

    fireEvent.click(screen.getByRole("button", { name: "Kortere rotasjon" }));
    expect(updateBlock).toHaveBeenCalledWith(draft.id, stations.id, { rotationMinutes: 9 });
  });

  // A one-line note truncated on the card could not hold a station's
  // progression. The words are now written like a focus: name, one sentence,
  // and the stikkord one per line, shown as bullets.
  it("edits a custom activity's name, description and stikkord in a dialog", async () => {
    const custom = draft.blocks[2].items[0];
    render(<SessionBuilder sessionId={draft.id} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Rediger ${custom.title}:`) }));

    const dialog = screen.getByRole("dialog", { name: "Rediger aktivitet" });
    expect(within(dialog).getByRole("textbox", { name: "Navn" })).toHaveValue(custom.title);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Beskrivelse" }), { target: { value: " Skuddstasjon med progresjon. " } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Stikkord/ }), { target: { value: "- Fra gulv\n\nI luft\nEtter mottak, i fart\n" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lagre" }));

    expect(updateItem).toHaveBeenCalledExactlyOnceWith(draft.id, custom.blockId, custom.id, { description: "Skuddstasjon med progresjon.", coachingNotes: "Fra gulv\nI luft\nEtter mottak, i fart" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks only for the stikkord of a library exercise, and shows them as bullets", async () => {
    render(<SessionBuilder sessionId={draft.id} />);
    const card = screen.getByRole("button", { name: new RegExp(`^Rediger ${firstItem.title}:`) });
    expect(within(card).getAllByRole("listitem").map((point) => point.textContent)).toEqual([`•${firstItem.coachingNotes}`]);
    fireEvent.click(card);

    const dialog = screen.getByRole("dialog", { name: firstItem.title });
    expect(within(dialog).queryByRole("textbox", { name: "Navn" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Beskrivelse" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Stikkord/ }), { target: { value: "To baller etter tre minutter\nBytt retning på signal" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lagre" }));

    expect(updateItem).toHaveBeenCalledExactlyOnceWith(draft.id, firstItem.blockId, firstItem.id, { coachingNotes: "To baller etter tre minutter\nBytt retning på signal" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open with the refusal when the save fails", async () => {
    updateItem.mockRejectedValueOnce(new Error("Handlingen kunne ikke fullføres"));
    render(<SessionBuilder sessionId={draft.id} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Rediger ${firstItem.title}:`) }));
    const dialog = screen.getByRole("dialog", { name: firstItem.title });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Stikkord/ }), { target: { value: "Nytt punkt" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lagre" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Handlingen kunne ikke fullføres");
    expect(within(dialog).getByRole("textbox", { name: /^Stikkord/ })).toHaveValue("Nytt punkt");
  });

  it("does not save when nothing changed, and will not save a blank name", () => {
    const custom = draft.blocks[2].items[0];
    render(<SessionBuilder sessionId={draft.id} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Rediger ${custom.title}:`) }));
    const dialog = screen.getByRole("dialog", { name: "Rediger aktivitet" });

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Navn" }), { target: { value: "  " } });
    expect(within(dialog).getByRole("button", { name: "Lagre" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Navn" }), { target: { value: custom.title } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lagre" }));

    expect(updateItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The database refuses a blank title, so renaming «Ny aktivitet» used to
  // report a failure for the instant the field was empty.
  it("never saves a title the coach has cleared on the way to a new one", () => {
    vi.useFakeTimers();
    try {
      const custom = draft.blocks[2].items[0];
      render(<SessionBuilder sessionId={draft.id} />);
      const title = screen.getByRole("textbox", { name: "Tittel på aktiviteten" }) as HTMLInputElement;

      fireEvent.change(title, { target: { value: "  " } });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(updateItem).not.toHaveBeenCalled();

      fireEvent.change(title, { target: { value: "Skudd" } });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(updateItem).toHaveBeenCalledExactlyOnceWith(draft.id, custom.blockId, custom.id, { title: "Skudd" });

      // Walking away from an empty field leaves the saved title standing.
      fireEvent.change(title, { target: { value: "" } });
      fireEvent.blur(title);
      expect(title.value).toBe(custom.title);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the minute field on an ordinary block", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    expect(screen.getByRole("spinbutton", { name: `Varighet for ${firstItem.title}` })).toBeInTheDocument();
  });

  // Saving on every keystroke made an emptied field save — and show — 1, so
  // backspacing «10» to type «8» landed on 18.
  it("lets a coach clear the minutes and type new ones, saving once", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    const minutes = screen.getByRole("spinbutton", { name: `Varighet for ${firstItem.title}` }) as HTMLInputElement;

    fireEvent.change(minutes, { target: { value: "" } });
    expect(minutes.value).toBe("");
    fireEvent.change(minutes, { target: { value: "8" } });
    expect(updateItem).not.toHaveBeenCalled();
    fireEvent.blur(minutes);
    expect(updateItem).toHaveBeenCalledExactlyOnceWith(draft.id, firstItem.blockId, firstItem.id, { durationMinutes: 8 });
  });

  it("clamps the minutes to what the database accepts, and puts back an emptied field", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    const minutes = screen.getByRole("spinbutton", { name: `Varighet for ${firstItem.title}` }) as HTMLInputElement;

    fireEvent.change(minutes, { target: { value: "500" } });
    fireEvent.keyDown(minutes, { key: "Enter" });
    fireEvent.blur(minutes);
    expect(updateItem).toHaveBeenCalledExactlyOnceWith(draft.id, firstItem.blockId, firstItem.id, { durationMinutes: 180 });

    updateItem.mockReset();
    fireEvent.change(minutes, { target: { value: "" } });
    fireEvent.blur(minutes);
    expect(updateItem).not.toHaveBeenCalled();
    expect(minutes.value).toBe(String(firstItem.durationMinutes));
  });

  // The header says «Alle endringer er lagret» while the timer runs, so leaving
  // the page inside that half-second must not lose what was typed.
  it("saves a pending edit when the builder goes away before the pause", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<SessionBuilder sessionId={draft.id} />);
      act(() => { vi.advanceTimersByTime(0); });
      fireEvent.change(screen.getByRole("textbox", { name: "Økttittel" }), { target: { value: "Torsdag - Uke 42" } });
      act(() => { vi.advanceTimersByTime(100); });
      expect(updateSession).not.toHaveBeenCalled();
      unmount();
      expect(updateSession).toHaveBeenCalledExactlyOnceWith(draft.id, { title: "Torsdag - Uke 42" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves once when the field is left before the pause", () => {
    vi.useFakeTimers();
    try {
      render(<SessionBuilder sessionId={draft.id} />);
      act(() => { vi.advanceTimersByTime(0); });
      const title = screen.getByRole("textbox", { name: "Økttittel" });
      fireEvent.change(title, { target: { value: "Torsdag - Uke 42" } });
      fireEvent.blur(title);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(updateSession).toHaveBeenCalledExactlyOnceWith(draft.id, { title: "Torsdag - Uke 42" });
    } finally {
      vi.useRealTimers();
    }
  });
});
