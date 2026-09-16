import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoSessions, demoTeams } from "@/lib/demo-data";
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

describe("session builder", () => {
  beforeEach(() => {
    updateItem.mockReset();
    updateBlock.mockReset();
    mocks.useSessionRealtime.mockReturnValue({ collaborators: [], connected: true });
    mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, exercises: demoExercises, user: null, saveState: "saved", isDemoMode: true, reloadSession: vi.fn(), updateItem, updateBlock });
  });

  // The header is the only thing that tells a coach whether their typing is
  // reaching the database, so a refused save must not read as a saved one.
  describe("save indicator", () => {
    function renderWith(saveState: string, connected = true) {
      mocks.useSessionRealtime.mockReturnValue({ collaborators: [], connected });
      mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, exercises: demoExercises, user: null, saveState, isDemoMode: true, reloadSession: vi.fn(), updateItem, updateBlock });
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

  it("offers the session team's coaches as the one responsible for an activity", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    const picker = screen.getByRole("combobox", { name: `Ansvarlig trener for ${firstItem.title}` }) as HTMLSelectElement;

    expect(picker.value).toBe(firstItem.assignedCoachId);
    expect(within(picker).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["Ingen ansvarlig trener", "Gard Pavel", "Nora Vik", "Sam Østby"]);

    fireEvent.change(picker, { target: { value: "user-sam" } });
    expect(updateItem).toHaveBeenCalledWith(draft.id, firstItem.blockId, firstItem.id, { assignedCoachId: "user-sam" });

    fireEvent.change(picker, { target: { value: "" } });
    expect(updateItem).toHaveBeenCalledWith(draft.id, firstItem.blockId, firstItem.id, { assignedCoachId: null });
  });

  it("labels the coach picker as an action while nobody is responsible", () => {
    const unassigned = draft.blocks[0].items.find((item) => !item.assignedCoachId)!;
    render(<SessionBuilder sessionId={draft.id} />);

    const assignedChip = screen.getByRole("combobox", { name: `Ansvarlig trener for ${firstItem.title}` }).parentElement!;
    expect(assignedChip).toHaveTextContent("Nora Vik");

    const emptyChip = screen.getByRole("combobox", { name: `Ansvarlig trener for ${unassigned.title}` }).parentElement!;
    expect(emptyChip).toHaveTextContent("Sett ansvarlig trener");
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

  it("keeps the minute field on an ordinary block", () => {
    render(<SessionBuilder sessionId={draft.id} />);
    expect(screen.getByRole("spinbutton", { name: `Varighet for ${firstItem.title}` })).toBeInTheDocument();
  });
});
