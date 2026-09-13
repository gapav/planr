import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FixtureImport } from "./fixture-import";

const mocks = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: () => ({
  importFixtures: mocks.save, currentTeam: { id: "ours" },
  fixtures: [{ teamId: "ours", updatedAt: "2026-09-01", ourTeamColors: { "Fjordvik Blå": "lilac" } },
    { teamId: "other", updatedAt: "2026-09-13", ourTeamColors: { "Fjordvik Blå": "rose" } }],
}) }));
vi.mock("read-excel-file/browser", () => ({ readSheet: async () => [
  ["Dato", "Tid", "Kampnr", "Hjemmelag", "Bortelag", "Bane"],
  ["19.09.2026", "11:00", "1234", "Fjordvik Blå", "Ski Gul", "Hallen"],
] }));

beforeEach(() => { mocks.save.mockReset().mockResolvedValue({ added: 1, updated: 0 }); mocks.close.mockReset(); });
async function openColours() {
  const { container } = render(<FixtureImport open onClose={mocks.close} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], "schedule.xlsx")] } });
  fireEvent.click(await screen.findByRole("checkbox", { name: /Fjordvik Blå/ }));
  fireEvent.click(screen.getByRole("button", { name: "Neste: lagfarger" }));
}
it("selects a team before colours, restores only this workspace's choice, and imports it", async () => {
  await openColours();
  const group = screen.getByRole("group", { name: "Fjordvik Blå" });
  expect(within(group).getByRole("radio", { name: "Syrin" })).toBeChecked();
  fireEvent.click(within(group).getByRole("radio", { name: "Aprikos" }));
  fireEvent.click(screen.getByRole("button", { name: "Tilbake" }));
  fireEvent.click(screen.getByRole("button", { name: "Neste: lagfarger" }));
  expect(screen.getByRole("radio", { name: "Aprikos" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Importer 1 kamp" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0][0]).toMatchObject({ ourTeams: ["Fjordvik Blå"], ourTeamColors: { "Fjordvik Blå": "apricot" } });
});
it("keeps the colour choice and displays an import failure without closing", async () => {
  mocks.save.mockRejectedValue(new Error("Databaseoppdatering mangler"));
  await openColours();
  fireEvent.click(screen.getByRole("button", { name: "Importer 1 kamp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Databaseoppdatering mangler");
  expect(mocks.close).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: "Syrin" })).toBeChecked();
});
