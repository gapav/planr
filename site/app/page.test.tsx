import { describe, expect, it, vi } from "vitest";
import Home from "./page";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

describe("home page", () => {
  it("takes a normal app visit to sessions", () => {
    Home();

    expect(redirect).toHaveBeenCalledWith("/sessions");
  });
});
