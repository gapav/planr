import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "@/lib/help";
import { HelpHint, HelpTip } from "./help-tip";

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

describe("HelpHint", () => {
  const topic = HELP_TOPICS["media-link"];
  const label = `Hjelp: ${topic.title}`;

  it("reveals the steps on hover and hides them again", () => {
    render(<HelpHint topic="media-link" />);

    const button = screen.getByRole("button", { name: label });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(button.parentElement!);
    expect(within(screen.getByRole("tooltip")).getAllByRole("listitem")).toHaveLength(topic.points.length);

    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the bubble pinned after a click, so touch works too", () => {
    render(<HelpHint topic="media-link" />);

    const button = screen.getByRole("button", { name: label });
    fireEvent.click(button);
    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent(topic.points[0]);

    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
