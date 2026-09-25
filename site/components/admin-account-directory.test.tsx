import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminAccountDirectory, lastSignInLabel } from "./admin-account-directory";
import { filterAdminAccounts } from "@/lib/admin";
import type { AdminAccount } from "@/lib/types";

const account: AdminAccount = {
  id: "coach-1", email: "coach@example.com", fullName: "Kari Nordmann", initials: "KN", isGlobalAdmin: false,
  createdAt: "2026-09-01T10:00:00Z", lastSignInAt: null, filesOwned: 0,
  memberships: [{ teamId: "team-1", teamName: "Fjordvik HK — Jenter 16", teamRole: "coach" }],
};

describe("admin account directory", () => {
  it("finds accounts by name, email or team", () => {
    expect(filterAdminAccounts([account], "kari")).toHaveLength(1);
    expect(filterAdminAccounts([account], "Jenter 16")).toHaveLength(1);
    expect(filterAdminAccounts([account], "missing")).toHaveLength(0);
  });

  it("distinguishes accounts that have never signed in", () => {
    expect(lastSignInLabel(null)).toBe("Aldri logget inn");
    expect(lastSignInLabel("not-a-date")).toBe("Innloggingstidspunkt ukjent");
  });

  it("renames a coach whose name is still the email stub", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(<AdminAccountDirectory accounts={[account]} loaded currentUserId="owner" onDelete={vi.fn()} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: /Endre visningsnavn for coach@example.com/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Visningsnavn" }), { target: { value: "Kari Nordmann" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre navn" }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith(account.id, "Kari Nordmann"));
  });

  it("requires the exact email address before permanent deletion", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<AdminAccountDirectory accounts={[account]} loaded currentUserId="owner" onDelete={onDelete} onRename={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Slett coach@example.com permanent" }));
    const destructiveButton = screen.getByRole("button", { name: "Slett konto permanent" });
    expect(destructiveButton).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Skriv coach@example.com/ }), { target: { value: "coach@example.com" } });
    expect(destructiveButton).toBeEnabled();
  });
});
