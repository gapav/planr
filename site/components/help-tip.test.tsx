import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "@/lib/help";
import { HelpTip } from "./help-tip";

describe("HelpTip", () => {
  const topic = HELP_TOPICS["session-day"];

  it("stays out of the way until it is asked for", () => {
    render(<HelpTip topic="session-day" />);

    expect(screen.getByRole("button", { name: `Hjelp: ${topic.title}` })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains the flow, then closes again", () => {
    render(<HelpTip topic="session-day" />);

    fireEvent.click(screen.getByRole("button", { name: `Hjelp: ${topic.title}` }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(topic.intro);
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(topic.points.length);
    expect(dialog).toHaveTextContent(topic.note);

    fireEvent.click(within(dialog).getByRole("button", { name: "Lukk dialogboksen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
