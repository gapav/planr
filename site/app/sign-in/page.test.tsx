import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  requestMagicLink: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@/components/app-provider", () => ({
  useGrep: () => ({
    isDemoMode: false,
    requestMagicLink: mocks.requestMagicLink,
    signIn: mocks.signIn,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("next=/today"),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

describe("localhost sign in", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.requestMagicLink.mockReset();
    mocks.signIn.mockReset();
  });

  it("offers the existing password flow and keeps the requested destination", async () => {
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: "Bruk passord på localhost" }));
    fireEvent.change(screen.getByLabelText("E-postadresse"), { target: { value: " Coach@Example.com " } });
    fireEvent.change(screen.getByLabelText("Passord"), { target: { value: "local-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Logg inn lokalt" }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("coach@example.com", "local-password"));
    expect(mocks.requestMagicLink).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/today");
  });
});
