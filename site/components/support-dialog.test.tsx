import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoUser } from "@/lib/demo-data";
import { SupportDialog } from "./support-dialog";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));

describe("support dialog", () => {
  let sendSupportMessage: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sendSupportMessage = vi.fn().mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/sessions/abc");
    mocks.useGrep.mockReturnValue({ user: demoUser, sendSupportMessage });
  });

  it("sends the message with the page it was opened on and confirms", async () => {
    render(<SupportDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kalenderen er tom" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(sendSupportMessage).toHaveBeenCalledWith("Kalenderen er tom", "/sessions/abc"));
    expect(await screen.findByRole("status")).toHaveTextContent(demoUser.email);
  });

  it("refuses a near-empty message without calling the provider", () => {
    render(<SupportDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hei" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(sendSupportMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps the text and shows the error when sending fails", async () => {
    sendSupportMessage.mockRejectedValueOnce(new Error("Vi fikk ikke sendt meldingen akkurat nå."));
    render(<SupportDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kalenderen er tom" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ikke sendt");
    expect(screen.getByRole("textbox")).toHaveValue("Kalenderen er tom");
  });
});
