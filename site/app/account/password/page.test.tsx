import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoUser } from "@/lib/demo-data";
import ChangePasswordPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), replace: vi.fn(), search: new URLSearchParams() }));

vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => mocks.search }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

function submit(password: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: password } });
  fireEvent.submit(screen.getByRole("button", { name: "Save password" }));
}

describe("forced password change", () => {
  beforeEach(() => { mocks.useGrep.mockReset(); mocks.replace.mockReset(); mocks.search = new URLSearchParams("next=%2Finvite%2Fabc"); });

  it("takes a coach on to their invitation once the password is saved", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ user: { ...demoUser, mustSetPassword: true }, authLoading: false, setPassword });

    render(<ChangePasswordPage />);
    expect(screen.getByRole("heading", { name: "Choose your password" })).toBeInTheDocument();
    submit("correct horse battery");

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/invite/abc"));
    expect(setPassword).toHaveBeenCalledWith("correct horse battery");
  });

  it("surfaces why the save failed instead of navigating away", async () => {
    mocks.useGrep.mockReturnValue({ user: { ...demoUser, mustSetPassword: true }, authLoading: false, setPassword: vi.fn().mockRejectedValue(new Error("Your sign-in expired.")) });

    render(<ChangePasswordPage />);
    submit("correct horse battery");

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in expired.");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  // A dropped session is what the failure above usually means, and the provider
  // clears the local user when it finds one. Keep the invitation in `next` so
  // signing back in resumes where the coach left off.
  it("sends a coach whose session has gone back to sign in, keeping the invitation", () => {
    mocks.useGrep.mockReturnValue({ user: null, authLoading: false, setPassword: vi.fn() });

    render(<ChangePasswordPage />);

    expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2Finvite%2Fabc");
  });
});
