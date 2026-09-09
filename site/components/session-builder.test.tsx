import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoSessions, demoTeams } from "@/lib/demo-data";
import { SessionBuilder } from "./session-builder";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/hooks/use-session-realtime", () => ({ useSessionRealtime: () => ({ collaborators: [], connected: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const draft = demoSessions[0];
const firstItem = draft.blocks[0].items[0];
const updateItem = vi.fn();

describe("session builder", () => {
  beforeEach(() => {
    updateItem.mockReset();
    mocks.useGrep.mockReturnValue({ sessions: [draft], teams: demoTeams, exercises: demoExercises, user: null, saveState: "saved", isDemoMode: true, reloadSession: vi.fn(), updateItem });
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
});
