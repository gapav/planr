import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { demoTeams, demoPlayers, demoUser } from "@/lib/demo-data";
import TeamPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/roster-manager", () => ({ RosterManager: ({ players, canManage }: { players: unknown[]; canManage: boolean }) => <p>Roster: {players.length}, manage: {String(canManage)}</p> }));
vi.mock("@/components/club-logo-card", () => ({ ClubLogoCard: () => <p>Klubblogo</p> }));
vi.mock("@/components/session-digest-card", () => ({ SessionDigestCard: () => <p>Dagens økt på e-post</p> }));
vi.mock("@/components/team-invitations-card", () => ({ TeamInvitationsCard: () => <button>Inviter trener</button> }));
vi.mock("@/components/help-tip", () => ({ HelpTip: () => null }));
const state = () => ({ currentTeam: demoTeams[0], user: demoUser, teams: demoTeams, invitations: [], players: demoPlayers, workspaceLoaded: true });
const choose = (name: RegExp) => fireEvent.click(within(screen.getByRole("group", { name: "Vis laginformasjon" })).getByRole("button", { name }));

describe("team workspace", () => {
  beforeEach(() => mocks.useGrep.mockReturnValue(state()));
  it("starts with the selected team's roster", () => {
    mocks.useGrep.mockReturnValue({ ...state(), players: [...demoPlayers, { ...demoPlayers[0], id: "other", teamId: "other" }] });
    render(<TeamPage />);
    expect(screen.getByText("Roster: 12, manage: true")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inviter trener" })).not.toBeInTheDocument();
  });
  it("shows coaches and invitations in their own view", () => {
    render(<TeamPage />); choose(/Trenere/);
    expect(screen.getByRole("heading", { name: "Trenerteam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter trener" })).toBeInTheDocument();
    expect(screen.queryByText(/Roster:/)).not.toBeInTheDocument();
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
  });
});
