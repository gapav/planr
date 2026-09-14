import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InterestForm } from "./interest-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fillForm() {
  fireEvent.change(screen.getByLabelText("Navnet ditt"), { target: { value: "Ingrid Berg" } });
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "ingrid@example.com" } });
  fireEvent.change(screen.getByLabelText("Klubb / lag"), { target: { value: "Fjordvik IL" } });
}

it("sends the details and only confirms after the server accepts them", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<InterestForm />);
  fillForm();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("button")).toBeDisabled();
  await screen.findByText("Takk for interessen!");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ name: "Ingrid Berg", email: "ingrid@example.com", team: "Fjordvik IL", message: "", website: "" });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("preserves entered details after failure and allows retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Prøv igjen om litt." }) }));
  render(<InterestForm />);
  fillForm();
  fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Prøv igjen om litt.");
  expect(screen.getByLabelText("E-post")).toHaveValue("ingrid@example.com");
  expect(screen.getByRole("button")).toBeEnabled();
  expect(screen.queryByText("Takk for interessen!")).not.toBeInTheDocument();
});

it("blocks duplicate submissions while sending and handles network errors", async () => {
  let reject!: (error: Error) => void;
  const fetcher = vi.fn(() => new Promise((_, rejectRequest) => { reject = rejectRequest; }));
  vi.stubGlobal("fetch", fetcher);
  render(<InterestForm />);
  fillForm();
  fireEvent.submit(screen.getByRole("form"));
  fireEvent.submit(screen.getByRole("form"));
  expect(fetcher).toHaveBeenCalledOnce();
  reject(new TypeError("Failed to fetch"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sjekk forbindelsen"));
});
