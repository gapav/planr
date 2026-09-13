import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoUser } from "@/lib/demo-data";
import { DisplayNameCard } from "./display-name-card";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));

const field = () => screen.getByRole("textbox");
const saveButton = () => screen.getByRole("button", { name: /Lagre navn/ });

describe("display name card", () => {
  let setDisplayName: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setDisplayName = vi.fn().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ user: demoUser, setDisplayName });
  });

  it("starts on the stored name and cannot save it unchanged", () => {
    render(<DisplayNameCard />);
    expect(field()).toHaveValue(demoUser.fullName);
    expect(saveButton()).toBeDisabled();
  });

  it("saves the new name", async () => {
    render(<DisplayNameCard />);
    fireEvent.change(field(), { target: { value: "  Kari   Nordmann " } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(setDisplayName).toHaveBeenCalledWith("  Kari   Nordmann "));
    expect(field()).toHaveValue("Kari Nordmann");
  });

  it("refuses a too-short name without calling the provider", () => {
    render(<DisplayNameCard />);
    fireEvent.change(field(), { target: { value: "K" } });
    fireEvent.click(saveButton());
    expect(setDisplayName).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("minst to tegn");
  });

  it("reports a failed save and keeps what was typed", async () => {
    setDisplayName.mockRejectedValue(new Error("Ingen nett"));
    render(<DisplayNameCard />);
    fireEvent.change(field(), { target: { value: "Kari Nordmann" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ingen nett"));
    expect(field()).toHaveValue("Kari Nordmann");
  });

  it("shows the signed-in email as the unchanged login", () => {
    render(<DisplayNameCard />);
    expect(screen.getByText(new RegExp(demoUser.email))).toBeInTheDocument();
  });
});
