import { render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import HandballskolenPage from "./page";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

describe("Håndballskolen", () => {
  it("lists one lesson card that opens Utgruppert forsvar", () => {
    render(<HandballskolenPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Håndballskolen" })).toBeInTheDocument();
    const cards = within(screen.getByRole("list", { name: "Leksjoner" })).getAllByRole("link");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("href", "/handballskolen/utgruppert-forsvar");
    expect(cards[0]).toHaveTextContent("Utgruppert forsvar");
    expect(cards[0]).toHaveTextContent("11 år");
    expect(cards[0]).toHaveTextContent("6 steg");
    expect(cards[0]).toHaveTextContent("3:2 og 2:2:1");
  });
});
