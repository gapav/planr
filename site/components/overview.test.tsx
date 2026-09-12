import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { Overview } from "./overview";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn(), createSession: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
const state = () => ({ user: demoUser, currentTeam: demoTeams[0], sessions: demoSessions, workspaceLoaded: true, createSession: mocks.createSession });

describe("Oversikt", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.useGrep.mockReturnValue(state()); });
  it("creates a real draft and opens the editor", async () => {
    mocks.createSession.mockResolvedValue("new-plan"); render(<Overview />);
    fireEvent.click(screen.getByRole("button", { name: "Planlegg økt" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/sessions/new-plan/edit"));
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
  it("shows creation failure and allows retry", async () => {
    mocks.createSession.mockRejectedValue(new Error("offline")); render(<Overview />);
    fireEvent.click(screen.getByRole("button", { name: "Planlegg økt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prøv igjen");
    expect(screen.getByRole("button", { name: "Planlegg økt" })).toBeEnabled();
  });
  it("links history to the completed view", () => {
    render(<Overview />);
    expect(screen.getByRole("link", { name: /Tidligere økter/ })).toHaveAttribute("href", "/sessions?view=past");
  });
  it("does not show a false empty state while loading", () => {
    mocks.useGrep.mockReturnValue({ ...state(), workspaceLoaded: false }); render(<Overview />);
    expect(screen.getByRole("status")).toHaveTextContent("Henter lagets økter");
    expect(screen.queryByText("Plass til en god økt.")).not.toBeInTheDocument();
  });
  it("prevents planning without a team", () => {
    mocks.useGrep.mockReturnValue({ ...state(), currentTeam: null }); render(<Overview />);
    expect(screen.getByRole("button", { name: "Planlegg økt" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Administrer lag/ })).toHaveAttribute("href", "/admin");
  });
});
