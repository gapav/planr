import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { demoTeams, demoUser } from "@/lib/demo-data";
import TeamPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/club-logo-card", () => ({ ClubLogoCard: () => <p>Klubblogo</p> }));
vi.mock("@/components/display-name-card", () => ({ DisplayNameCard: () => <p>Visningsnavn</p> }));
vi.mock("@/components/session-digest-card", () => ({ SessionDigestCard: () => <p>Dagens økt på e-post</p> }));
vi.mock("@/components/team-invitations-card", () => ({ TeamInvitationsCard: () => <button>Inviter trener</button> }));
vi.mock("@/components/help-tip", () => ({ HelpTip: () => null }));
const state = () => ({ currentTeam: demoTeams[0], user: demoUser, teams: demoTeams, invitations: [], workspaceLoaded: true });
const choose = (name: RegExp) => fireEvent.click(within(screen.getByRole("group", { name: "Vis laginformasjon" })).getByRole("button", { name }));

describe("team workspace", () => {
  beforeEach(() => mocks.useGrep.mockReturnValue(state()));
  // Decision 12: Grep holds no player data, so there is no «Spillere» tab and
  // the page opens on the coaches.
  it("opens on «Trenere» and has no «Spillere» tab", () => {
    render(<TeamPage />);
    const tabs = within(screen.getByRole("group", { name: "Vis laginformasjon" }));
    expect(tabs.getByRole("button", { name: /Trenere/ })).toHaveAttribute("aria-pressed", "true");
    expect(tabs.queryByRole("button", { name: /Spillere/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trenerteam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter trener" })).toBeInTheDocument();
  });
  it("says nothing about a roster in its privacy note", () => {
    render(<TeamPage />); choose(/Innstillinger/);
    expect(screen.queryByText(/spillerliste|draktnummer/i)).not.toBeInTheDocument();
  });
  it("does not give team-admin actions to a coach", () => {
    mocks.useGrep.mockReturnValue({ ...state(), currentTeam: { ...demoTeams[0], role: "coach" } });
    render(<TeamPage />); choose(/Trenere/);
    expect(screen.queryByRole("button", { name: "Inviter trener" })).not.toBeInTheDocument();
  });
  it("clearly separates personal email preference from team settings", () => {
    render(<TeamPage />); choose(/Innstillinger/);
    expect(screen.getByText("Dagens økt på e-post")).toBeInTheDocument();
    expect(screen.getByText(/ditt personlige e-postvalg/)).toBeInTheDocument();
    expect(screen.getByText("Visningsnavn")).toBeInTheDocument();
  });
  it("lets a coach without a team set their screen name anyway", () => {
    mocks.useGrep.mockReturnValue({ ...state(), currentTeam: null, teams: [] });
    render(<TeamPage />);
    expect(screen.getByText("Visningsnavn")).toBeInTheDocument();
  });
});
